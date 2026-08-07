// AI 링크 분석 Edge Function.
//
// POST { url, categories: string[] }
//  → 게시물의 캡션·썸네일을 서버에서 수집하고 Claude로 분석해
//    { title, categories, memo } 카드 초안을 돌려준다.
//
// Anthropic API 키는 Supabase 시크릿(ANTHROPIC_API_KEY)으로만 보관한다 —
// 프론트엔드/저장소에는 절대 넣지 않는다. 배포 방법은 SUPABASE_SETUP.md 6번 참고.
import Anthropic from 'npm:@anthropic-ai/sdk'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 8000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function detectPlatform(url: string) {
  if (/instagram\.com/i.test(url)) return 'INSTAGRAM'
  if (/youtube\.com|youtu\.be/i.test(url)) return 'YOUTUBE'
  if (/tiktok\.com/i.test(url)) return 'TIKTOK'
  return 'NONE'
}

interface PostMeta {
  caption: string
  imageUrl: string | null
}

/** YouTube/TikTok: 공개 oEmbed에서 제목(=캡션)과 썸네일을 가져온다. */
async function fetchOEmbedMeta(endpoint: string): Promise<PostMeta | null> {
  try {
    const res = await fetchWithTimeout(endpoint)
    if (!res.ok) return null
    const data = await res.json()
    const caption = [data?.title, data?.author_name && `작성자: ${data.author_name}`]
      .filter(Boolean)
      .join('\n')
    return caption ? { caption, imageUrl: data?.thumbnail_url ?? null } : null
  } catch {
    return null
  }
}

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Accept-Language': 'ko,en;q=0.8',
}

function decodeEntities(text: string) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function extractMetaContent(html: string, property: string) {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']|` +
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    'i',
  )
  const match = html.match(pattern)
  const content = match?.[1] ?? match?.[2]
  return content ? decodeEntities(content) : null
}

/**
 * Instagram: 로그인 없이 접근 가능한 두 경로를 순서대로 시도한다.
 * 1) 게시물 페이지의 og:title/og:description/og:image
 * 2) 공개 임베드 페이지(/embed/captioned)의 캡션·이미지
 */
async function fetchInstagramMeta(url: string): Promise<PostMeta | null> {
  try {
    const res = await fetchWithTimeout(url, { headers: BROWSER_HEADERS })
    if (res.ok) {
      const html = await res.text()
      const caption =
        extractMetaContent(html, 'og:description') ?? extractMetaContent(html, 'og:title')
      const imageUrl = extractMetaContent(html, 'og:image')
      if (caption || imageUrl) return { caption: caption ?? '', imageUrl }
    }
  } catch {
    // 다음 경로로 폴백
  }

  try {
    const embedUrl = url.replace(/\/?(\?.*)?$/, '/embed/captioned/')
    const res = await fetchWithTimeout(embedUrl, { headers: BROWSER_HEADERS })
    if (!res.ok) return null
    const html = await res.text()
    const imageUrl = html.match(/class="EmbeddedMediaImage"[^>]+src="([^"]+)"/)?.[1] ?? null
    const captionHtml = html.match(/<div class="Caption"[^>]*>([\s\S]*?)<div class="CaptionComments"/)?.[1] ?? ''
    const caption = decodeEntities(captionHtml.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
      .replace(/[ \t]+/g, ' ')
      .trim()
    if (!caption && !imageUrl) return null
    return { caption, imageUrl: imageUrl ? decodeEntities(imageUrl) : null }
  } catch {
    return null
  }
}

async function fetchPostMeta(url: string, platform: string): Promise<PostMeta | null> {
  if (platform === 'YOUTUBE')
    return fetchOEmbedMeta(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`)
  if (platform === 'TIKTOK')
    return fetchOEmbedMeta(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`)
  if (platform === 'INSTAGRAM') return fetchInstagramMeta(url)
  return null
}

/** Claude 응답에서 JSON 본문만 뽑아 파싱한다 (```json 펜스 허용). */
function parseDraftJson(text: string) {
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('no JSON in response')
  return JSON.parse(stripped.slice(start, end + 1))
}

const SYSTEM_PROMPT = `당신은 커플의 데이트·컨텐츠 아이디어 보드에 들어갈 카드를 만드는 도우미입니다.
SNS 게시물의 캡션(과 썸네일 이미지)을 보고 아래 JSON만 출력하세요. 다른 텍스트는 절대 쓰지 마세요.

{
  "title": "카드 제목",
  "categories": ["..."],
  "memo": "간단한 메모"
}

규칙:
- title: 한국어로 20자 이내. 장소나 가게 이름이 있으면 꼭 포함하고, 뭘 하는 컨텐츠인지 한눈에 보이게.
- categories: 사용자가 준 카테고리 목록 중에서만 고르세요 (복수 가능, 맞는 게 없으면 빈 배열).
- memo: 한두 문장. 위치·메뉴·팁 등 나중에 다시 볼 때 유용한 핵심 정보만. 캡션에 정보가 없으면 빈 문자열.
- 광고/해시태그 나열은 무시하고 실제 내용만 반영하세요.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' })

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json(500, { error: 'ANTHROPIC_API_KEY secret is not set' })

  let body: { url?: string; categories?: string[] }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'invalid JSON body' })
  }

  const url = body.url?.trim()
  if (!url) return json(400, { error: 'url is required' })
  const platform = detectPlatform(url)
  if (platform === 'NONE') return json(400, { error: 'unsupported platform' })
  const categories = Array.isArray(body.categories) ? body.categories.filter(Boolean) : []

  const meta = await fetchPostMeta(url, platform)
  if (!meta?.caption && !meta?.imageUrl) {
    return json(422, { error: 'could not read the post (login-only or deleted?)' })
  }

  const client = new Anthropic({ apiKey })
  const userContent: Anthropic.ContentBlockParam[] = [
    {
      type: 'text',
      text: `플랫폼: ${platform}\n카테고리 목록: ${JSON.stringify(categories)}\n\n캡션:\n${meta.caption || '(캡션 없음 — 이미지만 보고 판단하세요)'}`,
    },
  ]
  if (meta.imageUrl) {
    userContent.push({ type: 'image', source: { type: 'url', url: meta.imageUrl } })
  }

  // 썸네일 URL을 Anthropic 쪽에서 못 가져오는 경우가 있어(만료·차단) 이미지 없이 한 번 더 시도한다
  let responseText: string | null = null
  for (const content of [userContent, userContent.filter((b) => b.type === 'text')]) {
    try {
      const message = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
      })
      responseText = message.content.find((b) => b.type === 'text')?.text ?? null
      break
    } catch (err) {
      if (content.length === userContent.length && meta.imageUrl) continue
      console.error('anthropic error:', err)
      return json(502, { error: 'AI analysis failed' })
    }
  }
  if (!responseText) return json(502, { error: 'AI analysis failed' })

  try {
    const draft = parseDraftJson(responseText)
    return json(200, {
      title: typeof draft.title === 'string' ? draft.title.trim() : '',
      categories: Array.isArray(draft.categories)
        ? draft.categories.filter((c: unknown) => typeof c === 'string' && categories.includes(c))
        : [],
      memo: typeof draft.memo === 'string' ? draft.memo.trim() : '',
    })
  } catch {
    return json(502, { error: 'AI returned an unexpected format' })
  }
})
