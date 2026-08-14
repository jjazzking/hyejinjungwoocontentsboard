import { useEffect } from 'react'
import ContentCard from './ContentCard.jsx'

/**
 * 풀 카드 시트 — 축약 카드를 눌렀을 때 올라오는 **원래 크기의 카드**.
 *
 * 목록도 지도도 이제 축약형으로 훑고, 자세히 볼 때만 이걸 연다.
 * 두 곳에서 같은 시트를 쓰기 때문에 어디서 열든 보이는 게 똑같다.
 *
 * 화면 전체 기준(fixed)으로 띄운다 — 지도 컨테이너는 `overflow-hidden`이라
 * 그 안에 두면 잘리고, 목록 쪽에서도 카드 폭에 갇히면 안 된다.
 * 폰에서는 아래에서 올라오는 시트, 넓은 화면에서는 가운데 뜨는 창이다.
 *
 * place: 지도에서 열었을 때만 넘어온다 (어느 핀을 눌렀는지 머리말에 보여주려고)
 */
export default function ContentSheet({ content, place, color, onEdit, onClose }) {
  // 시트가 떠 있는 동안 뒤 배경이 스크롤되면 화면이 따로 논다
  useEffect(() => {
    if (!content) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [content, onClose])

  if (!content) return null

  const isCompleted = content.status === 'COMPLETED'
  const dot = color ?? '#94a3b8'

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
        aria-label={content.title}
        className="fixed inset-x-0 bottom-0 z-[1101] flex max-h-[85vh] flex-col rounded-t-3xl bg-white shadow-2xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
      >
        {/* 폰에서 시트를 잡아 내리는 느낌을 주는 손잡이 (장식) */}
        <div className="flex justify-center pt-2.5 sm:hidden">
          <span aria-hidden="true" className="h-1 w-10 rounded-full bg-neutral-200" />
        </div>

        <div className="flex items-center gap-2 border-b border-neutral-900/5 px-4 py-3">
          <span
            aria-hidden="true"
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ background: isCompleted ? dot : '#fff', boxShadow: `0 0 0 2.5px ${dot}` }}
          />
          {/* 지도에서 열었으면 어느 장소의 핀이었는지, 목록에서 열었으면 그냥 제목 */}
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900">
            {place ? `📍 ${place.name}` : content.title}
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

        {/* 목록에 쓰던 것과 똑같은 카드. 시트 안에서는 여백·테두리만 걷어낸다 */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 [&>article]:mb-0 [&>article]:shadow-none [&>article]:ring-0">
          {/* 시트가 수정 버튼을 갖고 있으니 카드 위의 액션은 끈다 */}
          <ContentCard content={content} showActions={false} />
        </div>

        <div className="flex gap-2 border-t border-neutral-900/5 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {place?.url && (
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
