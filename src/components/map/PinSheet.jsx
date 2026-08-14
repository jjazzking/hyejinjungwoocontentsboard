import { useEffect } from 'react'
import ContentCard from '../ContentCard.jsx'

/**
 * 핀을 눌렀을 때 올라오는 시트 — 안에 **실제 카드를 그대로** 보여준다.
 *
 * 예전엔 제목·날짜만 있는 작은 줄이었는데, 폰에서 그것만 봐서는
 * "이게 뭐였더라"가 해결되지 않았다. 사진·임베드·메모·태그가 다 필요하다.
 *
 * 지도 안이 아니라 **화면 전체 기준(fixed)** 으로 띄운다. 지도 컨테이너는
 * `overflow-hidden`이라 그 안에 두면 잘리고, 지도 높이가 320px뿐이라
 * 카드를 얹을 자리도 안 나온다.
 *
 * 폰에서는 아래에서 올라오는 시트, 넓은 화면에서는 가운데 뜨는 창이다.
 */
export default function PinSheet({ pin, onEdit, onClose }) {
  // 시트가 떠 있는 동안 뒤 배경이 스크롤되면 화면이 따로 논다
  useEffect(() => {
    if (!pin) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [pin, onClose])

  if (!pin) return null

  const { content, place, color } = pin
  const isCompleted = content.status === 'COMPLETED'

  return (
    <>
      <div
        className="fixed inset-0 z-[1100] bg-neutral-900/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${place.name} · ${content.title}`}
        className="fixed inset-x-0 bottom-0 z-[1101] flex max-h-[85vh] flex-col rounded-t-3xl bg-white shadow-2xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
      >
        {/* 폰에서 시트를 잡아 내리는 느낌을 주는 손잡이 (장식) */}
        <div className="flex justify-center pt-2.5 sm:hidden">
          <span aria-hidden="true" className="h-1 w-10 rounded-full bg-neutral-200" />
        </div>

        {/* 어느 핀을 눌렀는지 — 장소 이름은 카드가 아니라 여기서 보여준다 */}
        <div className="flex items-start gap-2 border-b border-neutral-900/5 px-4 py-3">
          <span
            aria-hidden="true"
            className="mt-1 h-3 w-3 shrink-0 rounded-full ring-1 ring-white"
            style={{ background: isCompleted ? color : '#fff', boxShadow: `0 0 0 2.5px ${color}` }}
          />
          {/* 주소는 아래 카드가 이미 보여주므로 여기서는 이름만 (한 카드에 장소가
              여러 개일 때 어느 핀을 눌렀는지 알려주는 게 이 줄의 역할이다) */}
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900">
            📍 {place.name}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-1 shrink-0 rounded-full px-2 py-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
          >
            ✕
          </button>
        </div>

        {/* 목록에 있는 것과 똑같은 카드. 시트 안에서는 여백·테두리만 걷어낸다 */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 [&>article]:mb-0 [&>article]:shadow-none [&>article]:ring-0">
          {/* 시트 자체가 수정 버튼을 갖고 있으니 카드 위의 액션은 끈다 */}
          <ContentCard content={content} showActions={false} />
        </div>

        <div className="flex gap-2 border-t border-neutral-900/5 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {place.url && (
            <a
              href={place.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-neutral-100 px-3.5 py-2 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-200"
            >
              지도에서 보기 ↗
            </a>
          )}
          <button
            type="button"
            onClick={() => onEdit?.(content)}
            className="rounded-full bg-rose-400 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-rose-500"
          >
            ✏️ 카드 수정
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-full px-3.5 py-2 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100"
          >
            닫기
          </button>
        </div>
      </div>
    </>
  )
}
