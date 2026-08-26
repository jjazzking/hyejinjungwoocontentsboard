/**
 * 일괄 작업(링크 재분석 · 캡션 백필)의 진행·결과 표시.
 *
 * 두 작업이 같은 실행기(useBulkRun)를 쓰므로 보여줄 것도 같다 —
 * 도는 중에는 진행률과 '중단', 끝나면 요약과 실패 사유 목록.
 * **실패한 카드는 이름을 눌러 바로 열 수 있게 둔다** (왜 실패했는지 카드를 봐야 알 수 있다).
 */

// Tailwind는 문자열을 조립해 만든 클래스를 못 알아보므로 색깔은 통째로 적어 둔다
const TONE = {
  rose: 'border-rose-200 bg-rose-50/60',
  amber: 'border-amber-200 bg-amber-50/60',
}

export default function BulkRunStatus({
  progress,
  result,
  onStop,
  onDismiss,
  onOpenCard,
  tone = 'rose',
  icon,
  runningLabel,
  note,
  summary,
}) {
  if (progress) {
    return (
      <div
        className={`mt-3 rounded-xl border px-3 py-2 text-left text-xs text-neutral-700 ${TONE[tone]}`}
      >
        <div className="flex items-center justify-between gap-3">
          <span>
            {icon} {progress.done + 1}/{progress.total} {runningLabel} —{' '}
            <span className="text-neutral-500">{progress.current}</span>
          </span>
          <button
            type="button"
            onClick={onStop}
            className="shrink-0 rounded-full px-2 py-1 font-medium text-neutral-500 transition-colors hover:bg-white hover:text-neutral-700"
          >
            중단
          </button>
        </div>
        {note && <p className="mt-1 text-[11px] text-neutral-500">{note}</p>}
      </div>
    )
  }

  if (!result) return null

  return (
    <div className="mt-3 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left text-xs text-neutral-700">
      <div className="flex items-start justify-between gap-3">
        <p>
          {result.stopped && '중단했어요 — '}
          {summary(result)}
          {result.failures.length > 0 && ` · ${result.failures.length}개 실패`}
          {result.stopped && result.remaining > 0 && ` · ${result.remaining}개 남음`}
        </p>
        <button
          type="button"
          onClick={onDismiss}
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
