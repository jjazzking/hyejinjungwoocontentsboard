/**
 * 다른 앱에서 공유로 넘어온 링크를 처리한 결과를 알려주는 하단 띠.
 *
 * 공유는 "이걸 저장하고 싶다"는 뜻이 이미 분명하므로 확인을 묻지 않고 바로 저장한다.
 * 대신 AI가 채운 게 마음에 안 들 수 있으니 **수정하기 버튼을 같이 띄운다.**
 * (클립보드 배너는 반대다 — 그건 추측이라 물어보고 시작한다.)
 *
 * state: { status, title?, onEdit? }
 *   'saving'    분석·저장 중
 *   'saved'     저장 완료
 *   'duplicate' 이미 같은 링크의 카드가 있음
 *   'failed'    링크를 못 알아봤거나 저장에 실패함
 */

const TONE = {
  saving: { emoji: '⏳', text: '공유한 링크를 카드로 만드는 중…' },
  saved: { emoji: '✅', text: '저장했어요!' },
  duplicate: { emoji: '📌', text: '이미 저장해둔 링크예요.' },
  failed: { emoji: '⚠️', text: '링크를 카드로 만들지 못했어요.' },
}

export default function ShareToast({ state, onEdit, onDismiss }) {
  if (!state) return null
  const tone = TONE[state.status] ?? TONE.failed

  return (
    <div className="fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl bg-white/95 p-4 shadow-lg ring-1 ring-neutral-900/10 backdrop-blur">
        <span className={`text-2xl ${state.status === 'saving' ? 'animate-pulse' : ''}`}>
          {tone.emoji}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-neutral-900">{tone.text}</p>
          {state.title && <p className="truncate text-xs text-neutral-400">{state.title}</p>}
        </div>

        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 rounded-full bg-rose-400 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-rose-500"
          >
            수정하기
          </button>
        )}

        {state.status !== 'saving' && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="닫기"
            className="shrink-0 rounded-full px-2 py-1 text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
