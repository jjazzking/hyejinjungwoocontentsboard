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

/**
 * 컨텐츠 카드 한 장.
 * 미디어 영역 우선순위:
 *   1) COMPLETED + 사진 있음 → 직접 찍은 사진 캐러셀
 *   2) 그 외 → reference_platform에 맞는 임베드 (없으면 플레이스홀더)
 */
export default function ContentCard({ content }) {
  const { title, status, date, reference_url, reference_platform, photo_urls, category, memo } = content

  const isCompleted = status === 'COMPLETED'
  const showPhotos = isCompleted && photo_urls.length > 0
  const platform = PLATFORM_LABEL[reference_platform]

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutral-900/5 transition-shadow hover:shadow-md">
      {/* 미디어 영역 */}
      {showPhotos ? (
        <PhotoCarousel photos={photo_urls} title={title} />
      ) : (
        <MediaEmbed platform={reference_platform} url={reference_url} title={title} />
      )}

      {/* 본문 영역 */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              isCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}
          >
            {isCompleted ? '✅ 한 것' : '🗓️ 할 것'}
          </span>
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-600">
            {category}
          </span>
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
