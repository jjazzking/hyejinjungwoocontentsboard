import { useMemo, useRef, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabaseClient.js'
import { analyzeLink, mergeReanalysis, needsReanalysis } from '../utils/linkAnalyzer.js'

/**
 * 아직 분석이 안 된 카드들을 한 번에 다시 분석하는 버튼.
 *
 * - 대상: 링크는 있는데 제목이 대체 제목 그대로이거나 장소·메모가 둘 다 빈 카드
 *   (사용자가 직접 채운 카드는 건드리지 않는다 — needsReanalysis 참고)
 * - 한 장씩 순서대로 돌린다. Edge Function이 인스타 수집까지 가면 카드당 1분이 넘을 수 있어
 *   동시에 던지면 함수도 Apify 크레딧도 감당이 안 된다.
 * - 결과는 성공/실패 개수와 **실패 사유**까지 화면에 남긴다.
 * - AI 분석은 Edge Function이 있어야 하므로 localStorage 모드에서는 아예 나오지 않는다.
 */
export default function BulkAnalyzeButton({ contents, categories, onUpdate }) {
  // 진행 상태: null(대기) | { done, total, current }
  const [progress, setProgress] = useState(null)
  // 끝난 뒤 요약: null | { filled, unchanged, failures: [{ title, reason }] }
  const [result, setResult] = useState(null)
  const cancelRef = useRef(false)

  const targets = useMemo(() => contents.filter(needsReanalysis), [contents])

  if (!isSupabaseConfigured) return null
  if (targets.length === 0 && !progress && !result) return null

  const run = async () => {
    cancelRef.current = false
    setResult(null)
    const queue = targets
    const failures = []
    let filled = 0
    let unchanged = 0

    for (const [index, content] of queue.entries()) {
      if (cancelRef.current) break
      setProgress({ done: index, total: queue.length, current: content.title })

      let draft
      try {
        draft = await analyzeLink(content.reference_url, categories)
      } catch (err) {
        failures.push({ title: content.title, reason: err?.message ?? '알 수 없는 오류' })
        continue
      }
      if (cancelRef.current) break

      if (!draft?.analyzed) {
        failures.push({ title: content.title, reason: draft?.analysis_note || '이유를 알 수 없어요' })
        continue
      }
      const patch = mergeReanalysis(content, draft)
      if (Object.keys(patch).length === 0) {
        unchanged += 1
        continue
      }
      onUpdate(content.id, patch)
      filled += 1
    }

    setProgress(null)
    setResult({ filled, unchanged, failures, stopped: cancelRef.current })
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
            onClick={() => {
              cancelRef.current = true
            }}
            className="shrink-0 rounded-full px-2 py-1 font-medium text-neutral-500 transition-colors hover:bg-white hover:text-neutral-700"
          >
            중단
          </button>
        </div>
        <p className="mt-1 text-[11px] text-neutral-500">
          카드 하나에 1분 넘게 걸릴 수 있어요. 이 화면을 켜 둔 채로 두세요.
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
                <span className="font-medium text-neutral-700">{failure.title}</span> — {failure.reason}
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
      onClick={run}
      title="링크만 있고 내용이 안 채워진 카드들을 한 번에 다시 분석해요"
      className="mt-3 rounded-full bg-white px-3.5 py-1.5 text-xs font-medium text-neutral-600 shadow-sm ring-1 ring-neutral-900/10 transition-colors hover:bg-neutral-50"
    >
      🤖 분석 안 된 카드 {targets.length}개 다시 분석
    </button>
  )
}
