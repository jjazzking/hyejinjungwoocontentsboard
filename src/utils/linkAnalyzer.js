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

export function detectPlatform(url) {
  if (/instagram\.com/i.test(url)) return 'INSTAGRAM'
  if (/youtube\.com|youtu\.be/i.test(url)) return 'YOUTUBE'
  if (/tiktok\.com/i.test(url)) return 'TIKTOK'
  return 'NONE'
}

/** 텍스트에서 지원 플랫폼의 첫 번째 URL을 찾아 반환한다 (없으면 null). */
export function extractSnsUrl(text) {
  if (typeof text !== 'string') return null
  const match = text.match(/https?:\/\/[^\s"'<>]+/i)
  if (!match) return null
  const url = match[0].replace(/[.,)\]]+$/, '')
  return detectPlatform(url) === 'NONE' ? null : url
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
  try {
    const res = await fetch(endpoint(url), { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = await res.json()
    return data?.title ? data : null
  } catch {
    return null
  }
}

/** Edge Function에 AI 분석을 요청한다. 실패하면 null (oEmbed 폴백). */
async function fetchAiDraft(body) {
  if (!isSupabaseConfigured) return null
  try {
    // Apify 수집 경로까지 가면 1분 이상 걸릴 수 있어 넉넉하게 잡는다
    const timeout = new Promise((resolve) => setTimeout(() => resolve({ error: 'timeout' }), 120000))
    const { data, error } = await Promise.race([
      supabase.functions.invoke('analyze-link', { body }),
      timeout,
    ])
    if (error || !data?.title) return null
    return data
  } catch {
    return null
  }
}

/**
 * 사용자가 직접 붙여넣은 캡션을 AI로 분석한다 (인스타 수집이 막혔을 때의 경로).
 * 성공 시 { title, categories, memo }, 실패 시 null.
 */
export async function analyzeCaption(caption, url, categoryOptions = []) {
  const ai = await fetchAiDraft({
    caption,
    url: url?.trim() || undefined,
    categories: categoryOptions,
  })
  if (!ai) return null
  return {
    title: ai.title,
    categories: ai.categories ?? [],
    memo: ai.memo ?? '',
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
  if (ai) {
    return {
      title: ai.title,
      status: 'PLANNING',
      date: new Date().toISOString().slice(0, 10),
      reference_url: url,
      reference_platform: platform,
      photo_urls: [],
      categories: ai.categories ?? [],
      places: ai.places ?? [],
      place_debug: ai.place_debug ?? '',
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
    places: [],
    memo: author ? `${author} 게시물 보고 저장했어요 ✨` : '',
  }
}
