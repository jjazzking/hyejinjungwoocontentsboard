/**
 * 인스타그램 임베드 컴포넌트
 * 유튜브와 달리 인스타그램은 별도의 embed 도메인이 없고,
 * 게시물 URL 뒤에 /embed/ 를 붙인 경로를 iframe으로 로드하는 방식을 쓴다.
 * (릴스 /reel/{code}/, 일반 게시물 /p/{code}/ 모두 지원)
 */
function toInstagramEmbedUrl(url) {
  try {
    const u = new URL(url)
    const match = u.pathname.match(/^\/(reel|reels|p)\/([\w-]+)/)
    if (!match) return null
    const type = match[1] === 'p' ? 'p' : 'reel'
    return `https://www.instagram.com/${type}/${match[2]}/embed/`
  } catch {
    return null
  }
}

export default function InstagramEmbed({ url, title }) {
  const embedUrl = toInstagramEmbedUrl(url)
  if (!embedUrl) return null

  return (
    <div className="relative aspect-[9/16] max-h-96 w-full overflow-hidden bg-neutral-100">
      <iframe
        src={embedUrl}
        title={title ?? 'Instagram post'}
        className="absolute inset-0 h-full w-full"
        allowFullScreen
        scrolling="no"
        loading="lazy"
      />
    </div>
  )
}
