import { useMemo } from 'react'
import { isSupabaseConfigured } from '../lib/supabaseClient.js'
import useBulkRun from '../hooks/useBulkRun.js'
import { fetchCaptionOnly, needsCaption } from '../utils/linkAnalyzer.js'
import BulkRunStatus from './BulkRunStatus.jsx'

/**
 * 원문 캡션이 없는 카드들에 게시물 원문만 뒤늦게 채워 넣는 버튼 (백필).
 *
 * 링크 재분석(BulkAnalyzeButton)과 대상도 목적도 다르다.
 *   - 재분석 : 내용이 **안 채워진** 카드 → 제목·메모·장소를 AI로 만든다
 *   - 이 버튼: 캡션이 **없는** 카드 → 원문만 저장한다. 잘 분석된 카드도 대상이다
 * 그래서 **제목·메모·태그·장소는 절대 건드리지 않는다.** 패치에 caption 하나만 담는다.
 *
 * 캡션 원문을 남겨 두는 이유는, 게시물이 지워지거나 비공개로 바뀌면 두 번 다시 못 구하는
 * 값이기 때문이다. 나중에 새 필드를 뽑거나 다시 분석할 때 인스타를 또 긁지 않아도 된다.
 * Claude는 부르지 않으므로(caption_only) AI 비용은 0이고, 느린 쪽은 인스타 수집이다.
 */

// 진행 상황 저장 키 — 재분석과 따로 남겨야 둘이 서로의 진행을 밟지 않는다
const RUN_KEY = 'couple-contents-board:bulk-caption'

export default function BulkCaptionButton({ contents, onUpdate, onOpenCard }) {
  const targets = useMemo(() => contents.filter(needsCaption), [contents])

  // 카드 한 장: 원문 캡션만 받아 온다. 다른 필드는 손대지 않는다.
  const runOne = async (content) => {
    const got = await fetchCaptionOnly(content.reference_url)
    if (!got) return { error: 'AI 분석이 설정되어 있지 않아요' }
    if (got.failed) return { error: [got.failed, got.detail].filter(Boolean).join(' — ') }
    return { patch: { caption: got.caption } }
  }

  const { progress, result, start, stop, dismiss } = useBulkRun({
    runKey: RUN_KEY,
    targets,
    contents,
    isTarget: needsCaption,
    runOne,
    onUpdate,
    enabled: isSupabaseConfigured,
  })

  if (!isSupabaseConfigured) return null
  if (targets.length === 0 && !progress && !result) return null

  if (progress || result) {
    return (
      <BulkRunStatus
        progress={progress}
        result={result}
        onStop={stop}
        onDismiss={dismiss}
        onOpenCard={onOpenCard}
        tone="amber"
        icon="📝"
        runningLabel="원문 수집 중"
        note="카드 하나에 1분 넘게 걸릴 수 있어요. 중간에 끊겨도 다시 열면 남은 것부터 이어서 해요."
        summary={(r) => `${r.filled}개 카드에 원문을 저장했어요`}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={start}
      title="게시물 원문(캡션)을 카드에 보관해 둬요. 나중에 다시 분석할 때 인스타를 또 긁지 않아도 돼요"
      className="mt-3 rounded-full bg-white px-3.5 py-1.5 text-xs font-medium text-neutral-600 shadow-sm ring-1 ring-neutral-900/10 transition-colors hover:bg-neutral-50"
    >
      📝 원문 없는 카드 {targets.length}개 수집
    </button>
  )
}
