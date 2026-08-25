/**
 * 클립보드/입력에서 발견한 SNS 링크를 분석해 카드 초안을 만드는 유틸.
 *
 * 1순위 — Supabase Edge Function(analyze-link): 서버가 게시물의 캡션·썸네일을
 *   읽고 Claude가 제목·카테고리·메모를 만들어준다 (SUPABASE_SETUP.md 6번).
 * 2순위 — 브라우저에서 로그인 없이 접근 가능한 공개 oEmbed:
 *   - YouTube / TikTok : oEmbed로 제목·작성자를 가져올 수 있음
 *   - Instagram        : oEmbed가 액세스 토큰을 요구해서 메타데이터를 읽을 수 없음
 *                        → 링크·플랫폼만 채운 초안으로 대체
 */
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js'
import { sanitizeTimeSlots } from './timeSlots.js'

export function detectPlatform(url) {
  if (/instagram\.com/i.test(url)) return 'INSTAGRAM'
  if (/youtube\.com|youtu\.be/i.test(url)) return 'YOUTUBE'
  if (/tiktok\.com/i.test(url)) return 'TIKTOK'
  return 'NONE'
}

/**
 * 같은 게시물인데 주소가 달라 보이는 경우를 없앤다.
 *
 * 공유·복사로 들어오는 링크에는 `?igsh=…`, `?utm_source=…` 같은 추적 값이 붙어 온다.
 * 그대로 두면 같은 릴스를 두 번 공유했을 때 카드가 두 개 생긴다.
 * 유튜브의 `v`처럼 **없으면 어떤 영상인지 알 수 없는 값만** 남기고 전부 버린다.
 */
export function normalizeSnsUrl(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return url
  }
  parsed.hash = ''
  // instagram.com / www.instagram.com / m.instagram.com 이 다 같은 곳으로 모이게 한다
  const bare = parsed.hostname.toLowerCase().replace(/^(www|m)\./, '')
  parsed.hostname = /^(instagram|youtube|tiktok)\.com$/.test(bare) ? `www.${bare}` : bare

  const keep = new URLSearchParams()
  if (/youtube\.com$/i.test(parsed.hostname.replace(/^www\./i, '')) && parsed.searchParams.has('v')) {
    keep.set('v', parsed.searchParams.get('v'))
  }
  parsed.search = keep.toString()

  // 끝의 슬래시 유무만 다른 주소도 같은 것으로 본다 (경로가 비어 있을 때는 남긴다)
  if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, '')
  return parsed.toString()
}

/** 텍스트에서 지원 플랫폼의 첫 번째 URL을 찾아 반환한다 (없으면 null). */
export function extractSnsUrl(text) {
  if (typeof text !== 'string') return null
  const match = text.match(/https?:\/\/[^\s"'<>]+/i)
  if (!match) return null
  const url = match[0].replace(/[.,)\]]+$/, '')
  return detectPlatform(url) === 'NONE' ? null : normalizeSnsUrl(url)
}

// 제목/작성자 텍스트에서 카테고리를 추측하는 키워드 규칙 (복수 매칭 허용)
const CATEGORY_RULES = [
  ['맛집', /맛집|먹방|카페|디저트|빵집|브런치|레스토랑|food|cafe|restaurant|dessert/i],
  ['홈데이트', /레시피|요리|베이킹|홈카페|만들기|recipe|baking|cooking|diy/i],
  ['여행', /여행|드라이브|바다|캠핑|호텔|숙소|풍경|travel|trip|beach/i],
  ['액티비티', /운동|클라이밍|등산|자전거|피크닉|원데이|클래스|서핑|workout|hiking/i],
]

function guessCategories(text) {
  return CATEGORY_RULES.filter(([, regex]) => regex.test(text)).map(([name]) => name)
}

const OEMBED_ENDPOINT = {
  YOUTUBE: (url) => `https://noembed.com/embed?url=${encodeURIComponent(url)}`,
  TIKTOK: (url) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
}

const FALLBACK_TITLE = {
  INSTAGRAM: '인스타그램에서 본 아이디어',
  YOUTUBE: '유튜브에서 본 아이디어',
  TIKTOK: '틱톡에서 본 아이디어',
}

async function fetchOEmbed(platform, url) {
  const endpoint = OEMBED_ENDPOINT[platform]
  if (!endpoint) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(endpoint(url), { signal: controller.signal })
    if (!res.ok) return null
    const data = await res.json()
    return data?.title ? data : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Edge Function이 비정상 응답(4xx/5xx)을 줬을 때 본문에 담긴 사유를 꺼낸다.
 * supabase-js는 이때 error.context에 원본 Response를 넣어 준다.
 */
async function readFunctionError(error) {
  try {
    const body = await error?.context?.json?.()
    return body?.failed || body?.error || ''
  } catch {
    return ''
  }
}

/**
 * Edge Function에 AI 분석을 요청한다.
 * 성공하면 초안 객체, 실패하면 `{ failed, detail }`(사유), 설정이 없으면 null.
 * 실패 사유는 그대로 폼까지 올려 보내서 사용자가 로그를 열지 않고도 원인을 알게 한다.
 */
async function fetchAiDraft(body) {
  if (!isSupabaseConfigured) return null
  try {
    // Apify 수집 경로까지 가면 1분 이상 걸릴 수 있어 넉넉하게 잡는다
    const timeout = new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), 120000))
    const { data, error, timedOut } = await Promise.race([
      supabase.functions.invoke('analyze-link', { body }),
      timeout,
    ])
    if (timedOut) return { failed: '분석이 2분을 넘겨서 중단했어요. 잠시 후 다시 시도해 주세요.' }
    if (error) {
      const reason = await readFunctionError(error)
      return { failed: reason || 'AI 분석 서버를 부르지 못했어요', detail: error.message ?? '' }
    }
    if (!data) return { failed: 'AI 분석 서버가 빈 응답을 보냈어요' }
    if (data.failed) return data
    if (!data.title) return { failed: 'AI가 제목을 만들지 못했어요', detail: data.detail ?? '' }
    return data
  } catch (err) {
    return { failed: 'AI 분석 요청 중 오류가 났어요', detail: err?.message ?? '' }
  }
}

/**
 * 사용자가 직접 붙여넣은 캡션을 AI로 분석한다 (인스타 수집이 막혔을 때의 경로).
 * 성공 시 { title, categories, memo }, 실패 시 `{ failed, detail }`.
 */
export async function analyzeCaption(caption, url, categoryOptions = []) {
  const ai = await fetchAiDraft({
    caption,
    url: url?.trim() || undefined,
    categories: categoryOptions,
  })
  if (!ai) return { failed: 'AI 분석이 설정되어 있지 않아요' }
  if (ai.failed) return ai
  return {
    title: ai.title,
    categories: ai.categories ?? [],
    memo: ai.memo ?? '',
    time_slots: ai.time_slots ?? [],
    time_reason: ai.time_reason ?? '',
    places: ai.places ?? [],
    place_debug: ai.place_debug ?? '',
  }
}

/**
 * 링크를 분석해 추가 폼에 미리 채울 초안을 만든다.
 * AI 분석이 실패해도(미배포·타임아웃 등) 링크·플랫폼이 채워진 초안은 항상 반환한다.
 */
export async function analyzeLink(url, categoryOptions = []) {
  const platform = detectPlatform(url)

  const ai = await fetchAiDraft({ url, categories: categoryOptions })
  if (ai && !ai.failed) {
    return {
      title: ai.title,
      status: 'PLANNING',
      date: new Date().toISOString().slice(0, 10),
      reference_url: url,
      reference_platform: platform,
      photo_urls: [],
      categories: ai.categories ?? [],
      time_slots: ai.time_slots ?? [],
      time_reason: ai.time_reason ?? '',
      places: ai.places ?? [],
      place_debug: ai.place_debug ?? '',
      analyzed: true,
      // 캡션을 못 읽고 썸네일만 보고 만든 초안이면 서버가 그 사실을 알려준다
      analysis_note: ai.detail ?? '',
      memo: ai.memo ?? '',
    }
  }

  const meta = await fetchOEmbed(platform, url)

  const title = meta?.title?.trim() || FALLBACK_TITLE[platform] || ''
  const author = meta?.author_name?.trim()

  return {
    title,
    status: 'PLANNING',
    date: new Date().toISOString().slice(0, 10),
    reference_url: url,
    reference_platform: platform,
    photo_urls: [],
    categories: guessCategories(`${title} ${author ?? ''}`),
    time_slots: [],
    time_reason: '',
    places: [],
    analyzed: false,
    // AI가 실패한 이유를 폼까지 들고 가서 그대로 보여준다 (빈 초안만 열리면 원인을 알 수 없다)
    analysis_note: [ai?.failed, ai?.detail].filter(Boolean).join(' — '),
    memo: author ? `${author} 게시물 보고 저장했어요 ✨` : '',
  }
}

/** analyzeLink가 실패했을 때 붙는 대체 제목들 — '아직 분석 안 됨' 판정에 쓴다 */
const FALLBACK_TITLES = new Set(Object.values(FALLBACK_TITLE))

/**
 * 링크는 붙어 있는데 AI가 내용을 못 채운 카드인지 판단한다.
 * 사용자가 직접 써 넣은 카드를 다시 건드리지 않도록 보수적으로 본다 —
 * 제목이 대체 제목 그대로거나, 장소·메모가 둘 다 비어 있을 때만 대상으로 삼는다.
 */
export function needsReanalysis(content) {
  const url = content?.reference_url?.trim()
  if (!url || detectPlatform(url) === 'NONE') return false
  if (FALLBACK_TITLES.has(content.title?.trim())) return true
  const hasPlace = (content.places ?? []).length > 0
  const hasMemo = Boolean(content.memo?.trim())
  return !hasPlace && !hasMemo
}

/**
 * 재분석 결과를 기존 카드에 얹을 패치를 만든다.
 * **사용자가 손댄 값은 절대 덮어쓰지 않는다** — 제목은 대체 제목일 때만 바꾸고,
 * 메모는 비어 있을 때만 채우며, 태그·장소는 기존 것에 더하기만 한다.
 * 이미 있는 장소는 시간대가 비어 있을 때만 채운다 (좌표·주소는 사용자가 확정해 둔
 * 값일 수 있어 건드리지 않는다). 바뀔 게 없으면 빈 객체를 돌려준다.
 */
export function mergeReanalysis(content, draft) {
  const patch = {}
  if (draft.title && FALLBACK_TITLES.has(content.title?.trim()) && draft.title !== content.title) {
    patch.title = draft.title
  }
  if (draft.memo && !content.memo?.trim()) patch.memo = draft.memo

  const before = content.categories ?? []
  const categories = [...new Set([...before, ...(draft.categories ?? [])])]
  if (categories.length !== before.length) patch.categories = categories

  // 이미 있는 장소는 그대로 두되, 시간대만 아직 비어 있으면 재분석 결과로 채운다
  const drafted = new Map((draft.places ?? []).filter((p) => p?.name).map((p) => [p.name, p]))
  let placesChanged = false
  const merged = (content.places ?? []).map((place) => {
    if (sanitizeTimeSlots(place.time_slots).length > 0) return place
    const found = drafted.get(place.name)
    const slots = sanitizeTimeSlots(found?.time_slots)
    if (slots.length === 0) return place
    placesChanged = true
    return { ...place, time_slots: slots, time_reason: found.time_reason ?? '' }
  })

  const known = new Set((content.places ?? []).map((p) => p.name))
  const added = (draft.places ?? []).filter((p) => p?.name && !known.has(p.name))
  if (added.length > 0 || placesChanged) patch.places = [...merged, ...added]

  // 시간대는 아직 비어 있을 때만 채운다 — 사람이 골라둔 값은 재분석으로 덮지 않는다
  const slots = sanitizeTimeSlots(draft.time_slots)
  if (slots.length > 0 && sanitizeTimeSlots(content.time_slots).length === 0) {
    patch.time_slots = slots
    patch.time_reason = draft.time_reason ?? ''
  }

  return patch
}
