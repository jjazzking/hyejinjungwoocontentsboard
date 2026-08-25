import { useEffect, useState } from 'react'
import MediaEmbed from './embeds/MediaEmbed.jsx'
import PhotoCarousel from './PhotoCarousel.jsx'
import { toTimeSlotChips } from '../utils/timeSlots.js'

const PLATFORM_LABEL = {
  INSTAGRAM: { name: 'Instagram', className: 'bg-gradient-to-r from-fuchsia-500 to-orange-400 text-white' },
  YOUTUBE: { name: 'YouTube', className: 'bg-red-600 text-white' },
  TIKTOK: { name: 'TikTok', className: 'bg-neutral-900 text-white' },
}

function formatDate(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(date.getTime())) return dateStr
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long' }).format(date)
}

const actionClass =
  'rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium shadow backdrop-blur transition-colors'

/**
 * 카드 액션 — **항상 떠 있다.**
 *
 * 예전엔 상단의 '편집' 토글을 켜야 나왔는데, 고칠 때마다 두 번 누르는 게 번거로웠다.
 * 대신 자주 쓰는 ✏️만 늘 보여주고, 가끔 쓰는 것(완료 전환·순서 이동·삭제)은
 * ⋯ 뒤에 접어둔다. 넷을 다 펼쳐두면 카드마다 버튼 줄이 생겨 목록이 시끄러워진다.
 */
function CardActions({ isCompleted, moving, onMoveStart, onToggleStatus, onEdit, onDelete }) {
  const [open, setOpen] = useState(false)

  // 이동 모드로 들어가면 더보기는 접는다 (지도·목록에서 다음 동작은 카드 고르기다)
  useEffect(() => {
    if (moving) setOpen(false)
  }, [moving])

  if (open) {
    return (
      <>
        <button
          type="button"
          onClick={onToggleStatus}
          title={isCompleted ? '할 것으로 되돌리기' : '완료로 표시하기'}
          className={`${actionClass} text-neutral-700 hover:bg-white`}
        >
          {isCompleted ? '↩️ 되돌리기' : '✅ 완료!'}
        </button>
        <button
          type="button"
          onClick={onMoveStart}
          aria-pressed={moving}
          title="위치 이동"
          className={`${actionClass} text-neutral-700 hover:bg-white`}
        >
          ☰
        </button>
        <button
          type="button"
          onClick={onDelete}
          title="삭제"
          className={`${actionClass} text-red-500 hover:bg-red-50`}
        >
          🗑️
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
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
        onClick={onEdit}
        title="수정"
        className={`${actionClass} text-neutral-700 hover:bg-white`}
      >
        ✏️ 수정
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="더보기 (완료 전환 · 위치 이동 · 삭제)"
        aria-expanded={false}
        className={`${actionClass} ${
          moving ? 'bg-rose-400 text-white hover:bg-rose-500' : 'text-neutral-500 hover:bg-white'
        }`}
      >
        ⋯
      </button>
    </>
  )
}

/**
 * 컨텐츠 카드 한 장.
 *
 * 크기 두 가지:
 * - 큰 카드   : 임베드(9:16) 또는 사진 캐러셀이 있는 카드
 * - 컴팩트 카드: 임베드도 사진도 없는 매뉴얼 카드 — 미디어 영역 없이 얇은
 *               포인트 바만 얹어서 큰 카드의 약 1/3 높이가 되도록 한다.
 *               (매소너리 컬럼에서 작은 카드 여러 장이 쌓여 큰 카드와 맞물린다)
 *
 * 미디어 우선순위: COMPLETED+사진 → 캐러셀, 임베드 가능 → 임베드, 그 외 → 컴팩트
 * 액션(✏️ 수정 + ⋯)은 **항상** 떠 있다 — 편집 모드를 켜는 단계를 없앴다.
 * moving: 이 카드가 이동 중 / isMoveTarget: 다른 카드의 이동 목적지로 선택 가능
 */
export default function ContentCard({
  content,
  // 지도 시트처럼 카드만 보여주면 되는 곳에서는 액션을 숨긴다
  showActions = true,
  moving = false,
  isMoveTarget = false,
  onMoveStart,
  onMoveHere,
  onEdit,
  onDelete,
  onToggleStatus,
}) {
  const {
    title,
    status,
    date,
    reference_url,
    reference_platform,
    photo_urls,
    categories,
    places,
    time_slots,
    time_reason,
    memo,
  } = content

  const timeChips = toTimeSlotChips(time_slots)

  const isCompleted = status === 'COMPLETED'
  const showPhotos = isCompleted && photo_urls.length > 0
  const platform = PLATFORM_LABEL[reference_platform]
  const hasEmbed = Boolean(platform && reference_url)
  const compact = !showPhotos && !hasEmbed

  return (
    <article
      className={`relative mb-6 flex break-inside-avoid flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 transition-shadow hover:shadow-md ${
        moving ? 'opacity-70 ring-2 ring-rose-400' : 'ring-neutral-900/5'
      }`}
    >
      {/* 이동 모드: 이 카드를 눌러 이동 중인 카드를 이 앞으로 배치 */}
      {isMoveTarget && (
        <button
          type="button"
          onClick={onMoveHere}
          className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-rose-300 bg-rose-50/40 transition-colors hover:bg-rose-100/60"
        >
          <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-medium text-rose-500 shadow">
            ⤴️ 이 앞으로 이동
          </span>
        </button>
      )}
      {/* 미디어 영역 — 컴팩트 카드는 얇은 포인트 바로 대체 */}
      {compact ? (
        <div className="h-1.5 w-full bg-gradient-to-r from-rose-300 via-orange-200 to-amber-200" />
      ) : showPhotos ? (
        <PhotoCarousel photos={photo_urls} title={title} />
      ) : (
        <MediaEmbed platform={reference_platform} url={reference_url} title={title} />
      )}

      {/* 액션: 미디어가 있으면 그 위에 띄우고, 컴팩트 카드는 본문 위 줄로 */}
      {showActions &&
        (compact ? (
          <div className="flex justify-end gap-1.5 px-4 pt-3">
            <CardActions
              isCompleted={isCompleted}
              moving={moving}
              onMoveStart={onMoveStart}
              onToggleStatus={onToggleStatus}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          </div>
        ) : (
          <div className="absolute right-2 top-2 z-10 flex gap-1.5">
            <CardActions
              isCompleted={isCompleted}
              moving={moving}
              onMoveStart={onMoveStart}
              onToggleStatus={onToggleStatus}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          </div>
        ))}

      {/* 본문 영역 */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {compact && <span className="text-base leading-none">💌</span>}
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              isCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}
          >
            {isCompleted ? '✅ 한 것' : '🗓️ 할 것'}
          </span>
          {(categories ?? []).map((c) => (
            <span
              key={c}
              className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-600"
            >
              {c}
            </span>
          ))}
        </div>

        <h3 className="text-base font-semibold leading-snug text-neutral-900">{title}</h3>
        <time dateTime={date} className="text-xs text-neutral-400">
          {formatDate(date)}
        </time>

        {/* 가기 좋은 시간대 — AI 판단이라 근거(time_reason)를 툴팁으로 붙여 눈으로 검증할 수 있게 한다 */}
        {timeChips.length > 0 && (
          <div className="flex flex-wrap gap-1" title={time_reason || undefined}>
            {timeChips.map((slot) => (
              <span
                key={slot.key}
                className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-600 ring-1 ring-sky-100"
              >
                {slot.emoji} {slot.label}
              </span>
            ))}
          </div>
        )}

        {/* 장소: 네이버 지도 링크가 있으면 눌러서 바로 열 수 있게 */}
        {(places ?? []).length > 0 && (
          <ul className="flex flex-col gap-1">
            {places.map((place, index) => (
              <li key={`${place.name}-${index}`} className="text-xs text-neutral-500">
                📍{' '}
                {place.url ? (
                  <a
                    href={place.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-neutral-300 underline-offset-2 transition-colors hover:text-rose-500"
                  >
                    {place.name}
                  </a>
                ) : (
                  place.name
                )}
                {place.address && <span className="text-neutral-400"> · {place.address}</span>}
              </li>
            ))}
          </ul>
        )}

        {memo && <p className="text-sm leading-relaxed text-neutral-600">{memo}</p>}

        {/* 원본 링크: 사진 캐러셀이 임베드를 대체한 경우에도 출처는 남겨준다 */}
        {reference_url && platform && (
          <a
            href={reference_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-auto inline-flex w-fit items-center gap-1.5 pt-1 text-xs text-neutral-400 transition-colors hover:text-neutral-600"
          >
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${platform.className}`}>
              {platform.name}
            </span>
            원본 아이디어 보기 ↗
          </a>
        )}
      </div>
    </article>
  )
}
