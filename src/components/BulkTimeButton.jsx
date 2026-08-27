import { useEffect, useMemo, useRef, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabaseClient.js'
import { analyzeTimeSlots } from '../utils/analyzeTimeSlots.js'
import { needsTimeAnalysis } from '../utils/timeSlots.js'

/**
 * 카드들의 '가기 좋은 시간대'를 한 번에 채우는 버튼.
 *
 * 링크 재분석(BulkAnalyzeButton)과 달리 게시물을 다시 수집하지 않고,
 * 이미 카드에 있는 제목·메모·태그·장소만 보고 판단한다. 그래서 카드 20장을
 * 한 번의 호출로 묶어 보낼 수 있고, 100장이어도 몇 초면 끝난다.
 * (링크 재분석은 카드당 1분이 넘을 수 있어 한 장씩 돌리고 재개 장치까지 두지만,
 *  이쪽은 그럴 필요가 없어 단순하게 둔다.)
 *
 * 시간대는 장소마다 붙으므로 카드 기본값뿐 아니라 **장소별 시간대까지** 채운다.
 * 카드 단위로만 채워 둔 옛 카드도 그래서 다시 대상이 된다.
 *
 * - 아직 못 채운 곳이 남은 카드가 있으면 그 카드들만
 * - 전부 채워져 있으면 '전체 다시 분석'으로 바뀐다 (사람이 고친 값도 덮으므로 한 번 확인)
 */
export default function BulkTimeButton({ contents, onUpdate, onBusyChange }) {
  // 진행 상태: null(대기) | { done, total }
  const [progress, setProgress] = useState(null)
  // 끝난 뒤 요약: null | { filled, failed, detail }
  const [result, setResult] = useState(null)
  const runningRef = useRef(false)

  const pending = useMemo(() => contents.filter(needsTimeAnalysis), [contents])

  // 패널이 닫혀 있어도 톱니바퀴에 '도는 중' 표시가 뜨도록 위로 알린다
  useEffect(() => {
    onBusyChange?.(Boolean(progress))
  }, [progress, onBusyChange])

  if (!isSupabaseConfigured) return null

  const rescan = pending.length === 0
  const targets = rescan ? contents : pending

  const start = async () => {
    if (runningRef.current || targets.length === 0) return
    if (
      rescan &&
      !window.confirm(
        `카드 ${targets.length}개의 시간대를 전부 다시 분석할까요?\n직접 고쳐둔 값도 덮어써요.`,
      )
    ) {
      return
    }

    runningRef.current = true
    setResult(null)
    setProgress({ done: 0, total: targets.length })
    const { patches, failed, detail } = await analyzeTimeSlots(targets, (done, total) =>
      setProgress({ done, total }),
    )
    // 카드를 한 장씩 저장한다 — 링크 재분석과 같은 방식이라 실시간 동기화도 그대로 탄다
    for (const { id, ...patch } of patches) onUpdate(id, patch)
    runningRef.current = false
    setProgress(null)
    setResult({ filled: patches.length, failed, detail })
  }

  if (progress) {
    return (
      <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/60 px-3 py-2 text-left text-xs text-neutral-700">
        🕐 {progress.done}/{progress.total} 시간대 분석 중…
      </div>
    )
  }

  if (result) {
    return (
      <div className="mt-3 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left text-xs text-neutral-700">
        <div className="flex items-start justify-between gap-3">
          <p>
            {result.filled > 0 ? `${result.filled}개 카드에 시간대를 채웠어요` : '시간대를 채우지 못했어요'}
            {result.failed > 0 && ` · ${result.failed}개는 판단하지 못했어요`}
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
        {result.detail && <p className="mt-1 text-[11px] text-neutral-500">{result.detail}</p>}
      </div>
    )
  }

  // 카드가 하나도 없을 때만 비활성 (그 외에는 '전체 다시 분석'이라도 할 수 있다)
  const empty = targets.length === 0
  return (
    <button
      type="button"
      onClick={start}
      disabled={empty}
      title="카드의 제목·메모·장소를 보고 장소마다 가기 좋은 시간대를 AI가 채워줘요"
      className={`mt-2 w-full rounded-full px-3.5 py-1.5 text-xs font-medium shadow-sm ring-1 transition-colors ${
        empty
          ? 'cursor-not-allowed bg-neutral-50 text-neutral-400 ring-neutral-900/5'
          : 'bg-white text-neutral-600 ring-neutral-900/10 hover:bg-neutral-50'
      }`}
    >
      {empty
        ? '🕐 시간대 분석할 카드 없음'
        : rescan
          ? `🕐 시간대 전체 다시 분석 (${targets.length}개)`
          : `🕐 시간대 안 채운 카드 ${targets.length}개 분석`}
    </button>
  )
}
