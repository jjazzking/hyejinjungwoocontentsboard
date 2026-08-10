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

/**
 * NAVER API HUB 공통 설정 (개발 가이드 확인 완료)
 *   호스트 : https://naverapihub.apigw.ntruss.com
 *   헤더   : X-NCP-APIGW-API-KEY-ID / X-NCP-APIGW-API-KEY
 *   검색 API는 GET 방식
 *
 * 지역 검색의 하위 경로만 확실하지 않아 유력한 후보를 순서대로 시도하고,
 * 성공한 조합을 기억해 재사용한다. 구 개발자센터 엔드포인트는 맨 뒤에 남겨
 * 예전 방식으로 발급한 키도 동작하게 해 두었다.
 *
 * naveropenapi.apigw.ntruss.com/v1/search/local.json 은 실제 호출에서
 * 404 "URL not found" 가 확인되어 후보에서 제외했다.
 */
const HUB = 'https://naverapihub.apigw.ntruss.com'
const OPENAPI = 'https://openapi.naver.com/v1/search/local.json'

function candidates(id: string, secret: string) {
  const ncp = { 'X-NCP-APIGW-API-KEY-ID': id, 'X-NCP-APIGW-API-KEY': secret }
  const naver = { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret }
  const hubPaths = [
    '/search/v1/local.json',
    '/search/v1/local',
    '/v1/search/local.json',
    '/search/local.json',
  ]
  return [
    ...hubPaths.map((path) => ({ label: `hub${path}`, url: `${HUB}${path}`, headers: ncp })),
    { label: 'openapi+naver', url: OPENAPI, headers: naver },
    { label: 'openapi+ncp', url: OPENAPI, headers: ncp },
  ]
}

/** 응답에서 결과 배열을 꺼낸다 (경로에 따라 감싸는 모양이 다를 수 있어 방어적으로). */
function extractItems(data: unknown): NaverItem[] | null {
  const root = data as Record<string, unknown> | null
  if (!root || typeof root !== 'object') return null
  for (const value of [root.items, (root.result as Record<string, unknown>)?.items, root.places]) {
    if (Array.isArray(value)) return value as NaverItem[]
  }
  return null
}

// 성공한 조합의 label — 웜 인스턴스에서는 탐색을 건너뛴다
let preferred: string | null = null

interface SearchResult {
  items: NaverItem[] | null
  /** 실패했을 때 화면에 보여줄 짧은 원인 (조합별 응답 요약) */
  detail: string
}

async function searchNaver(query: string): Promise<SearchResult> {
  const id = Deno.env.get('NAVER_CLIENT_ID')
  const secret = Deno.env.get('NAVER_CLIENT_SECRET')
  if (!id || !secret) {
    const detail = 'NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 시크릿이 등록되어 있지 않습니다'
    console.error(`place-search: ${detail}`)
    return { items: null, detail }
  }

  const all = candidates(id, secret)
  const ordered = preferred ? [...all].sort((a) => (a.label === preferred ? -1 : 1)) : all
  const params = `?query=${encodeURIComponent(query)}&display=5`
  const failures: string[] = []

  for (const attempt of ordered) {
    try {
      const res = await fetch(`${attempt.url}${params}`, { headers: attempt.headers })
      if (!res.ok) {
        const body = (await res.text()).replace(/\s+/g, ' ').slice(0, 160)
        console.error(`place-search: ${attempt.label} 실패`, res.status, body)
        failures.push(`${attempt.label} → ${res.status} ${body}`)
        continue
      }
      const data = await res.json()
      const items = extractItems(data)
      if (!items) {
        const shape = JSON.stringify(data).replace(/\s+/g, ' ').slice(0, 160)
        console.error(`place-search: ${attempt.label} 응답 형식이 예상과 다름`, shape)
        failures.push(`${attempt.label} → 200인데 결과 배열이 없음: ${shape}`)
        continue
      }
      if (preferred !== attempt.label) {
        preferred = attempt.label
        console.log(`place-search: ${attempt.label} 조합으로 동작합니다`)
      }
      return { items, detail: '' }
    } catch (err) {
      console.error(`place-search: ${attempt.label} 오류`, err)
      failures.push(`${attempt.label} → ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return { items: null, detail: failures.join(' / ') }
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

  // 실패해도 200으로 돌려주고 detail을 함께 보낸다 —
  // 로그를 뒤지지 않아도 화면에서 바로 원인을 볼 수 있게 하기 위해서다.
  const { items, detail } = await searchNaver(query)
  if (!items) return json(200, { places: [], failed: true, detail })

  const places = items.map(toPlace).filter((p): p is Place => p !== null)
  return json(200, { places })
})
