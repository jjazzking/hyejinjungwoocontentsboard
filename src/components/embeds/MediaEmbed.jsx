import YouTubeEmbed from './YouTubeEmbed.jsx'
import InstagramEmbed from './InstagramEmbed.jsx'
import TikTokEmbed from './TikTokEmbed.jsx'

/**
 * reference_platform 값에 따라 알맞은 임베드 컴포넌트로 분기하는 디스패처.
 * 플랫폼이 NONE이거나 URL 파싱에 실패하면 감성 플레이스홀더를 보여준다.
 */
const EMBED_BY_PLATFORM = {
  YOUTUBE: YouTubeEmbed,
  INSTAGRAM: InstagramEmbed,
  TIKTOK: TikTokEmbed,
}

function EmbedPlaceholder() {
  return (
    <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-rose-100 via-orange-50 to-amber-100">
      <span className="text-4xl">💌</span>
      <p className="text-sm text-neutral-500">우리끼리 떠올린 아이디어</p>
    </div>
  )
}

export default function MediaEmbed({ platform, url, title }) {
  const Embed = EMBED_BY_PLATFORM[platform]
  if (!Embed || !url) return <EmbedPlaceholder />

  return <Embed url={url} title={title} />
}
