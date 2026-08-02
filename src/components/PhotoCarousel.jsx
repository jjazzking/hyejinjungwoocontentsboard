import { useState } from 'react'

/**
 * 완료된 컨텐츠의 사진들을 좌우로 넘겨볼 수 있는 캐러셀.
 * 좌우 화살표 버튼 + 하단 도트 인디케이터로 조작한다.
 */
export default function PhotoCarousel({ photos, title }) {
  const [current, setCurrent] = useState(0)

  if (!photos?.length) return null

  const goPrev = () => setCurrent((prev) => (prev - 1 + photos.length) % photos.length)
  const goNext = () => setCurrent((prev) => (prev + 1) % photos.length)

  return (
    <div className="group relative aspect-[4/3] w-full overflow-hidden bg-neutral-100">
      {/* 슬라이드 트랙: translateX로 부드럽게 이동 */}
      <div
        className="flex h-full transition-transform duration-300 ease-out"
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {photos.map((src, i) => (
          <img
            key={src}
            src={src}
            alt={`${title} 사진 ${i + 1}`}
            className="h-full w-full flex-shrink-0 object-cover"
            loading="lazy"
          />
        ))}
      </div>

      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            aria-label="이전 사진"
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/70 p-1.5 text-neutral-700 opacity-0 shadow backdrop-blur transition-opacity hover:bg-white group-hover:opacity-100"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="다음 사진"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/70 p-1.5 text-neutral-700 opacity-0 shadow backdrop-blur transition-opacity hover:bg-white group-hover:opacity-100"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {/* 도트 인디케이터 */}
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
            {photos.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => setCurrent(i)}
                aria-label={`${i + 1}번째 사진으로 이동`}
                className={`h-1.5 rounded-full transition-all ${
                  i === current ? 'w-4 bg-white' : 'w-1.5 bg-white/60 hover:bg-white/80'
                }`}
              />
            ))}
          </div>

          {/* 사진 개수 뱃지 */}
          <span className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white backdrop-blur">
            {current + 1} / {photos.length}
          </span>
        </>
      )}
    </div>
  )
}
