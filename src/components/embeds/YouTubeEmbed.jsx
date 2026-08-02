/**
 * 유튜브 임베드 컴포넌트
 * 쇼츠(/shorts/), 일반 영상(watch?v=), 단축 링크(youtu.be)를 모두
 * 표준 embed URL(https://www.youtube.com/embed/{id})로 변환해서 iframe으로 렌더링한다.
 */
function extractYouTubeId(url) {
  try {
    const u = new URL(url)
    // https://youtu.be/{id}
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0]
    // https://www.youtube.com/shorts/{id}
    const shortsMatch = u.pathname.match(/^\/shorts\/([\w-]+)/)
    if (shortsMatch) return shortsMatch[1]
    // https://www.youtube.com/embed/{id}
    const embedMatch = u.pathname.match(/^\/embed\/([\w-]+)/)
    if (embedMatch) return embedMatch[1]
    // https://www.youtube.com/watch?v={id}
    return u.searchParams.get('v')
  } catch {
    return null
  }
}

export default function YouTubeEmbed({ url, title }) {
  const videoId = extractYouTubeId(url)
  if (!videoId) return null

  return (
    <div className="relative aspect-[9/16] max-h-96 w-full overflow-hidden bg-black">
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        title={title ?? 'YouTube video'}
        className="absolute inset-0 h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
      />
    </div>
  )
}
