import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 카드를 한 장씩, 오래 걸리는 작업에 태우는 공용 실행기.
 *
 * 게시물을 다시 수집하는 작업(링크 재분석·캡션 백필)은 카드당 1분이 넘을 수 있어
 * 동시에 던지면 Edge Function도 Apify 크레딧도 감당이 안 된다. 그래서 순서대로 한 장씩
 * 돌리고, 그만큼 오래 걸리니 중간에 끊기는 걸 전제로 만든다.
 *
 * 백그라운드 대응 — 브라우저는 안 보이는 탭의 JS를 멈추거나 아예 버릴 수 있어서
 * "절대 안 끊김"은 만들 수 없다. 그래서 끊기지 않게 막는 대신 **끊겨도 이어지게** 만든다:
 *   1) Wake Lock으로 화면이 꺼지지 않게 잡는다 (끊기는 가장 흔한 원인이 자동 잠금)
 *   2) 진행 위치를 localStorage에 매 장마다 남긴다
 *   3) 화면이 돌아오거나 앱을 다시 열면 남은 카드부터 자동으로 이어서 돌린다
 *   4) 도는 중에 탭을 닫으려 하면 브라우저 경고를 띄운다
 *
 * 작업마다 다른 건 "대상을 어떻게 고르나(isTarget)"와 "한 장에 뭘 하나(runOne)" 둘뿐이라
 * 그 둘만 받고 나머지는 여기서 처리한다.
 *
 * @param runKey   진행 상태를 남길 localStorage 키 (작업마다 달라야 서로 안 밟는다)
 * @param targets  이번에 돌릴 카드 목록
 * @param contents 전체 카드 (도는 도중에도 최신 값을 다시 찾기 위해 받는다)
 * @param isTarget 도는 사이에 다른 곳에서 이미 채워졌는지 매 장마다 다시 확인하는 함수
 * @param runOne   카드 한 장을 처리한다. `{ patch }` 또는 `{ error: '사유' }`를 돌려준다.
 *                 patch가 빈 객체면 '바뀐 게 없음'으로 센다.
 * @param onUpdate 저장 함수 (id, patch)
 * @param enabled  false면 아무것도 하지 않는다 (localStorage 모드 등)
 */
export default function useBulkRun({
  runKey,
  targets,
  contents,
  isTarget,
  runOne,
  onUpdate,
  enabled = true,
}) {
  // 진행 상태: null(대기) | { done, total, current }
  const [progress, setProgress] = useState(null)
  // 끝난 뒤 요약: null | { filled, unchanged, failures, stopped, remaining }
  const [result, setResult] = useState(null)

  const runningRef = useRef(false)
  const cancelRef = useRef(false)
  const wakeLockRef = useRef(null)

  // 루프가 도는 도중에도 항상 최신 값을 읽도록 ref로 들고 간다.
  // 특히 카드 목록은 매 장마다 새로 찾아야, 도는 동안 사용자가 고친 내용을 덮어쓰지 않는다.
  const contentsRef = useRef(contents)
  const isTargetRef = useRef(isTarget)
  const runOneRef = useRef(runOne)
  const updateRef = useRef(onUpdate)
  contentsRef.current = contents
  isTargetRef.current = isTarget
  runOneRef.current = runOne
  updateRef.current = onUpdate

  const loadRun = useCallback(() => {
    try {
      const raw = localStorage.getItem(runKey)
      const run = raw ? JSON.parse(raw) : null
      return Array.isArray(run?.ids) ? run : null
    } catch {
      return null
    }
  }, [runKey])

  const saveRun = useCallback(
    (run) => {
      try {
        if (run) localStorage.setItem(runKey, JSON.stringify(run))
        else localStorage.removeItem(runKey)
      } catch {
        // 저장 공간 문제로 실패해도 이번 실행 자체는 계속 돌아간다 (재개만 못 할 뿐)
      }
    },
    [runKey],
  )

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
      // 권한 거부·미지원 — 작업 자체는 그대로 진행한다
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
          if (!content || !isTargetRef.current(content)) {
            state = { ...state, index: state.index + 1 }
            saveRun(state)
            continue
          }

          setProgress({ done: state.index, total: state.ids.length, current: content.title })

          let outcome
          try {
            outcome = await runOneRef.current(content)
          } catch (err) {
            outcome = { error: err?.message ?? '알 수 없는 오류' }
          }
          if (cancelRef.current) break

          if (outcome?.error) {
            state = {
              ...state,
              index: state.index + 1,
              failures: [
                ...state.failures,
                { id: content.id, title: content.title, reason: outcome.error },
              ],
            }
          } else if (!outcome?.patch || Object.keys(outcome.patch).length === 0) {
            state = { ...state, index: state.index + 1, unchanged: state.unchanged + 1 }
          } else {
            updateRef.current(content.id, outcome.patch)
            state = { ...state, index: state.index + 1, filled: state.filled + 1 }
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
    [holdScreen, releaseScreen, saveRun],
  )

  // 앱을 다시 열었을 때(또는 탭이 버려졌다 살아났을 때) 남은 카드부터 자동으로 이어서 돈다.
  // 카드 목록이 아직 안 왔으면 기다렸다가 시작한다.
  useEffect(() => {
    if (!enabled || runningRef.current || contents.length === 0) return
    const saved = loadRun()
    if (saved && saved.index < saved.ids.length) execute(saved)
  }, [enabled, contents.length, execute, loadRun])

  // 화면이 돌아오면 Wake Lock을 다시 잡고, 그 사이 멈춰 있었으면 이어서 돌린다
  useEffect(() => {
    if (!enabled) return
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const saved = loadRun()
      if (!saved || saved.index >= saved.ids.length) return
      if (runningRef.current) holdScreen()
      else execute(saved)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [enabled, execute, holdScreen, loadRun])

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

  const start = useCallback(() => {
    const run = { ids: targets.map((c) => c.id), index: 0, filled: 0, unchanged: 0, failures: [] }
    saveRun(run)
    execute(run)
  }, [targets, saveRun, execute])

  const stop = useCallback(() => {
    cancelRef.current = true
    // 자동 재개가 걸리지 않도록 저장된 진행 상태를 바로 지운다
    // (루프가 다음 카드로 넘어가기 전에 눌렀을 수도 있다)
    saveRun(null)
  }, [saveRun])

  return { progress, result, start, stop, dismiss: () => setResult(null) }
}
