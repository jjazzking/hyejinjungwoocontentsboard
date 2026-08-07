import MediaEmbed from './embeds/MediaEmbed.jsx'
import PhotoCarousel from './PhotoCarousel.jsx'

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

function EditActions({ isCompleted, onToggleStatus, onEdit, onDelete }) {
  return (
    <>
      <button
        type="button"
        onClick={onToggleStatus}
        title={isCompleted ? '할 것으로 되돌리기' : '완료로 표시하기'}
        className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-neutral-700 shadow backdrop-blur transition-colors hover:bg-white"
      >
        {isCompleted ? '↩️ 되돌리기' : '✅ 완료!'}
      </button>
      <button
        type="button"
        onClick={onEdit}
        title="수정"
        className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-neutral-700 shadow backdrop-blur transition-colors hover:bg-white"
      >
        ✏️ 수정
      </button>
      <button
        type="button"
        onClick={onDelete}
        title="삭제"
        className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-red-500 shadow backdrop-blur transition-colors hover:bg-red-50"
      >
        🗑️
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
 * 편집 모드(editable)에서는 상태 전환 / 수정 / 삭제 버튼이 표시된다.
 */
export default function ContentCard({ content, editable = false, onEdit, onDelete, onToggleStatus }) {
  const { title, status, date, reference_url, reference_platform, photo_urls, categories, memo } = content

  const isCompleted = status === 'COMPLETED'
  const showPhotos = isCompleted && photo_urls.length > 0
  const platform = PLATFORM_LABEL[reference_platform]
  const hasEmbed = Boolean(platform && reference_url)
  const compact = !showPhotos && !hasEmbed

  return (
    <article
      className={`relative mb-6 flex break-inside-avoid flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 transition-shadow hover:shadow-md ${
        editable ? 'ring-2 ring-rose-200' : 'ring-neutral-900/5'
      }`}
    >
      {/* 미디어 영역 — 컴팩트 카드는 얇은 포인트 바로 대체 */}
      {compact ? (
        <div className="h-1.5 w-full bg-gradient-to-r from-rose-300 via-orange-200 to-amber-200" />
      ) : showPhotos ? (
        <PhotoCarousel photos={photo_urls} title={title} />
      ) : (
        <MediaEmbed platform={reference_platform} url={reference_url} title={title} />
      )}

      {/* 편집 모드 액션 버튼: 미디어가 있으면 그 위에 띄우고, 컴팩트 카드는 본문 위 줄로 */}
      {editable &&
        (compact ? (
          <div className="flex gap-1.5 px-4 pt-3">
            <EditActions
              isCompleted={isCompleted}
              onToggleStatus={onToggleStatus}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          </div>
        ) : (
          <div className="absolute left-2 top-2 z-10 flex gap-1.5">
            <EditActions
              isCompleted={isCompleted}
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
