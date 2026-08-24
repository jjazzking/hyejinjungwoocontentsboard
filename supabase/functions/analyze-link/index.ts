// AI 링크 분석 Edge Function.
//
// POST { url?, caption?, categories: string[] }
//  → 게시물의 캡션·썸네일을 서버에서 수집하고 Claude로 분석해
//    { title, categories, memo, places } 카드 초안을 돌려준다.
//  → caption이 함께 오면 수집을 건너뛰고 그 텍스트를 바로 분석한다
//    (인스타그램이 서버 수집을 막을 때 사용자가 캡션을 직접 붙여넣는 경로).
//  → 장소는 인스타 위치 태그(가장 정확) 또는 캡션에서 AI가 뽑은 검색어로
//    네이버 지역 검색까지 돌려서 좌표까지 채운 뒤 돌려준다. 추측이 섞이므로
//    source를 함께 보내 사용자가 확인·확정할 수 있게 한다.
//
// Anthropic API 키는 Supabase 시크릿(ANTHROPIC_API_KEY)으로만 보관한다 —
// 프론트엔드/저장소에는 절대 넣지 않는다. 배포 방법은 SUPABASE_SETUP.md 6번 참고.
// 장소 검색에는 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 시크릿을 쓴다(없으면 장소는 건너뜀).
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

/**
 * 공유 버튼으로 복사한 링크에 붙어 오는 추적 파라미터(igsh·igsi·utm_* 등)를 떼어낸다.
 * 인스타그램 본체는 무시하지만 미러·Apify 쪽은 그대로 넘기면 매칭에 실패할 수 있어
 * 수집 직전에 한 번 정리한다. 카드에 저장되는 reference_url은 원본 그대로 둔다.
 */
function normalizeUrl(raw: string) {
  try {
    const parsed = new URL(raw)
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return raw
  }
}

interface PostMeta {
  caption: string
  imageUrl: string | null
  /**
   * 인스타그램 위치 태그. 게시자가 직접 지정한 값이지만 동네·건물 단위로 대충 찍힌
   * 경우가 많아, 캡션에서 뽑은 검색어가 실패했을 때의 폴백으로만 쓴다.
   */
  locationName?: string | null
  /** 어느 수집 경로로 얻었는지 (실패 사유를 화면에 보여줄 때 쓴다) */
  via?: string
}

interface Place {
  name: string
  address: string
  lat: number | null
  lng: number | null
  category: string
  url: string
  source: 'INSTAGRAM' | 'AI'
}

// ── 네이버 지역 검색 (place-search 함수와 같은 규격) ───────────────
// Edge Function은 파일 단위로 배포돼서 공유가 안 되므로 필요한 만큼만 옮겨 왔다.

const PLACE_ENDPOINT = 'https://naverapihub.apigw.ntruss.com/search/v1/local'

function stripTags(value: string | undefined) {
  return (value ?? '').replace(/<[^>]*>/g, '').trim()
}

function toCoord(raw: unknown, max: number): number | null {
  const value = Number(raw)
  if (!Number.isFinite(value) || value === 0) return null
  const degrees = Math.abs(value) >= 1_000_000 ? value / 10_000_000 : value
  if (!Number.isFinite(degrees) || Math.abs(degrees) > max || degrees === 0) return null
  return Number(degrees.toFixed(7))
}

/**
 * 검색어로 장소 한 곳을 찾는다.
 * 실패해도 분석 결과는 그대로 돌려주되, 왜 못 찾았는지 debug에 남겨
 * 프론트에서 바로 확인할 수 있게 한다.
 */
async function findPlace(
  query: string,
  source: Place['source'],
): Promise<{ place: Place | null; debug: string }> {
  const id = Deno.env.get('NAVER_CLIENT_ID')
  const secret = Deno.env.get('NAVER_CLIENT_SECRET')
  if (!id || !secret) {
    return { place: null, debug: `'${query}' 검색 못 함 — 네이버 시크릿이 등록되어 있지 않음` }
  }
  try {
    const res = await fetchWithTimeout(
      `${PLACE_ENDPOINT}?query=${encodeURIComponent(query)}&display=1`,
      { headers: { 'X-NCP-APIGW-API-KEY-ID': id, 'X-NCP-APIGW-API-KEY': secret } },
      8000,
    )
    if (!res.ok) {
      const body = (await res.text()).replace(/\s+/g, ' ').slice(0, 160)
      console.error('place lookup failed:', res.status, body)
      return { place: null, debug: `'${query}' 검색 실패 — ${res.status} ${body}` }
    }
    const data = await res.json()
    const item = Array.isArray(data?.items) ? data.items[0] : null
    const name = item ? stripTags(item.title) : ''
    if (!name) return { place: null, debug: `'${query}' 검색 결과 없음` }
    return {
      place: {
        name,
        address: stripTags(item.roadAddress) || stripTags(item.address),
        lat: toCoord(item.mapy, 90),
        lng: toCoord(item.mapx, 180),
        category: stripTags(item.category),
        url: `https://map.naver.com/p/search/${encodeURIComponent(name)}`,
        source,
      },
      debug: '',
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('place lookup error:', err)
    return { place: null, debug: `'${query}' 검색 오류 — ${message}` }
  }
}

// ── NCP Maps Geocoding (주소 → 좌표) ────────────────────────────
// 지역검색(search/v1/local)은 업체명 색인이라 도로명주소 문자열을 그대로
// 넣으면 매칭이 안 되는 경우가 많다. 상호명 검색이 다 실패했을 때,
// 캡션에 실제로 적힌 주소가 있으면 이 API로 좌표만이라도 찾는다.
// 지도(VITE_NAVER_MAP_CLIENT_ID)와 같은 Maps Application을 쓰되,
// 서버 호출이라 별도로 Client Secret이 필요하다.
const GEOCODE_ENDPOINT = 'https://maps.apigw.ntruss.com/map-geocode/v2/geocode'

async function geocodeAddress(
  address: string,
  name: string,
): Promise<{ place: Place | null; debug: string }> {
  const id = Deno.env.get('NAVER_MAPS_CLIENT_ID')
  const secret = Deno.env.get('NAVER_MAPS_CLIENT_SECRET')
  if (!id || !secret) {
    return {
      place: null,
      debug: `'${address}' 주소 검색 못 함 — NAVER_MAPS_CLIENT_ID/NAVER_MAPS_CLIENT_SECRET 시크릿이 등록되어 있지 않음`,
    }
  }
  try {
    const res = await fetchWithTimeout(
      `${GEOCODE_ENDPOINT}?query=${encodeURIComponent(address)}`,
      { headers: { 'X-NCP-APIGW-API-KEY-ID': id, 'X-NCP-APIGW-API-KEY': secret } },
      8000,
    )
    if (!res.ok) {
      const body = (await res.text()).replace(/\s+/g, ' ').slice(0, 160)
      console.error('geocode failed:', res.status, body)
      return { place: null, debug: `'${address}' 주소 검색 실패 — ${res.status} ${body}` }
    }
    const data = await res.json()
    const item = Array.isArray(data?.addresses) ? data.addresses[0] : null
    if (!item) return { place: null, debug: `'${address}' 주소 검색 결과 없음` }
    const lat = toCoord(item.y, 90)
    const lng = toCoord(item.x, 180)
    if (lat == null || lng == null) return { place: null, debug: `'${address}' 주소 좌표 형식이 이상함` }
    return {
      place: {
        name: name || address,
        address,
        lat,
        lng,
        category: '',
        url: `https://map.naver.com/p/search/${encodeURIComponent(name || address)}`,
        source: 'AI',
      },
      debug: '',
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('geocode error:', err)
    return { place: null, debug: `'${address}' 주소 검색 오류 — ${message}` }
  }
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

/** 1) 게시물 페이지의 og:title/og:description/og:image */
async function fetchInstagramOgMeta(url: string): Promise<PostMeta | null> {
  try {
    const res = await fetchWithTimeout(url, { headers: BROWSER_HEADERS })
    if (!res.ok) return null
    const html = await res.text()
    const caption =
      extractMetaContent(html, 'og:description') ?? extractMetaContent(html, 'og:title')
    const imageUrl = extractMetaContent(html, 'og:image')
    if (!caption && !imageUrl) return null
    return { caption: caption ?? '', imageUrl }
  } catch {
    return null
  }
}

/** 2) 공개 임베드 페이지(/embed/captioned)의 캡션·이미지 */
async function fetchInstagramEmbedMeta(url: string): Promise<PostMeta | null> {
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

/**
 * 3) 임베드 미러(InstaFix 계열): 인스타그램이 데이터센터 요청을 막을 때의 마지막 폴백.
 * 디스코드/텔레그램 미리보기용 서비스라 봇 User-Agent로 요청해야 og 태그를 내려준다.
 */
const INSTAGRAM_MIRROR_HOSTS = ['www.ddinstagram.com', 'www.kkinstagram.com']

async function fetchInstagramMirrorMeta(url: string): Promise<PostMeta | null> {
  const { pathname } = new URL(url)
  for (const host of INSTAGRAM_MIRROR_HOSTS) {
    try {
      const res = await fetchWithTimeout(`https://${host}${pathname}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)' },
      })
      if (!res.ok) continue
      const html = await res.text()
      const caption = extractMetaContent(html, 'og:description') ?? ''
      let imageUrl = extractMetaContent(html, 'og:image')
      if (imageUrl?.startsWith('/')) imageUrl = `https://${host}${imageUrl}`
      if (caption || imageUrl) return { caption, imageUrl }
    } catch {
      // 다음 미러로
    }
  }
  return null
}

/**
 * 4) Apify 수집 서비스(APIFY_TOKEN 시크릿이 있을 때만).
 * 무료 경로가 모두 막혔을 때 쓰는 유료(무료 크레딧) 경로 — 느리지만 성공률이 높다.
 */
const APIFY_ACTOR = 'apify~instagram-scraper'

async function fetchInstagramApifyMeta(url: string): Promise<PostMeta | null> {
  const token = Deno.env.get('APIFY_TOKEN')
  if (!token) return null
  try {
    const res = await fetchWithTimeout(
      `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directUrls: [url],
          resultsType: 'details',
          resultsLimit: 1,
          addParentData: false,
        }),
      },
      90000,
    )
    if (!res.ok) {
      console.error('apify failed:', res.status, (await res.text()).slice(0, 300))
      return null
    }
    const items = await res.json()
    const post = Array.isArray(items) ? items[0] : null
    if (!post) return null

    const caption = [
      typeof post.caption === 'string' ? post.caption : '',
      // 위치 태그는 동네·건물 단위로 대충 찍힌 경우가 많아, 참고용이라고 명시해서 넘긴다
      post.locationName ? `게시물 위치 태그(부정확할 수 있음): ${post.locationName}` : '',
      post.ownerUsername ? `계정: @${post.ownerUsername}` : '',
    ]
      .filter(Boolean)
      .join('\n')
      .trim()
    const imageUrl =
      post.displayUrl ??
      (Array.isArray(post.images) ? post.images[0] : null) ??
      post.childPosts?.[0]?.displayUrl ??
      null
    if (!caption && !imageUrl) return null
    return {
      caption,
      imageUrl: typeof imageUrl === 'string' ? imageUrl : null,
      locationName: typeof post.locationName === 'string' ? post.locationName : null,
    }
  } catch (err) {
    console.error('apify error:', err)
    return null
  }
}

/**
 * 로그인 벽·에러 페이지에서 나오는 껍데기 문구를 캡션으로 착각하지 않도록 거른다.
 * (여기서 걸러야 다음 수집 경로로 넘어간다 — 통과시켜 버리면 og 단계에서 바로 끝나서
 *  embed·미러·Apify를 아예 시도하지 않는다)
 */
const JUNK_CAPTION = [
  /^(instagram|로그인|login|log ?in|sign ?up|가입|see this|이 사진|이 게시물|something went wrong|page not found)/i,
  /(로그인하여|계정이 없으신가요|see photos and videos from friends|log in to (see|watch|continue)|create an account)/i,
]

/**
 * og:description은 캡션이 없어도 통계 문구만 채워져 내려온다.
 *   "12K likes, 340 comments - username on December 5, 2025"
 *   "좋아요 12만개, 댓글 340개 - 2025년 12월 5일 username님의 Instagram 게시물"
 * 실제 캡션은 그 뒤에 `: "…"` 형태로 붙는데, 릴스는 이 부분이 빠진 채 오는 일이 잦다.
 * 통계만 있는 문구를 캡션으로 받아들이면 AI가 볼 내용이 없어 뻔한 제목만 나오므로
 * 캡션이 붙어 있을 때만 인정하고, 아니면 다음 수집 경로로 넘긴다.
 */
const STATS_PREFIX = /^\s*(\d[\d,.]*\s*[KkMm]?\s*(likes?|comments?)|좋아요\s*\d|댓글\s*\d)/i
const HAS_QUOTED_CAPTION = /:\s*["“'']/

/**
 * Apify 경로는 캡션 본문이 비어 있어도 계정명·위치 태그를 붙여서 넘긴다.
 * 그 줄만 남았다면 AI가 볼 내용이 사실상 없는 것("계정: @songchu_valley" 19자가
 * 길이 검사를 통과해 버렸다). 본문만 떼어내서 판단한다.
 */
const META_ONLY_LINE = /^(계정:\s*@|작성자:|게시물 위치 태그)/

function captionBody(caption: string) {
  return caption
    .split('\n')
    .filter((line) => !META_ONLY_LINE.test(line.trim()))
    .join('\n')
    .trim()
}

function isUsefulCaption(caption: string | undefined) {
  if (!caption) return false
  const trimmed = captionBody(caption)
  if (trimmed.length < 15) return false
  if (JUNK_CAPTION.some((pattern) => pattern.test(trimmed))) return false
  if (STATS_PREFIX.test(trimmed) && !HAS_QUOTED_CAPTION.test(trimmed)) return false
  return true
}

/**
 * Instagram: 캡션을 얻을 때까지 무료 경로 → Apify 순서로 시도한다.
 * (무료 경로를 먼저 써서 Apify 크레딧 소모를 최소화한다)
 */
async function fetchInstagramMeta(url: string): Promise<PostMeta | null> {
  const attempts: Array<[string, (url: string) => Promise<PostMeta | null>]> = [
    ['og 태그', fetchInstagramOgMeta],
    ['임베드 페이지', fetchInstagramEmbedMeta],
    ['임베드 미러', fetchInstagramMirrorMeta],
    ['Apify 수집', fetchInstagramApifyMeta],
  ]
  let fallback: PostMeta | null = null
  const tried: string[] = []
  for (const [label, attempt] of attempts) {
    const meta = await attempt(url)
    if (isUsefulCaption(meta?.caption)) {
      return {
        caption: meta!.caption,
        imageUrl: meta!.imageUrl ?? fallback?.imageUrl ?? null,
        locationName: meta!.locationName ?? fallback?.locationName ?? null,
        via: label,
      }
    }
    tried.push(meta?.caption || meta?.imageUrl ? `${label}: 캡션 못 읽음` : `${label}: 응답 없음`)
    if (meta && !fallback && (meta.caption || meta.imageUrl)) fallback = meta
  }
  // Apify 토큰이 없으면 마지막 경로는 시도조차 못 한다 — 사유에 같이 남긴다
  if (!Deno.env.get('APIFY_TOKEN')) tried[tried.length - 1] = 'Apify 수집: APIFY_TOKEN 시크릿 없음'
  return fallback ? { ...fallback, via: tried.join(' / ') } : null
}

async function fetchPostMeta(url: string, platform: string): Promise<PostMeta | null> {
  if (platform === 'YOUTUBE')
    return fetchOEmbedMeta(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`)
  if (platform === 'TIKTOK')
    return fetchOEmbedMeta(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`)
  if (platform === 'INSTAGRAM') return fetchInstagramMeta(url)
  return null
}

/**
 * 응답이 max_tokens에 걸려 중간에 끊겼는지 본다.
 * 괄호가 안 닫혔거나 문자열이 열린 채로 끝나면 잘린 것 — 형식 오류와 구분해서
 * 화면에 다른 사유를 보여주려고 따로 판단한다.
 */
function looksTruncated(json: string) {
  let depth = 0
  let inString = false
  let escaped = false
  for (const ch of json) {
    if (escaped) {
      escaped = false
      continue
    }
    if (inString && ch === '\\') {
      escaped = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === '{' || ch === '[') depth += 1
    else if (ch === '}' || ch === ']') depth -= 1
  }
  return inString || depth > 0
}

/**
 * 카드 여러 장으로 답했을 때 한 장으로 합친다.
 * 제목은 첫 카드 것을 쓰고, 장소·카테고리는 전부 모으고, 메모는 이어 붙인다
 * (장소별 운영시간·가격이 메모에 들어 있어서 버리면 아깝다).
 */
function mergeDrafts(list: Record<string, unknown>[]) {
  const places: unknown[] = []
  const categories: string[] = []
  const memos: string[] = []
  for (const entry of list) {
    if (Array.isArray(entry.places)) places.push(...entry.places)
    if (Array.isArray(entry.categories))
      categories.push(...entry.categories.filter((c): c is string => typeof c === 'string'))
    if (typeof entry.memo === 'string' && entry.memo.trim()) memos.push(entry.memo.trim())
  }
  return {
    ...(list[0] ?? {}),
    places,
    categories: [...new Set(categories)],
    memo: memos.join(' / ').slice(0, 400),
  }
}

type DraftParse =
  | { ok: true; draft: Record<string, unknown> }
  | { ok: false; truncated: boolean }

/**
 * Claude 응답에서 JSON 본문만 뽑아 파싱한다 (```json 펜스 허용).
 * 게시물이 "이색 데이트 5곳 추천"처럼 목록형이면 카드 하나가 아니라 최상위 배열로
 * 답하는 일이 있어서, 배열로 와도 받아 한 장으로 합친다.
 */
function parseDraftJson(text: string): DraftParse {
  const stripped = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()

  const objStart = stripped.indexOf('{')
  const arrStart = stripped.indexOf('[')
  if (objStart === -1 && arrStart === -1) return { ok: false, truncated: false }
  // 배열이 객체보다 먼저 나오면 최상위가 배열이다
  const isArray = arrStart !== -1 && (objStart === -1 || arrStart < objStart)
  const start = isArray ? arrStart : objStart
  const body = stripped.slice(start)
  if (looksTruncated(body)) return { ok: false, truncated: true }

  const end = body.lastIndexOf(isArray ? ']' : '}')
  if (end === -1) return { ok: false, truncated: true }

  let value: unknown
  try {
    value = JSON.parse(body.slice(0, end + 1))
  } catch {
    return { ok: false, truncated: false }
  }
  if (Array.isArray(value)) {
    const entries = value.filter(
      (v): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v),
    )
    if (entries.length === 0) return { ok: false, truncated: false }
    return { ok: true, draft: mergeDrafts(entries) }
  }
  if (value && typeof value === 'object') return { ok: true, draft: value as Record<string, unknown> }
  return { ok: false, truncated: false }
}

const SYSTEM_PROMPT = `당신은 커플의 데이트·컨텐츠 아이디어 보드에 들어갈 카드를 만드는 도우미입니다.
SNS 게시물의 캡션(과 썸네일 이미지)을 보고 아래 JSON만 출력하세요. 다른 텍스트는 절대 쓰지 마세요.

{
  "title": "카드 제목",
  "categories": ["..."],
  "memo": "간단한 메모",
  "places": [
    {
      "query": "지도에서 찾을 검색어",
      "name": "가게/장소 이름만 (지역명 없이)",
      "address": "캡션에 적힌 실제 도로명/지번주소"
    }
  ]
}

★ 출력은 **언제나 객체 하나**입니다. 게시물이 "이색 데이트 5곳 추천"처럼 목록형이어도
카드를 여러 장 만들지 말고, 카드 한 장의 places 배열에 그 장소들을 전부 담으세요.
최상위에 배열([ ... ])을 쓰면 안 됩니다.

★ 캡션이 없거나 정보가 부족해도 **위 JSON 형식으로만** 답하세요. 설명·사과·되묻기를
쓰지 말고, 모르는 값은 빈 문자열("")이나 빈 배열([])로 두면 됩니다.

규칙:
- title: 한국어로 20자 이내. 장소나 가게 이름이 있으면 꼭 포함하고, 뭘 하는 컨텐츠인지 한눈에 보이게.
  장소가 여러 곳이면 개별 가게 이름 대신 전체를 아우르는 제목을 쓰세요
  (예: "서울·부산 이색 데이트 5곳").
- categories: 사용자가 준 카테고리 목록 중에서만 고르세요 (복수 가능, 맞는 게 없으면 빈 배열).
- memo: 한두 문장. 위치·메뉴·팁 등 나중에 다시 볼 때 유용한 핵심 정보만. 캡션에 정보가 없으면 빈 문자열.
- places: 실제로 갈 수 있는 장소가 나오면 배열에 담으세요. 대부분은 한 곳이지만,
  맛집 투어·데이트 코스처럼 **한 게시물에 여러 장소가 나오면 언급된 곳을 전부 원소로 나눠 담으세요**
  (예: 카페 한 곳 + 식당 한 곳이면 배열 길이 2). 특정 장소가 없는 컨텐츠(집에서 하는 요리, 온라인 등)면
  빈 배열로 두세요. 추측으로 지어내지 마세요 — 캡션이나 이미지에 근거가 있을 때만 씁니다.
  ★ 캡션 본문에 적힌 가게 이름을 가장 우선하세요. "게시물 위치 태그"는 동네·건물처럼
  대충 찍힌 경우가 많으니, 캡션에 가게 이름이 있으면 태그 대신 그걸 쓰고
  태그는 지역명을 보태는 정도로만 참고하세요.
  ★ 한국 맛집 계정은 가게 이름을 캡션 맨 끝에 "📍/🚩 가게이름 (지역)" 형태로 적거나
  해시태그(#청량리맛집 #페스카데리아)로만 남기는 경우가 아주 많습니다.
  이 두 곳을 반드시 확인해서 지역명과 가게 이름을 조합하세요.
  - query: 지도 검색에 쓸 "지역명 + 가게/장소 이름" (예: "속초 중앙시장 만석닭강정").
    가게 이름을 모르면 지역과 종류만이라도 쓰세요.
  - name: query에서 지역명을 뺀 가게/장소 이름만 쓰세요 (예: "만석닭강정").
    지역명을 붙인 검색이 실패했을 때 이 이름만으로 다시 찾아보는 데 씁니다.
    가게 이름을 모르면 빈 문자열로 두세요.
  - address: 캡션에 도로명주소나 지번주소가 문자 그대로 적혀 있으면 그대로 옮겨 적으세요
    (예: "서울 마포구 와우산로 12"). 캡션에 주소가 없으면 빈 문자열로 두세요.
    절대 지어내지 마세요 — 상호명으로 장소를 못 찾았을 때 주소로 좌표를 찾는 데만 씁니다.
- 광고 문구는 memo에 옮기지 마세요. 다만 해시태그는 지역명·가게 이름을 알아내는 근거로는
  적극적으로 활용하세요 (memo·title의 말투에만 섞지 않으면 됩니다).`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' })

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json(500, { error: 'ANTHROPIC_API_KEY secret is not set' })

  let body: { url?: string; caption?: string; categories?: string[] }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'invalid JSON body' })
  }

  const url = body.url?.trim()
  const pastedCaption = typeof body.caption === 'string' ? body.caption.trim() : ''
  if (!url && !pastedCaption) return json(400, { error: 'url or caption is required' })
  const platform = url ? detectPlatform(url) : 'NONE'
  if (!pastedCaption && platform === 'NONE') return json(400, { error: 'unsupported platform' })
  const categories = Array.isArray(body.categories) ? body.categories.filter(Boolean) : []

  const meta: PostMeta | null = pastedCaption
    ? { caption: pastedCaption, imageUrl: null }
    : await fetchPostMeta(normalizeUrl(url!), platform)
  if (!meta?.caption && !meta?.imageUrl) {
    // 500으로 던지지 않는다 — 폼에서 이유를 그대로 보여줄 수 있어야 한다
    return json(200, {
      failed: '게시물 내용을 읽지 못했어요 (비공개·삭제됐거나 인스타그램이 서버 접근을 막았어요)',
      detail: meta?.via ?? '',
      title: '',
      categories: [],
      memo: '',
      places: [],
      place_debug: '',
    })
  }
  // 캡션 없이 썸네일만 건진 경우 — AI가 볼 정보가 거의 없다는 걸 폼에 알려준다
  const captionUsable = isUsefulCaption(meta.caption)
  const captionDetail = captionUsable ? '' : `캡션 수집 실패 — ${meta.via ?? '경로 불명'}`

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
        // 장소를 최대 6곳까지 담다 보면 500으로는 응답이 중간에 잘린다
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
      })
      responseText = message.content.find((b) => b.type === 'text')?.text ?? null
      break
    } catch (err) {
      if (content.length === userContent.length && meta.imageUrl) continue
      console.error('anthropic error:', err)
      const message = err instanceof Error ? err.message : String(err)
      return json(200, {
        failed: 'AI 분석에 실패했어요',
        detail: message.slice(0, 200),
        title: '',
        categories: [],
        memo: '',
        places: [],
        place_debug: '',
      })
    }
  }
  if (!responseText) {
    return json(200, {
      failed: 'AI 분석에 실패했어요',
      detail: '응답이 비어 있어요',
      title: '',
      categories: [],
      memo: '',
      places: [],
      place_debug: '',
    })
  }

  const parsed = parseDraftJson(responseText)
  if (!parsed.ok) {
    return json(200, {
      failed: parsed.truncated
        ? 'AI 응답이 중간에 잘렸어요 (장소가 너무 많은 게시물일 수 있어요)'
        : 'AI가 예상 못 한 형식으로 답했어요',
      detail: responseText.replace(/\s+/g, ' ').slice(0, 200),
      title: '',
      categories: [],
      memo: '',
      places: [],
      place_debug: '',
    })
  }
  const draft = parsed.draft

  // 장소 찾기: AI가 캡션에서 뽑은 검색어들을 하나씩 찾는다. 맛집 투어·데이트 코스처럼
  // 한 게시물에 장소가 여러 곳 나오면 draft.places 배열에 원소가 여러 개 오므로
  // 전부 검색해서 담는다 (카드 하나에 장소 여러 개 = 지도에 핀 여러 개).
  // 게시물의 위치 태그는 실제 가게가 아니라 동네·건물처럼 대충 찍힌 경우가 많아서
  // AI가 캡션에서 하나도 못 찾았을 때의 폴백으로만 쓴다. 실패해도 초안은 그대로 돌려준다.
  const tagged = meta.locationName?.trim() ?? ''
  const MAX_PLACES = 6 // 오탐·과도한 검색 호출을 막는 상한
  const placeGuesses: Array<{ query: string; name: string; address: string }> = Array.isArray(
    draft.places,
  )
    ? draft.places
        .map((entry: unknown) => {
          const p = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {}
          return {
            query: typeof p.query === 'string' ? p.query.trim() : '',
            name: typeof p.name === 'string' ? p.name.trim() : '',
            address: typeof p.address === 'string' ? p.address.trim() : '',
          }
        })
        .filter((p) => p.query || p.name || p.address)
        .slice(0, MAX_PLACES)
    : []

  const foundPlaces: Place[] = []
  const seenNames = new Set<string>()
  const reasons: string[] = []

  for (const guess of placeGuesses) {
    let found: { place: Place | null; debug: string } = { place: null, debug: '' }
    if (guess.query) found = await findPlace(guess.query, 'AI')
    // 갓 오픈한 가게는 "지역명 + 상호명" 조합으로는 색인에 안 잡히는 일이 많다.
    // 상호명만으로 한 번 더 찾아본다 (동명 업소가 걸릴 수 있어 지역명 검색 다음 순서).
    if (!found.place && guess.name && guess.name !== guess.query) {
      const byName = await findPlace(guess.name, 'AI')
      if (byName.place) found = byName
      else reasons.push(byName.debug)
    }
    // 상호명으로 실패했는데 캡션에 실제 주소가 있으면 지오코딩으로 좌표만이라도 찾는다
    // — 등록 안 된 소규모 가게에서 특히 유용하다.
    if (!found.place && guess.address)
      found = await geocodeAddress(guess.address, guess.name || guess.query)
    if (found.place) {
      if (!seenNames.has(found.place.name)) {
        seenNames.add(found.place.name)
        foundPlaces.push(found.place)
      }
    } else if (found.debug) {
      reasons.push(found.debug)
    }
  }

  // AI가 캡션에서 장소를 하나도 못 찾았을 때만 위치 태그로 폴백한다
  // (태그는 부정확한 경우가 많아 캡션 쪽 결과가 있으면 우선하지 않는다)
  if (foundPlaces.length === 0 && tagged) {
    const found = await findPlace(tagged, 'INSTAGRAM')
    if (found.place) foundPlaces.push(found.place)
    else reasons.push(found.debug)
  }

  if (foundPlaces.length === 0 && reasons.length === 0) {
    reasons.push('AI가 캡션에서 장소를 찾지 못했어요 (places 비어 있음)')
  }

  return json(200, {
    detail: captionDetail,
    title: typeof draft.title === 'string' ? draft.title.trim() : '',
    categories: Array.isArray(draft.categories)
      ? draft.categories.filter((c: unknown) => typeof c === 'string' && categories.includes(c))
      : [],
    memo: typeof draft.memo === 'string' ? draft.memo.trim() : '',
    places: foundPlaces,
    place_debug: reasons.join(' / '),
  })
})
