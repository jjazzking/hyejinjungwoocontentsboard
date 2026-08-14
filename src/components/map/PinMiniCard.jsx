/**
 * 핀을 눌렀을 때 지도 아래쪽에 뜨는 **축약 카드**.
 *
 * 핀을 누를 때마다 풀 카드가 화면을 덮으면 지도를 훑기가 어려워서,
 * 여기서는 어느 장소인지만 한 줄로 보여주고 **누르면 풀 카드**(ContentSheet)로 넘어간다.
 *
 * 지도 컨테이너 안에 절대 위치로 놓기 때문에 `overflow-hidden`에 잘리지 않게
 * 지도 높이 안쪽(bottom-3)에 둔다.
 */
export default function PinMiniCard({ pin, onOpen, onClose }) {
  if (!pin) return null

  const { content, place, color } = pin
  const isCompleted = content.status === 'COMPLETED'
  const thumbnail = isCompleted ? content.photo_urls?.[0] : null

  return (
    <div className="absolute inset-x-3 bottom-3 z-[1000] sm:right-auto sm:max-w-md">
      <div className="flex items-center gap-2.5 rounded-xl bg-white/95 p-2.5 shadow-lg ring-1 ring-neutral-900/10 backdrop-blur">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg text-lg"
            style={{ background: `${color}1A` }}
          >
            {thumbnail ? (
              <img src={thumbnail} alt="" className="h-full w-full object-cover" />
            ) : (
              <span aria-hidden="true">{isCompleted ? '✅' : '🗓️'}</span>
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  background: isCompleted ? color : '#fff',
                  boxShadow: `0 0 0 2px ${color}`,
                }}
              />
              <span className="truncate text-sm font-semibold text-neutral-900">
                {content.title}
              </span>
            </span>
            <span className="mt-0.5 block truncate text-xs text-neutral-500">
              📍 {place.name}
            </span>
            <span className="mt-0.5 block text-[11px] text-rose-400">눌러서 자세히 보기 →</span>
          </span>
        </button>

        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="h-fit shrink-0 rounded-full px-1.5 text-sm text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
