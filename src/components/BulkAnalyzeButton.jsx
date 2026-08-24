import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabaseClient.js'
import { analyzeLink, mergeReanalysis, needsReanalysis } from '../utils/linkAnalyzer.js'

/**
 * 아직 분석이 안 된 카드들을 한 번에 다시 분석하는 버튼.
 *
 * - 대상: 링크는 있는데 제목이 대체 제목 그대로이거나 장소·메모가 둘 다 빈 카드
 *   (사용자가 직접 채운 카드는 건드리지 않는다 — needsReanalysis 참고)
 * - 한 장씩 순서대로 돌린다. Edge Function이 인스타 수집까지 가면 카드당 1분이 넘을 수 있어
 *   동시에 던지면 함수도 Apify 크레딧도 감당이 안 된다.
 *
 * 백그라운드 대응 — 브라우저는 안 보이는 탭의 JS를 멈추거나 아예 버릴 수 있어서
 * "절대 안 끊김"은 만들 수 없다. 그래서 끊기지 않게 막는 대신 **끊겨도 이어지게** 만든다:
 *   1) Wake Lock으로 화면이 꺼지지 않게 잡는다 (끊기는 가장 흔한 원인이 자동 잠금)
 *   2) 진행 위치를 localStorage에 매 장마다 남긴다
 *   3) 화면이 돌아오거나 앱을 다시 열면 남은 카드부터 자동으로 이어서 돌린다
 *   4) 도는 중에 탭을 닫으려 하면 브라우저 경고를 띄운다
 */

// 진행 상황 저장 키 — 브라우저(사람)마다 따로 남는다
const RUN_KEY = 'couple-contents-board:bulk-analyze'

function loadRun() {
  try {
    const raw = localStorage.getItem(RUN_KEY)
    const run = raw ? JSON.parse(raw) : null
    return Array.isArray(run?.ids) ? run : null
  } catch {
    return null
  }
}

function saveRun(run) {
  try {
    if (run) localStorage.setItem(RUN_KEY, JSON.stringify(run))
    else localStorage.removeItem(RUN_KEY)
  } catch {
    // 저장 공간 문제로 실패해도 이번 실행 자체는 계속 돌아간다 (재개만 못 할 뿐)
  }
}

export default function BulkAnalyzeButton({ contents, categories, onUpdate, onOpenCard }) {
  // 진행 상태: null(대기) | { done, total, current }
  const [progress, setProgress] = useState(null)
  // 끝난 뒤 요약: null | { filled, unchanged, failures, stopped }
  const [result, setResult] = useState(null)

  const runningRef = useRef(false)
  const cancelRef = useRef(false)
  const wakeLockRef = useRef(null)
  // 루프가 도는 도중에도 항상 최신 값을 읽도록 ref로 들고 간다.
  // 특히 카드 목록은 매 장마다 새로 찾아야, 도는 동안 사용자가 고친 내용을 덮어쓰지 않는다.
  const contentsRef = useRef(contents)
  const categoriesRef = useRef(categories)
  const updateRef = useRef(onUpdate)
  contentsRef.current = contents
  categoriesRef.current = categories
  updateRef.current = onUpdate

  const targets = useMemo(() => contents.filter(needsReanalysis), [contents])

  // 화면이 꺼져 백그라운드로 넘어가는 걸 막는다. 미지원 브라우저면 조용히 넘어간다.
  const holdScreen = useCallback(async () => {
    try {
      if ('wakeLock' in navigator && !wakeLockRef.current) {
        wakeLockRef.current = await navigator.wakeLock.request('screen')
        wakeLockRef.current.addEventListener?.('release', () => {
          wakeLockRef.current = null
        })
      }
    } catch {
      // 권한 거부·미지원 — 재분석 자체는 그대로 진행한다
    }
  }, [])

  const releaseScreen = useCallback(() => {
    try {
      wakeLockRef.current?.release()
    } catch {
      // 이미 해제된 경우
    }
    wakeLockRef.current = null
  }, [])

  /** 저장된 진행 상태(run)를 이어서 끝까지 돌린다. */
  const execute = useCallback(
    async (initial) => {
      if (runningRef.current) return
      runningRef.current = true
      cancelRef.current = false
      setResult(null)
      await holdScreen()

      let state = initial
      try {
        while (state.index < state.ids.length && !cancelRef.current) {
          const content = contentsRef.current.find((c) => c.id === state.ids[state.index])
          // 도는 사이에 지워졌거나 이미 다른 곳에서 채워진 카드는 건너뛴다
          if (!content || !needsReanalysis(content)) {
            state = { ...state, index: state.index + 1 }
            saveRun(state)
            continue
          }

          setProgress({ done: state.index, total: state.ids.length, current: content.title })

          let draft
          try {
            draft = await analyzeLink(content.reference_url, categoriesRef.current)
          } catch (err) {
            state = {
              ...state,
              index: state.index + 1,
              failures: [
                ...state.failures,
                { id: content.id, title: content.title, reason: err?.message ?? '알 수 없는 오류' },
              ],
            }
            saveRun(state)
            continue
          }
          if (cancelRef.current) break

          if (!draft?.analyzed) {
            state = {
              ...state,
              index: state.index + 1,
              failures: [
                ...state.failures,
                { id: content.id, title: content.title, reason: draft?.analysis_note || '이유를 알 수 없어요' },
              ],
            }
          } else {
            const patch = mergeReanalysis(content, draft)
            if (Object.keys(patch).length === 0) {
              state = { ...state, index: state.index + 1, unchanged: state.unchanged + 1 }
            } else {
              updateRef.current(content.id, patch)
              state = { ...state, index: state.index + 1, filled: state.filled + 1 }
            }
          }
          saveRun(state)
        }
      } finally {
        runningRef.current = false
        releaseScreen()
      }

      setProgress(null)
      const stopped = cancelRef.current
      // 저장된 진행 상태는 항상 지운다. 남겨 두면 사용자가 '중단'을 눌러도
      // 나중에 자동 재개가 걸려서 멋대로 다시 도는 꼴이 된다.
      // 중단해도 손해는 없다 — 대상은 카드 상태에서 매번 새로 계산하므로
      // 버튼을 다시 누르면 남은 카드만 다시 잡힌다.
      saveRun(null)
      setResult({
        filled: state.filled,
        unchanged: state.unchanged,
        failures: state.failures,
        stopped,
        remaining: state.ids.length - state.index,
      })
    },
    [holdScreen, releaseScreen],
  )

  // 앱을 다시 열었을 때(또는 탭이 버려졌다 살아났을 때) 남은 카드부터 자동으로 이어서 돈다.
  // 카드 목록이 아직 안 왔으면 기다렸다가 시작한다.
  useEffect(() => {
    // 훅은 아래쪽 이른 return보다 먼저 돌기 때문에 여기서도 모드를 확인해야 한다.
    // AI 분석은 Edge Function이 있어야 하므로 localStorage 모드에서는 재개하지 않는다.
    if (!isSupabaseConfigured || runningRef.current || contents.length === 0) return
    const saved = loadRun()
    if (saved && saved.index < saved.ids.length) execute(saved)
  }, [contents.length, execute])

  // 화면이 돌아오면 Wake Lock을 다시 잡고, 그 사이 멈춰 있었으면 이어서 돌린다
  useEffect(() => {
    if (!isSupabaseConfigured) return
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const saved = loadRun()
      if (!saved || saved.index >= saved.ids.length) return
      if (runningRef.current) holdScreen()
      else execute(saved)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [execute, holdScreen])

  // 도는 중에 탭을 닫으려 하면 브라우저가 확인창을 띄운다
  useEffect(() => {
    if (!progress) return
    const warn = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [progress])

  // 컴포넌트가 사라질 때 화면 잡기는 반드시 풀어준다
  useEffect(() => releaseScreen, [releaseScreen])

  if (!isSupabaseConfigured) return null
  if (targets.length === 0 && !progress && !result) return null

  const start = () => {
    const run = { ids: targets.map((c) => c.id), index: 0, filled: 0, unchanged: 0, failures: [] }
    saveRun(run)
    execute(run)
  }

  const stop = () => {
    cancelRef.current = true
    // 자동 재개가 걸리지 않도록 저장된 진행 상태를 바로 지운다
    // (루프가 다음 카드로 넘어가기 전에 눌렀을 수도 있다)
    saveRun(null)
  }

  if (progress) {
    return (
      <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-2 text-left text-xs text-neutral-700">
        <div className="flex items-center justify-between gap-3">
          <span>
            🤖 {progress.done + 1}/{progress.total} 분석 중 —{' '}
            <span className="text-neutral-500">{progress.current}</span>
          </span>
          <button
            type="button"
            onClick={stop}
            className="shrink-0 rounded-full px-2 py-1 font-medium text-neutral-500 transition-colors hover:bg-white hover:text-neutral-700"
          >
            중단
          </button>
        </div>
        <p className="mt-1 text-[11px] text-neutral-500">
          카드 하나에 1분 넘게 걸릴 수 있어요. 중간에 끊겨도 다시 열면 남은 것부터 이어서 해요.
        </p>
      </div>
    )
  }

  if (result) {
    return (
      <div className="mt-3 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left text-xs text-neutral-700">
        <div className="flex items-start justify-between gap-3">
          <p>
            {result.stopped && '중단했어요 — '}
            {result.filled}개 채웠어요
            {result.unchanged > 0 && ` · ${result.unchanged}개는 새로 채울 게 없었어요`}
            {result.failures.length > 0 && ` · ${result.failures.length}개 실패`}
            {result.stopped && result.remaining > 0 && ` · ${result.remaining}개 남음`}
          </p>
          <button
            type="button"
            onClick={() => setResult(null)}
            aria-label="결과 닫기"
            className="shrink-0 rounded-full px-2 py-0.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
          >
            ✕
          </button>
        </div>
        {/* 왜 실패했는지 화면에 그대로 남긴다 — 로그를 열지 않아도 알 수 있게 */}
        {result.failures.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 border-t border-neutral-100 pt-2">
            {result.failures.map((failure, i) => (
              <li key={i} className="text-[11px] leading-relaxed text-neutral-500">
                {/* 이름을 누르면 그 카드를 그대로 펼친다 (수정 폼이 아니라 풀 카드) */}
                <button
                  type="button"
                  onClick={() => onOpenCard?.(failure.id)}
                  className="font-medium text-neutral-700 underline-offset-2 transition-colors hover:text-rose-500 hover:underline"
                >
                  {failure.title}
                </button>{' '}
                — {failure.reason}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={start}
      title="링크만 있고 내용이 안 채워진 카드들을 한 번에 다시 분석해요"
      className="mt-3 rounded-full bg-white px-3.5 py-1.5 text-xs font-medium text-neutral-600 shadow-sm ring-1 ring-neutral-900/10 transition-colors hover:bg-neutral-50"
    >
      🤖 분석 안 된 카드 {targets.length}개 다시 분석
    </button>
  )
}
