import { useEffect, useState } from 'react'

/**
 * 축약 카드 — 목록과 지도에서 공통으로 쓰는 **한 줄짜리 요약**.
 *
 * 목록을 전부 풀 카드로 깔면 임베드·사진 때문에 한 화면에 두세 장밖에 안 들어와서
 * "우리가 뭘 모아놨더라"를 훑을 수가 없다. 그래서 목록은 요약으로 깔고,
 * **누르면 풀 카드**(ContentSheet)가 뜨는 구조로 나눴다.
 *
 * 액션(✏️ 수정 · ⋯)은 여기서도 항상 떠 있다. 카드 전체가 눌리는 영역이라
 * 버튼들은 클릭이 위로 전달되지 않게 막아야 한다.
 */

const PLATFORM_MARK = {
  INSTAGRAM: '📸',
  YOUTUBE: '▶️',
  TIKTOK: '🎵',
}

function formatDate(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(date.getTime())) return dateStr
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`
}

const actionClass =
  'rounded-full bg-white/90 px-2 py-1 text-[11px] font-medium shadow-sm ring-1 ring-neutral-900/5 transition-colors'

function SummaryActions({ isCompleted, moving, onMoveStart, onToggleStatus, onEdit, onDelete }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (moving) setOpen(false)
  }, [moving])

  // 카드 전체가 '풀 카드 열기' 버튼이라, 액션 클릭이 위로 새면 시트가 같이 열린다
  const stop = (handler) => (event) => {
    event.stopPropagation()
    handler?.()
  }

  if (open) {
    return (
      <>
        <button
          type="button"
          onClick={stop(onToggleStatus)}
          title={isCompleted ? '할 것으로 되돌리기' : '완료로 표시하기'}
          className={`${actionClass} text-neutral-700 hover:bg-white`}
        >
          {isCompleted ? '↩️' : '✅'}
        </button>
        <button
          type="button"
          onClick={stop(onMoveStart)}
          title="위치 이동"
          className={`${actionClass} text-neutral-700 hover:bg-white`}
        >
          ☰
        </button>
        <button
          type="button"
          onClick={stop(onDelete)}
          title="삭제"
          className={`${actionClass} text-red-500 hover:bg-red-50`}
        >
          🗑️
        </button>
        <button
          type="button"
          onClick={stop(() => setOpen(false))}
          aria-label="메뉴 접기"
          className={`${actionClass} text-neutral-500 hover:bg-white`}
        >
          ✕
        </button>
      </>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={stop(onEdit)}
        aria-label="수정"
        title="수정"
        className={`${actionClass} text-neutral-700 hover:bg-white`}
      >
        ✏️
      </button>
      <button
        type="button"
        onClick={stop(() => setOpen(true))}
        aria-label="더보기 (완료 전환 · 위치 이동 · 삭제)"
        className={`${actionClass} ${
          moving ? 'bg-rose-400 text-white' : 'text-neutral-500 hover:bg-white'
        }`}
      >
        ⋯
      </button>
    </>
  )
}

export default function ContentSummary({
  content,
  color,
  moving = false,
  isMoveTarget = false,
  onOpen,
  onMoveHere,
  onMoveStart,
  onEdit,
  onDelete,
  onToggleStatus,
}) {
  const { title, status, date, reference_platform, photo_urls, categories, places, memo } = content
  const isCompleted = status === 'COMPLETED'
  const thumbnail = isCompleted ? photo_urls?.[0] : null
  const mark = PLATFORM_MARK[reference_platform] ?? '💌'
  const place = (places ?? [])[0]
  const placeCount = (places ?? []).length

  if (isMoveTarget) {
    return (
      <button
        type="button"
        onClick={onMoveHere}
        className="flex min-h-20 w-full items-center justify-center rounded-2xl border-2 border-dashed border-rose-300 bg-rose-50/40 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-100/60"
      >
        ⤴️ 이 앞으로 이동
      </button>
    )
  }

  return (
    <article
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen?.()
        }
      }}
      aria-label={`${title} 자세히 보기`}
      className={`relative flex cursor-pointer gap-3 overflow-hidden rounded-2xl bg-white p-3 text-left shadow-sm ring-1 transition-shadow hover:shadow-md ${
        moving ? 'opacity-70 ring-2 ring-rose-400' : 'ring-neutral-900/5'
      }`}
    >
      {/* 썸네일 — 사진이 있으면 사진, 없으면 플랫폼 표시 */}
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl text-xl"
        style={{ background: `${color}1A` }}
      >
        {thumbnail ? (
          <img src={thumbnail} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden="true">{mark}</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {/* 액션은 오른쪽 위에 겹쳐 둔다 (제목이 밀리지 않게) */}
        <div className="absolute right-2 top-2 flex gap-1">
          <SummaryActions
            isCompleted={isCompleted}
            moving={moving}
            onMoveStart={onMoveStart}
            onToggleStatus={onToggleStatus}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>

        <div className="flex items-center gap-1.5 pr-16">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{
              background: isCompleted ? color : '#fff',
              boxShadow: `0 0 0 2px ${color}`,
            }}
          />
          <h3 className="truncate text-sm font-semibold text-neutral-900">{title}</h3>
        </div>

        <p className="mt-1 truncate text-xs text-neutral-400">
          {formatDate(date)}
          {place && (
            <span className="text-neutral-500">
              {' · 📍 '}
              {place.name}
              {placeCount > 1 && ` 외 ${placeCount - 1}곳`}
            </span>
          )}
        </p>

        <div className={`mt-1 flex flex-wrap items-center gap-1 ${placeCount > 1 ? 'pr-7' : ''}`}>
          {(categories ?? []).slice(0, 3).map((category) => (
            <span
              key={category}
              className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-500"
            >
              {category}
            </span>
          ))}
          {memo && <span className="truncate text-[11px] text-neutral-400">{memo}</span>}
        </div>
      </div>

      {/* 장소가 여러 곳인 카드 표시 — 오른쪽 아래 모서리를 빨간 삼각형으로 채우고 개수를 적는다 */}
      {placeCount > 1 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 right-0 h-7 w-7 select-none"
        >
          <span
            className="absolute inset-0 bg-red-500"
            style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
          />
          <span className="absolute bottom-0.5 right-1 text-[10px] font-bold leading-none text-white">
            {placeCount}
          </span>
        </span>
      )}
    </article>
  )
}
