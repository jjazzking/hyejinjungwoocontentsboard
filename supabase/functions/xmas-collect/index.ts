// 🎄 크리스마스 시즌 장소 수집 Edge Function.
//
// POST { step }
//   'naver'            네이버 블로그·뉴스 검색 → Claude로 장소·기간 추출 → 지역 검색으로 좌표 → 저장
//   'instagram_start'  Apify 인스타 해시태그 수집을 '비동기로' 시작만 한다 (몇 분 걸림)
//   'instagram_ingest' 끝난 Apify 실행의 게시물을 가져와 위와 같은 방식으로 저장
//   'weekly'           naver + instagram_start (pg_cron이 매주 부르는 것)
//
// Apify를 기다렸다가 처리까지 한 번에 하면 Edge Function 제한 시간(무료 150초)을 넘기 쉬워서
// 시작/수거를 두 번으로 나눴다. 화면의 '지금 수집' 버튼은 start → 상태 확인 → ingest 를 차례로 부른다.
//
// 한 번 읽은 글은 xmas_sources 에 남겨 다시 분석하지 않는다 (Claude·Apify 비용 절약).
// 시간이 모자라면 남은 글은 기록하지 않고 멈춘다 → 다음 실행에서 이어서 처리된다.
//
// 시크릿: ANTHROPIC_API_KEY · APIFY_TOKEN · NAVER_CLIENT_ID · NAVER_CLIENT_SECRET
//        (SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 는 Supabase가 자동으로 넣어 준다)
// 실패는 500 대신 200 + detail(한국어 사유 목록)로 돌려준다 — 화면에서 바로 원인을 볼 수 있게.
import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// ── 수집 대상 ─────────────────────────────────────────────────
// 검색어·해시태그는 여기서만 고치면 된다
const NAVER_QUERIES = [
  '크리스마스 마켓',
  '크리스마스 트리 점등',
  '백화점 크리스마스 외관',
  '크리스마스 데이트 서울',
  '크리스마스 팝업',
  '호텔 크리스마스 트리',
  '크리스마스 카페 장식',
  '빛축제 크리스마스',
]
const INSTAGRAM_HASHTAGS = [
  '크리스마스마켓',
  '크리스마스트리',
  '서울크리스마스',
  '크리스마스데이트',
  '크리스마스팝업',
  '크리스마스카페',
]
const NAVER_DISPLAY = 40 // 검색어 하나당 가져올 글 수 (블로그·뉴스 각각)
const INSTAGRAM_PER_TAG = 30 // 해시태그 하나당 게시물 수 — Apify 크레딧과 직결된다
const BATCH_SIZE = 20 // Claude 한 번에 읽힐 글 수
const TIME_BUDGET_MS = 115_000 // 이 시간을 넘기면 새 묶음을 시작하지 않는다

const KINDS = ['MARKET', 'TREE', 'FACADE', 'LIGHTS', 'CAFE', 'HOTEL', 'POPUP', 'ETC']

// ── 공용 도우미 ───────────────────────────────────────────────
async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 10000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
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

function stripTags(value: string | undefined | null) {
  return decodeEntities((value ?? '').replace(/<[^>]*>/g, '')).trim()
}

/** 같은 장소를 묶기 위한 이름 정규화 — 공백·기호를 지우고 소문자로 */
function normalizeName(name: string) {
  return name.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
}

/** 동시에 limit개씩만 돌린다 (외부 API 속도 제한 대비) */
async function mapLimit<T, R>(list: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = new Array(list.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) {
      const index = next++
      results[index] = await fn(list[index])
    }
  })
  await Promise.all(workers)
  return results
}

/** 이번 시즌의 시작일 — 이보다 오래된 글은 작년 얘기라 버린다 */
function seasonStart(now = new Date()) {
  const year = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1
  return `${year}-10-15`
}

/** 'YYYYMMDD' | RFC 날짜 | ISO → 'YYYY-MM-DD' (못 읽으면 null) */
function toDay(raw: string | undefined | null): string | null {
  if (!raw) return null
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null
  // 한국 날짜 기준
  return new Date(date.getTime() + 9 * 3600_000).toISOString().slice(0, 10)
}

function validDay(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

// ── 네이버 (NAVER API HUB) ────────────────────────────────────
const NAVER_BASE = 'https://naverapihub.apigw.ntruss.com/search/v1'

function naverHeaders() {
  const id = Deno.env.get('NAVER_CLIENT_ID')
  const secret = Deno.env.get('NAVER_CLIENT_SECRET')
  if (!id || !secret) return null
  return { 'X-NCP-APIGW-API-KEY-ID': id, 'X-NCP-APIGW-API-KEY': secret }
}

interface RawItem {
  url: string
  type: 'BLOG' | 'NEWS' | 'INSTAGRAM'
  title: string
  text: string
  postedAt: string | null
  imageUrl?: string | null
  locationName?: string | null
}

async function searchNaver(kind: 'blog' | 'news', query: string, detail: string[]) {
  const headers = naverHeaders()
  if (!headers) return []
  try {
    const res = await fetchWithTimeout(
      `${NAVER_BASE}/${kind}?query=${encodeURIComponent(query)}&display=${NAVER_DISPLAY}&sort=date`,
      { headers },
    )
    if (!res.ok) {
      const body = (await res.text()).replace(/\s+/g, ' ').slice(0, 140)
      detail.push(`네이버 ${kind === 'blog' ? '블로그' : '뉴스'} 검색 실패('${query}') — ${res.status} ${body}`)
      return []
    }
    const data = await res.json()
    const items = Array.isArray(data?.items) ? data.items : []
    return items.map((item: Record<string, string>): RawItem => ({
      url: item.originallink || item.link,
      type: kind === 'blog' ? 'BLOG' : 'NEWS',
      title: stripTags(item.title),
      text: stripTags(item.description),
      postedAt: toDay(item.postdate ?? item.pubDate),
    }))
  } catch (err) {
    detail.push(`네이버 ${kind} 검색 오류('${query}') — ${err instanceof Error ? err.message : err}`)
    return []
  }
}

interface Place {
  name: string
  address: string
  lat: number | null
  lng: number | null
  category: string
  url: string
  source: 'AI'
}

function toCoord(raw: unknown, max: number): number | null {
  const value = Number(raw)
  if (!Number.isFinite(value) || value === 0) return null
  const degrees = Math.abs(value) >= 1_000_000 ? value / 10_000_000 : value
  if (!Number.isFinite(degrees) || Math.abs(degrees) > max || degrees === 0) return null
  return Number(degrees.toFixed(7))
}

/** 장소 이름 → 네이버 지역 검색 첫 결과. 실패하면 null (이유는 detail에 한 번만) */
async function findPlace(query: string, detail: string[]): Promise<Place | null> {
  const headers = naverHeaders()
  if (!headers) return null
  try {
    const res = await fetchWithTimeout(
      `${NAVER_BASE}/local?query=${encodeURIComponent(query)}&display=1`,
      { headers },
      8000,
    )
    if (!res.ok) {
      const message = `네이버 지역 검색 실패 — ${res.status}`
      if (!detail.includes(message)) detail.push(message)
      return null
    }
    const data = await res.json()
    const item = Array.isArray(data?.items) ? data.items[0] : null
    const name = item ? stripTags(item.title) : ''
    if (!name) return null
    return {
      name,
      address: stripTags(item.roadAddress) || stripTags(item.address),
      lat: toCoord(item.mapy, 90),
      lng: toCoord(item.mapx, 180),
      category: stripTags(item.category),
      url: `https://map.naver.com/p/search/${encodeURIComponent(name)}`,
      source: 'AI',
    }
  } catch {
    return null
  }
}

// ── Apify (인스타 해시태그) ───────────────────────────────────
const APIFY_ACTOR = 'apify~instagram-scraper'

async function startInstagramRun(detail: string[]) {
  const token = Deno.env.get('APIFY_TOKEN')
  if (!token) {
    detail.push('APIFY_TOKEN 시크릿이 없어 인스타 수집을 건너뜀')
    return null
  }
  try {
    const res = await fetchWithTimeout(
      `https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directUrls: INSTAGRAM_HASHTAGS.map(
            (tag) => `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`,
          ),
          resultsType: 'posts',
          resultsLimit: INSTAGRAM_PER_TAG,
          onlyPostsNewerThan: seasonStart(),
          addParentData: false,
        }),
      },
      20000,
    )
    if (!res.ok) {
      detail.push(`Apify 실행 시작 실패 — ${res.status} ${(await res.text()).slice(0, 140)}`)
      return null
    }
    const data = (await res.json())?.data
    return data?.id ? { runId: String(data.id), datasetId: String(data.defaultDatasetId) } : null
  } catch (err) {
    detail.push(`Apify 실행 시작 오류 — ${err instanceof Error ? err.message : err}`)
    return null
  }
}

async function apifyRunStatus(runId: string): Promise<string> {
  const token = Deno.env.get('APIFY_TOKEN') ?? ''
  const res = await fetchWithTimeout(`https://api.apify.com/v2/actor-runs/${runId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return 'UNKNOWN'
  return String((await res.json())?.data?.status ?? 'UNKNOWN')
}

async function apifyItems(datasetId: string): Promise<RawItem[]> {
  const token = Deno.env.get('APIFY_TOKEN') ?? ''
  const res = await fetchWithTimeout(
    `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&limit=2000`,
    { headers: { Authorization: `Bearer ${token}` } },
    30000,
  )
  if (!res.ok) throw new Error(`데이터셋 읽기 실패 — ${res.status}`)
  const items = await res.json()
  if (!Array.isArray(items)) return []
  return items
    .filter((post) => typeof post?.url === 'string' && typeof post?.caption === 'string')
    .map((post): RawItem => ({
      url: post.url,
      type: 'INSTAGRAM',
      title: post.ownerUsername ? `@${post.ownerUsername}` : '인스타그램 게시물',
      text: post.caption,
      postedAt: toDay(post.timestamp),
      imageUrl: typeof post.displayUrl === 'string' ? post.displayUrl : null,
      locationName: typeof post.locationName === 'string' ? post.locationName : null,
    }))
}

// ── Claude로 장소·기간 뽑기 ───────────────────────────────────
const SYSTEM_PROMPT = `당신은 한국 커플이 크리스마스 시즌 주말에 갈 곳을 고르도록 돕는 수집 도우미입니다.
블로그·뉴스·인스타 글 여러 개를 받으면, 글마다 아래 JSON 원소 하나씩을 만들어 {"items":[...]} 만 출력하세요.
다른 텍스트는 절대 쓰지 마세요.

{"i": 글 번호, "relevant": true/false, "name": "장소/행사 이름", "kind": "...",
 "place_query": "지도 검색어", "start": "YYYY-MM-DD"|null, "end": "YYYY-MM-DD"|null, "summary": "한 줄"}

규칙:
- relevant: 한국에서 직접 가서 볼 수 있는 크리스마스·연말 장식, 트리, 크리스마스 마켓, 빛축제,
  백화점·호텔·카페의 크리스마스 연출, 크리스마스 팝업이면 true.
  광고성 상품 판매, 케이크 예약, 해외, 집 꾸미기, 장소가 특정되지 않는 글은 false.
- name: 사람이 알아볼 이름. 예) "더현대 서울 크리스마스 빌리지", "신세계 본점 미디어파사드".
- kind: MARKET(마켓) TREE(대형 트리·점등) FACADE(백화점 외관·미디어파사드) LIGHTS(빛축제·일루미네이션)
  CAFE(카페·식당 장식) HOTEL(호텔 로비·라운지) POPUP(팝업스토어) ETC 중 하나.
- place_query: 네이버 지도에서 찾을 "지역 + 건물/가게 이름". 예) "여의도 더현대 서울".
  글에 근거가 없으면 지어내지 말고 빈 문자열.
- start/end: 글에 운영 기간·점등일이 적혀 있을 때만. 연도가 없으면 올해 시즌으로 보되
  1~2월이면 다음 해. 근거가 없으면 null — 절대 추측하지 마세요.
- summary: 무엇을 볼 수 있는지·팁을 40자 이내 한 문장으로.
- relevant가 false면 name·place_query는 빈 문자열, 나머지는 null/빈 값.`

interface Extracted {
  relevant: boolean
  name: string
  kind: string
  placeQuery: string
  start: string | null
  end: string | null
  summary: string
}

function parseJson(text: string) {
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('no JSON')
  return JSON.parse(stripped.slice(start, end + 1))
}

async function extractBatch(
  client: Anthropic,
  batch: RawItem[],
  today: string,
): Promise<Map<number, Extracted>> {
  const lines = batch.map((item, i) => {
    const location = item.locationName ? ` / 위치태그: ${item.locationName}` : ''
    const body = `${item.title}\n${item.text}`.replace(/\s+/g, ' ').slice(0, 700)
    return `[${i}] (${item.type}, ${item.postedAt ?? '날짜 모름'}${location}) ${body}`
  })
  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `오늘: ${today}\n\n${lines.join('\n\n')}` }],
  })
  const text = message.content.find((b) => b.type === 'text')?.text ?? ''
  const parsed = parseJson(text)
  const result = new Map<number, Extracted>()
  for (const raw of Array.isArray(parsed?.items) ? parsed.items : []) {
    const i = Number(raw?.i)
    if (!Number.isInteger(i) || i < 0 || i >= batch.length) continue
    result.set(i, {
      relevant: raw.relevant === true && typeof raw.name === 'string' && raw.name.trim() !== '',
      name: String(raw.name ?? '').trim(),
      kind: KINDS.includes(raw.kind) ? raw.kind : 'ETC',
      placeQuery: String(raw.place_query ?? '').trim(),
      start: validDay(raw.start),
      end: validDay(raw.end),
      summary: String(raw.summary ?? '').trim().slice(0, 80),
    })
  }
  return result
}

// ── 저장 ─────────────────────────────────────────────────────
interface SpotRow {
  id: string
  spot_key: string
  name: string
  kind: string
  summary: string
  start_date: string | null
  end_date: string | null
  place: Place | null
  thumbnail_url: string | null
  mention_count: number
  last_seen_at?: string
}

// deno-lint-ignore no-explicit-any
type Supa = ReturnType<typeof createClient<any>>

/**
 * 글 목록을 분석해 xmas_spots / xmas_sources 에 반영한다.
 * 처리한 글만 xmas_sources 에 남기므로, 시간이 모자라 못 한 글은 다음 실행에서 다시 잡힌다.
 */
async function processItems(supabase: Supa, items: RawItem[], startedAt: number, detail: string[]) {
  const stats = { fetched: items.length, fresh: 0, analyzed: 0, relevant: 0, spotsNew: 0, spotsUpdated: 0, unresolved: 0, leftover: 0 }

  // 1) 이번 실행 안의 중복 + 이미 읽은 글 거르기
  const unique = [...new Map(items.filter((it) => it.url).map((it) => [it.url, it])).values()]
  const season = seasonStart()
  const recent = unique.filter((it) => !it.postedAt || it.postedAt >= season)
  const seen = new Set<string>()
  for (let i = 0; i < recent.length; i += 200) {
    const urls = recent.slice(i, i + 200).map((it) => it.url)
    const { data } = await supabase.from('xmas_sources').select('url').in('url', urls)
    for (const row of data ?? []) seen.add((row as { url: string }).url)
  }
  const fresh = recent.filter((it) => !seen.has(it.url))
  stats.fresh = fresh.length
  if (fresh.length === 0) return stats

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    detail.push('ANTHROPIC_API_KEY 시크릿이 없어 분석을 못 함')
    return stats
  }
  const client = new Anthropic({ apiKey })
  const today = toDay(new Date().toISOString())!

  // 2) Claude로 묶음 분석 (시간 예산을 넘기면 남은 묶음은 다음 실행으로)
  const batches: RawItem[][] = []
  for (let i = 0; i < fresh.length; i += BATCH_SIZE) batches.push(fresh.slice(i, i + BATCH_SIZE))
  const done: Array<{ item: RawItem; ex: Extracted | null }> = []
  await mapLimit(batches, 3, async (batch) => {
    if (Date.now() - startedAt > TIME_BUDGET_MS - 25_000) {
      stats.leftover += batch.length
      return
    }
    try {
      const result = await extractBatch(client, batch, today)
      batch.forEach((item, i) => done.push({ item, ex: result.get(i) ?? null }))
    } catch (err) {
      stats.leftover += batch.length
      const message = `AI 분석 실패 — ${err instanceof Error ? err.message : err}`
      if (!detail.includes(message)) detail.push(message)
    }
  })
  stats.analyzed = done.length

  // 3) 관련 글의 장소를 네이버 지역 검색으로 확정 (같은 검색어는 한 번만)
  const relevant = done.filter((d) => d.ex?.relevant)
  stats.relevant = relevant.length
  const queries = [...new Set(relevant.map((d) => d.ex!.placeQuery || d.ex!.name))]
  const placeByQuery = new Map<string, Place | null>()
  await mapLimit(queries, 5, async (q) => {
    placeByQuery.set(q, Date.now() - startedAt > TIME_BUDGET_MS ? null : await findPlace(q, detail))
  })

  // 4) 기존 후보 불러와 합치기
  const { data: existingRows, error: loadError } = await supabase
    .from('xmas_spots')
    .select('id, spot_key, name, kind, summary, start_date, end_date, place, thumbnail_url, mention_count')
  if (loadError) {
    detail.push(`기존 후보 불러오기 실패 — ${loadError.message}`)
    return stats
  }
  const spots = new Map<string, SpotRow>()
  for (const row of (existingRows ?? []) as SpotRow[]) spots.set(row.spot_key, row)
  const touched = new Map<string, SpotRow>()
  const sourceRows: Array<Record<string, unknown>> = []
  const nowIso = new Date().toISOString()

  for (const { item, ex } of done) {
    let spotId: string | null = null
    if (ex?.relevant) {
      const place = placeByQuery.get(ex.placeQuery || ex.name) ?? null
      const key = place ? `n:${normalizeName(place.name)}` : `q:${normalizeName(ex.name)}`
      let spot = touched.get(key) ?? spots.get(key)
      if (!spot) {
        spot = {
          id: crypto.randomUUID(),
          spot_key: key,
          name: ex.name,
          kind: ex.kind,
          summary: ex.summary,
          start_date: ex.start,
          end_date: ex.end,
          place,
          thumbnail_url: item.imageUrl ?? null,
          mention_count: 0,
        }
        stats.spotsNew += 1
        if (!place) stats.unresolved += 1
      } else if (!touched.has(key)) {
        stats.spotsUpdated += 1
      }
      // 이미 아는 값은 지키고 빈 칸만 채운다. 기간은 더 넓게 잡힌 쪽으로
      spot = {
        ...spot,
        kind: spot.kind === 'ETC' ? ex.kind : spot.kind,
        summary: spot.summary || ex.summary,
        start_date: spot.start_date && ex.start ? (ex.start < spot.start_date ? ex.start : spot.start_date) : (spot.start_date ?? ex.start),
        end_date: spot.end_date && ex.end ? (ex.end > spot.end_date ? ex.end : spot.end_date) : (spot.end_date ?? ex.end),
        place: spot.place ?? place,
        thumbnail_url: spot.thumbnail_url ?? item.imageUrl ?? null,
        mention_count: spot.mention_count + 1,
        last_seen_at: nowIso,
      }
      touched.set(key, spot)
      spotId = spot.id
    }
    sourceRows.push({
      url: item.url,
      spot_id: spotId,
      type: item.type,
      title: item.title.slice(0, 200),
      posted_at: item.postedAt,
    })
  }

  if (touched.size > 0) {
    const { error } = await supabase.from('xmas_spots').upsert([...touched.values()], { onConflict: 'spot_key' })
    if (error) {
      detail.push(`후보 저장 실패 — ${error.message}`)
      return stats
    }
  }
  if (sourceRows.length > 0) {
    const { error } = await supabase.from('xmas_sources').upsert(sourceRows, { onConflict: 'url', ignoreDuplicates: true })
    if (error) detail.push(`출처 저장 실패 — ${error.message}`)
  }
  return stats
}

// ── 단계별 실행 ──────────────────────────────────────────────
async function runNaver(supabase: Supa, startedAt: number, detail: string[]) {
  if (!naverHeaders()) {
    detail.push('NAVER_CLIENT_ID/NAVER_CLIENT_SECRET 시크릿이 없어 네이버 수집을 건너뜀')
    return null
  }
  const lists = await mapLimit(
    NAVER_QUERIES.flatMap((q) => [['blog', q], ['news', q]] as const),
    4,
    ([kind, q]) => searchNaver(kind, q, detail),
  )
  return processItems(supabase, lists.flat(), startedAt, detail)
}

async function runInstagramStart(supabase: Supa, detail: string[]) {
  // 이미 돌고 있는(아직 수거 안 한) 실행이 있으면 새로 시작하지 않는다 — 크레딧 중복 방지
  const { data: pending } = await supabase
    .from('xmas_runs')
    .select('apify_run_id, created_at')
    .eq('step', 'instagram_start')
    .eq('ingested', false)
    .neq('status', 'FAILED')
    .order('created_at', { ascending: false })
    .limit(1)
  const last = pending?.[0] as { apify_run_id: string; created_at: string } | undefined
  if (last && Date.now() - new Date(last.created_at).getTime() < 6 * 3600_000) {
    detail.push('아직 수거하지 않은 인스타 수집이 있어 새로 시작하지 않음')
    return { started: false, runId: last.apify_run_id }
  }
  const run = await startInstagramRun(detail)
  if (!run) return { started: false }
  await supabase.from('xmas_runs').insert({
    step: 'instagram_start',
    apify_run_id: run.runId,
    dataset_id: run.datasetId,
    status: 'RUNNING',
  })
  return { started: true, runId: run.runId }
}

async function runInstagramIngest(supabase: Supa, startedAt: number, detail: string[]) {
  const { data } = await supabase
    .from('xmas_runs')
    .select('id, apify_run_id, dataset_id')
    .eq('step', 'instagram_start')
    .eq('ingested', false)
    .neq('status', 'FAILED')
    .order('created_at', { ascending: false })
    .limit(1)
  const run = data?.[0] as { id: string; apify_run_id: string; dataset_id: string } | undefined
  if (!run) {
    detail.push('수거할 인스타 수집이 없음 (먼저 시작해야 함)')
    return { pending: false, stats: null }
  }
  const status = await apifyRunStatus(run.apify_run_id)
  if (status === 'READY' || status === 'RUNNING') return { pending: true, stats: null }
  if (status !== 'SUCCEEDED') {
    detail.push(`Apify 실행이 ${status} 상태로 끝남 — 크레딧 부족이나 인스타 차단일 수 있음`)
    await supabase.from('xmas_runs').update({ status: 'FAILED', detail: status }).eq('id', run.id)
    return { pending: false, stats: null }
  }
  const items = await apifyItems(run.dataset_id)
  const stats = await processItems(supabase, items, startedAt, detail)
  // 시간이 모자라 남은 글이 있으면 수거 완료로 치지 않는다 — 다음 호출에서 이어서
  if (stats.leftover === 0) {
    await supabase.from('xmas_runs').update({ ingested: true, status: 'DONE' }).eq('id', run.id)
  }
  return { pending: false, stats }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ ok: false, detail: ['POST만 받습니다'] })

  const startedAt = Date.now()
  let step = 'weekly'
  try {
    const body = await req.json()
    if (typeof body?.step === 'string') step = body.step
  } catch {
    // 본문이 없으면 weekly
  }

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return json({ ok: false, step, detail: ['Supabase 서비스 키를 못 읽음'] })
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  const detail: string[] = []
  const result: Record<string, unknown> = { ok: true, step }
  try {
    if (step === 'naver' || step === 'weekly') result.naver = await runNaver(supabase, startedAt, detail)
    if (step === 'instagram_start' || step === 'weekly') result.instagram = await runInstagramStart(supabase, detail)
    if (step === 'instagram_ingest') Object.assign(result, await runInstagramIngest(supabase, startedAt, detail))
    if (!['naver', 'weekly', 'instagram_start', 'instagram_ingest'].includes(step)) {
      result.ok = false
      detail.push(`모르는 step: ${step}`)
    }
  } catch (err) {
    result.ok = false
    detail.push(`수집 중 오류 — ${err instanceof Error ? err.message : err}`)
  }
  result.detail = detail
  result.elapsed_ms = Date.now() - startedAt

  // 화면에 '마지막 수집' 결과를 보여 주기 위해 남긴다 (진행 중 확인 응답은 남기지 않음)
  if (!(step === 'instagram_ingest' && result.pending)) {
    await supabase.from('xmas_runs').insert({
      step: step === 'instagram_start' ? 'instagram_kick' : step,
      status: result.ok ? 'DONE' : 'FAILED',
      ingested: true,
      stats: result,
      detail: detail.join('\n'),
    })
  }
  return json(result)
})
