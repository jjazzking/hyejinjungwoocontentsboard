/**
 * 틱톡 임베드 컴포넌트
 * 영상 URL(https://www.tiktok.com/@user/video/{id})에서 숫자 id를 추출해
 * 공식 embed 플레이어(https://www.tiktok.com/embed/v2/{id})를 iframe으로 렌더링한다.
 */
function extractTikTokId(url) {
  try {
    const u = new URL(url)
    const match = u.pathname.match(/\/video\/(\d+)/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

export default function TikTokEmbed({ url, title }) {
  const videoId = extractTikTokId(url)
  if (!videoId) return null

  return (
    <div className="relative aspect-[9/16] max-h-96 w-full overflow-hidden bg-black">
      <iframe
        src={`https://www.tiktok.com/embed/v2/${videoId}`}
        title={title ?? 'TikTok video'}
        className="absolute inset-0 h-full w-full"
        allow="encrypted-media"
        allowFullScreen
        loading="lazy"
      />
    </div>
  )
}
