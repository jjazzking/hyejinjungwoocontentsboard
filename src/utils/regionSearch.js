/**
 * 지역(동네) 검색 — "가고 싶은 동네"를 추상적인 문장으로 찾는다.
 *
 * 후보는 **보드에 저장된 카드가 있는 동네뿐**이다 (src/utils/regions.js 가 만든다).
 * 새로운 지역을 발굴해 주지는 않는다 — 우리가 모아 둔 것 중에서 고르는 기능이다.
 *
 * 1순위: Edge Function(region-search) → Claude 가 관련도(0~100)와 이유를 매긴다
 * 폴백:  이름·태그·장소 이름을 훑는 로컬 매칭 (Supabase 미설정이거나 호출이 실패했을 때)
 *        키가 없어도 앱이 완전히 동작해야 한다는 이중 모드 규칙 때문에 반드시 남겨 둔다.
 */
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js'
import { regionDistanceKm } from './regions.js'
import { cardTimeSlots, TIME_SLOTS } from './timeSlots.js'

/** AI 검색을 쓸 수 있는 환경인지 (키 없이 빌드하면 false → 로컬 매칭만) */
export const isAiRegionSearchAvailable = isSupabaseConfigured

/** Haiku가 동네 수십 개를 읽고 답하는 시간 + 여유 */
const TIMEOUT_MS = 30000
/** 한 번에 판단을 맡길 최대 동네 수 (서버의 MAX_REGIONS 와 맞춘다) */
const MAX_REGIONS = 40
/** 동네 하나를 설명할 카드 수 (서버의 MAX_CARDS_PER_REGION 과 맞춘다) */
const MAX_CARDS_PER_REGION = 8
/** 로컬 매칭에서 돌려줄 최대 동네 수 */
const MAX_LOCAL_RESULTS = 8

/**
 * 동네 하나를 서버에 보낼 형태로 추린다.
 *
 * ★ 카드를 한 장씩 늘어놓지 않고 **동네 단위로 뭉쳐서** 보낸다. 예전엔 카드마다
 *   제목·태그·장소·주소·메모를 다 실어 보냈는데, 동네 40곳이면 입력이 3만 자를 넘어
 *   검색 한 번에 토큰이 수만 개씩 나갔다. AI가 동네를 고르는 데 실제로 쓰는 건
 *   **가게 이름·태그·제목**이고 메모는 그 요약이라 거의 중복이었다.
 *
 * 주소는 통째로 보내지 않고 `hint`(그 동네의 대표 도로명)만 area에 얹는다 —
 * '충무로'처럼 부르는 이름이 도로명에만 남아 있는 곳을 맞히려면 그건 있어야 한다.
 */
function toPayload(region) {
  const cards = region.contents.slice(0, MAX_CARDS_PER_REGION)
  const tags = new Set()
  const places = new Set()
  for (const content of cards) {
    for (const category of content.categories ?? []) tags.add(category)
    for (const place of content.places ?? []) if (place?.name) places.add(place.name)
  }
  return {
    label: region.label,
    // '중구 · 충무로 일대'처럼 대표 도로명까지 (지명 검색의 유일한 단서인 경우가 있다)
    area: [region.fullLabel, region.hint && `${region.hint} 일대`].filter(Boolean).join(' · '),
    count: region.contents.length,
    tags: [...tags].slice(0, 5),
    places: [...places].slice(0, 8),
    titles: cards.map((content) => (content.title ?? '').slice(0, 30)).filter(Boolean),
  }
}

/**
 * 검색어를 2글자 이상 토막으로 자른다.
 * 조사가 붙은 채로 들어오는 게 보통이라('성수동에서') 완전 일치 대신 부분 일치를 쓴다.
 * '충무로역'·'성수 근처'처럼 지명 뒤에 붙는 말은 떼어 낸다 —
 * 주소에는 '충무로'로만 적혀 있어서 그대로 두면 아무 데도 안 걸린다.
 */
const NAME_TAILS = /(역|근처|주변|부근|쪽|일대|에서|으로|까지)$/

function tokenize(query) {
  const tokens = new Set()
  for (const raw of query.toLowerCase().split(/[\s,·/]+/)) {
    if (raw.length >= 2) tokens.add(raw)
    const trimmed = raw.replace(NAME_TAILS, '')
    if (trimmed.length >= 2) tokens.add(trimmed)
  }
  return [...tokens]
}

/** 카드 한 장에서 매칭에 쓸 문자열을 모은다 (캡션 원문은 너무 길어 제외) */
function cardText(content) {
  // 주소도 넣는다 — '충무로'처럼 동네 이름이 도로명에만 남아 있는 곳을 잡기 위해서
  const places = (content.places ?? [])
    .map((p) => `${p.name ?? ''} ${p.category ?? ''} ${p.address ?? ''}`)
    .join(' ')
  const slots = cardTimeSlots(content)
    .map((key) => TIME_SLOTS.find((slot) => slot.key === key)?.label ?? '')
    .join(' ')
  return `${content.title ?? ''} ${(content.categories ?? []).join(' ')} ${content.memo ?? ''} ${places} ${slots}`.toLowerCase()
}

/**
 * 로컬 매칭 — 검색어 토막이 동네 이름·카드 글에 몇 번 걸리는지로 점수를 낸다.
 * 추상적인 문장은 잘 못 알아듣지만(그건 AI 몫), 지역 이름·태그·가게 이름은 확실히 잡는다.
 */
function searchLocally(query, regions) {
  const tokens = tokenize(query)
  if (tokens.length === 0) return []

  const scored = []
  for (const region of regions) {
    const name = `${region.fullLabel} ${region.label}`.toLowerCase()
    // 이 동네에 있는 장소들의 주소를 한 덩어리로 — '충무로'처럼 동네 이름이 도로명에만
    // 남아 있는 경우를 잡는다. 이름만큼은 아니어도 꽤 강한 지명 신호다
    const addresses = region.places.map((p) => p.address ?? '').join(' ').toLowerCase()
    let score = 0
    let hitCards = 0
    for (const token of tokens) {
      // 동네 이름이 걸리면 가장 강한 신호다 ('성수' → 성수동)
      if (name.includes(token)) score += 60
      else if (addresses.includes(token)) score += 35
    }
    for (const content of region.contents) {
      const text = cardText(content)
      const hits = tokens.filter((token) => text.includes(token)).length
      if (hits > 0) {
        hitCards += 1
        score += hits * 12
      }
    }
    if (score === 0) continue
    scored.push({
      region,
      score: Math.min(100, score),
      reason: hitCards > 0 ? `검색어와 맞는 카드 ${hitCards}개` : '동네 이름이 검색어와 맞아요',
    })
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, MAX_LOCAL_RESULTS)
}

/**
 * 점수 순으로 세우되, 점수가 비슷하면 **1등 동네에서 가까운 곳**을 위로 올린다.
 * "강남 근처" 같은 검색에서 붙어 있는 동네끼리 모여 나오게 하려는 것이다.
 */
function sortByScoreThenDistance(rows) {
  const best = rows.reduce((top, row) => (!top || row.score > top.score ? row : top), null)
  return [...rows].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const da = regionDistanceKm(best?.region, a.region)
    const db = regionDistanceKm(best?.region, b.region)
    if (da != null && db != null && da !== db) return da - db
    return b.region.contents.length - a.region.contents.length
  })
}

/**
 * 같은 검색을 두 번 하면 호출하지 않도록 세션 동안만 결과를 들고 있는다.
 * (같은 말을 다시 눌러 보는 일이 잦은데 그때마다 토큰을 쓸 이유가 없다.)
 * 카드가 바뀌면 후보 동네도 달라지므로 서명에 동네·카드 수를 함께 넣는다.
 */
const cache = new Map()

function cacheKey(query, regions) {
  return `${query}\u0000${regions.map((r) => `${r.key}:${r.contents.length}`).join('|')}`
}

/**
 * 동네를 검색한다.
 * → { results: [{ region, score, reason }], mode: 'AI' | 'LOCAL', detail?: string }
 *   detail 은 AI를 못 쓴 이유다 — 화면에 그대로 보여준다 (실패를 조용히 삼키지 않는다).
 */
export async function searchRegions(query, regions) {
  const trimmed = query?.trim()
  if (!trimmed || regions.length === 0) return { results: [], mode: 'LOCAL' }

  const fallback = (detail) => ({ results: sortByScoreThenDistance(searchLocally(trimmed, regions)), mode: 'LOCAL', detail })

  if (!isSupabaseConfigured) {
    return fallback('공유 DB 모드에서만 AI 검색이 돼요 — 이름·태그로만 찾았어요')
  }

  // 카드가 많은 동네 순으로 이미 정렬돼 있다 — 너무 많으면 앞쪽만 보낸다
  const candidates = regions.slice(0, MAX_REGIONS)

  const key = cacheKey(trimmed, candidates)
  const cached = cache.get(key)
  if (cached) return cached

  try {
    const timeout = new Promise((resolve) =>
      setTimeout(() => resolve({ error: { message: '시간이 너무 오래 걸려요' } }), TIMEOUT_MS),
    )
    const { data, error } = await Promise.race([
      supabase.functions.invoke('region-search', {
        body: { query: trimmed, regions: candidates.map(toPayload) },
      }),
      timeout,
    ])
    if (error) return fallback(`AI 검색 실패: ${error.message ?? error} — 이름·태그로만 찾았어요`)
    if (!Array.isArray(data?.results)) {
      if (data?.failed && data?.detail) return fallback(`${data.detail} — 이름·태그로만 찾았어요`)
      return fallback('AI 응답 형식이 예상과 달라요 — 이름·태그로만 찾았어요')
    }
    if (data.failed && data.detail && data.results.length === 0) {
      return fallback(`${data.detail} — 이름·태그로만 찾았어요`)
    }

    // 서버는 uuid 대신 1부터 매긴 번호로 짝을 돌려준다
    const results = []
    for (const item of data.results) {
      const region = candidates[Number(item?.no) - 1]
      if (!region) continue
      const score = Number(item?.score)
      results.push({
        region,
        score: Number.isFinite(score) ? score : 0,
        reason: typeof item?.reason === 'string' ? item.reason.trim().slice(0, 40) : '',
      })
    }
    // AI가 하나도 못 고른 건 "맞는 동네가 없다"는 뜻이라 그대로 빈 결과를 보여준다
    const found = { results: sortByScoreThenDistance(results), mode: 'AI' }
    cache.set(key, found)
    return found
  } catch (err) {
    return fallback(`오류: ${err?.message ?? err} — 이름·태그로만 찾았어요`)
  }
}
