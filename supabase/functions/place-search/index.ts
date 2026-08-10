/**
 * 장소 검색 Edge Function (Supabase)
 *
 * POST { query: string }  →  { places: Place[] }
 *
 * 네이버 지역 검색 API를 서버에서 호출한다. 키가 브라우저에 노출되면 안 되고
 * CORS도 막혀 있어서 반드시 서버를 거쳐야 한다.
 *
 * 필요한 시크릿 (Supabase → Edge Functions → Secrets):
 *   NAVER_CLIENT_ID     : 발급받은 Client ID (또는 API Key ID)
 *   NAVER_CLIENT_SECRET : 발급받은 Client Secret (또는 API Key)
 *
 * 인증 헤더/엔드포인트는 발급 경로(네이버 개발자센터 vs NAVER API HUB)에 따라
 * 다를 수 있어서, 성공하는 조합을 한 번 찾아 기억해두고 재사용한다.
 * 시크릿이 없거나 모든 조합이 실패하면 502를 돌려주고 프론트는 조용히 검색을 접는다.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

interface Place {
  name: string
  address: string
  roadAddress: string
  category: string
  telephone: string
  lat: number | null
  lng: number | null
  url: string
}

interface NaverItem {
  title?: string
  link?: string
  category?: string
  description?: string
  telephone?: string
  address?: string
  roadAddress?: string
  mapx?: string | number
  mapy?: string | number
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
}

/** 검색 결과 제목에는 <b> 태그와 HTML 엔티티가 섞여 나온다 */
function cleanText(value: string | undefined) {
  if (!value) return ''
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
    .trim()
}

/**
 * mapx/mapy → WGS84 경위도.
 * 네이버는 경위도에 10^7을 곱한 정수로 주지만(예: 1270575397 → 127.0575397),
 * 형식이 다를 가능성에 대비해 변환 후 좌표 범위를 검증한다.
 * 이상하면 null — 좌표 없는 장소로 저장되고 지도에만 안 뜬다.
 */
function toCoord(raw: string | number | undefined, max: number): number | null {
  if (raw === undefined || raw === null || raw === '') return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value === 0) return null
  const degrees = Math.abs(value) >= 1_000_000 ? value / 10_000_000 : value
  if (!Number.isFinite(degrees) || Math.abs(degrees) > max || degrees === 0) return null
  return Number(degrees.toFixed(7))
}

function toPlace(item: NaverItem): Place | null {
  const name = cleanText(item.title)
  if (!name) return null
  const roadAddress = cleanText(item.roadAddress)
  const address = cleanText(item.address)
  return {
    name,
    address: address || roadAddress,
    roadAddress,
    category: cleanText(item.category),
    telephone: cleanText(item.telephone),
    lat: toCoord(item.mapy, 90),
    lng: toCoord(item.mapx, 180),
    // 지역 검색의 link는 업체 홈페이지라서, 지도 링크는 검색 URL로 만든다
    url: `https://map.naver.com/p/search/${encodeURIComponent(name)}`,
  }
}

const OPENAPI = 'https://openapi.naver.com/v1/search/local.json'
const APIGW = 'https://naveropenapi.apigw.ntruss.com/v1/search/local.json'

/**
 * 발급 경로에 따라 헤더 이름이 달라서(개발자센터 vs NAVER API HUB)
 * 가능한 조합을 순서대로 시도한다. 한 번 성공하면 그 조합만 계속 쓴다.
 */
function candidates(id: string, secret: string) {
  const naver = { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret }
  const ncp = { 'X-NCP-APIGW-API-KEY-ID': id, 'X-NCP-APIGW-API-KEY': secret }
  return [
    { label: 'openapi+naver', url: OPENAPI, headers: naver },
    { label: 'apigw+ncp', url: APIGW, headers: ncp },
    { label: 'openapi+ncp', url: OPENAPI, headers: ncp },
    { label: 'apigw+naver', url: APIGW, headers: naver },
  ]
}

// 성공한 조합의 label — 웜 인스턴스에서는 탐색을 건너뛴다
let preferred: string | null = null

async function searchNaver(query: string): Promise<NaverItem[] | null> {
  const id = Deno.env.get('NAVER_CLIENT_ID')
  const secret = Deno.env.get('NAVER_CLIENT_SECRET')
  if (!id || !secret) {
    console.error('place-search: NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 시크릿이 없습니다')
    return null
  }

  const all = candidates(id, secret)
  const ordered = preferred ? [...all].sort((a) => (a.label === preferred ? -1 : 1)) : all
  const params = `?query=${encodeURIComponent(query)}&display=5`

  for (const attempt of ordered) {
    try {
      const res = await fetch(`${attempt.url}${params}`, { headers: attempt.headers })
      if (!res.ok) {
        console.error(`place-search: ${attempt.label} 실패`, res.status, (await res.text()).slice(0, 200))
        continue
      }
      const data = await res.json()
      if (!Array.isArray(data?.items)) {
        console.error(`place-search: ${attempt.label} 응답 형식이 예상과 다름`)
        continue
      }
      if (preferred !== attempt.label) {
        preferred = attempt.label
        console.log(`place-search: ${attempt.label} 조합으로 동작합니다`)
      }
      return data.items as NaverItem[]
    } catch (err) {
      console.error(`place-search: ${attempt.label} 오류`, err)
    }
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' })

  let body: { query?: string }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'invalid json body' })
  }

  const query = typeof body.query === 'string' ? body.query.trim() : ''
  if (!query) return json(400, { error: 'query is required' })

  const items = await searchNaver(query)
  if (!items) return json(502, { error: 'place search failed' })

  const places = items.map(toPlace).filter((p): p is Place => p !== null)
  return json(200, { places })
})
