import { useEffect, useMemo } from 'react'
import { isSupabaseConfigured } from '../lib/supabaseClient.js'
import useBulkRun from '../hooks/useBulkRun.js'
import { analyzeLink, mergeReanalysis, needsReanalysis } from '../utils/linkAnalyzer.js'
import BulkRunStatus from './BulkRunStatus.jsx'

/**
 * 아직 분석이 안 된 카드들을 한 번에 다시 분석하는 버튼.
 *
 * - 대상: 링크는 있는데 제목이 대체 제목 그대로이거나 장소·메모가 둘 다 빈 카드
 *   (사용자가 직접 채운 카드는 건드리지 않는다 — needsReanalysis 참고)
 * - 한 장씩 순서대로 돌린다. Edge Function이 인스타 수집까지 가면 카드당 1분이 넘을 수 있어
 *   동시에 던지면 함수도 Apify 크레딧도 감당이 안 된다.
 *
 * 끊겨도 이어서 도는 장치(Wake Lock · 진행 위치 저장 · 자동 재개)는 useBulkRun에 있다.
 */

// 진행 상황 저장 키 — 브라우저(사람)마다 따로 남는다
const RUN_KEY = 'couple-contents-board:bulk-analyze'

export default function BulkAnalyzeButton({ contents, categories, onUpdate, onOpenCard, onBusyChange }) {
  const targets = useMemo(() => contents.filter(needsReanalysis), [contents])

  // 카드 한 장: 링크를 다시 분석해서, 사용자가 손댄 값은 남기고 빈 칸만 채우는 패치를 만든다
  const runOne = async (content) => {
    const draft = await analyzeLink(content.reference_url, categories)
    if (!draft?.analyzed) return { error: draft?.analysis_note || '이유를 알 수 없어요' }
    return { patch: mergeReanalysis(content, draft) }
  }

  const { progress, result, start, stop, dismiss } = useBulkRun({
    runKey: RUN_KEY,
    targets,
    contents,
    isTarget: needsReanalysis,
    runOne,
    onUpdate,
    enabled: isSupabaseConfigured,
  })


  // 패널이 닫혀 있어도 톱니바퀴에 '도는 중' 표시가 뜨도록 위로 알린다
  useEffect(() => {
    onBusyChange?.(Boolean(progress))
  }, [progress, onBusyChange])

  if (!isSupabaseConfigured) return null

  if (progress || result) {
    return (
      <BulkRunStatus
        progress={progress}
        result={result}
        onStop={stop}
        onDismiss={dismiss}
        onOpenCard={onOpenCard}
        tone="rose"
        icon="🤖"
        runningLabel="분석 중"
        note="카드 하나에 1분 넘게 걸릴 수 있어요. 중간에 끊겨도 다시 열면 남은 것부터 이어서 해요."
        summary={(r) =>
          `${r.filled}개 채웠어요${r.unchanged > 0 ? ` · ${r.unchanged}개는 새로 채울 게 없었어요` : ''}`
        }
      />
    )
  }

  // 설정 메뉴 안에서는 대상이 없어도 숨기지 않고 비활성으로 보여준다 —
  // 메뉴를 열었는데 항목이 사라져 있으면 기능이 있는지조차 알 수 없다
  const empty = targets.length === 0
  return (
    <button
      type="button"
      onClick={start}
      disabled={empty}
      title="링크만 있고 내용이 안 채워진 카드들을 한 번에 다시 분석해요"
      className={`mt-2 w-full rounded-full px-3.5 py-1.5 text-xs font-medium shadow-sm ring-1 transition-colors ${
        empty
          ? 'cursor-not-allowed bg-neutral-50 text-neutral-400 ring-neutral-900/5'
          : 'bg-white text-neutral-600 ring-neutral-900/10 hover:bg-neutral-50'
      }`}
    >
      {empty ? '🤖 다시 분석할 카드 없음' : `🤖 분석 안 된 카드 ${targets.length}개 다시 분석`}
    </button>
  )
}
