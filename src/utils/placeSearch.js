/**
 * 장소 검색 — Supabase Edge Function(place-search)에 위임한다.
 * 네이버 지역 검색 키는 서버에만 있으므로 브라우저에서 직접 부르지 않는다.
 */
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js'

/** 장소 검색 기능을 쓸 수 있는 환경인지 (키 없이 빌드하면 false) */
export const isPlaceSearchAvailable = isSupabaseConfigured

/**
 * 검색어로 장소 후보를 찾는다.
 * → { places: Place[], detail?: string }
 * 검색 자체가 실패하면 places는 빈 배열이고 detail에 원인이 담긴다
 * (설정이 덜 됐거나 네이버 응답이 이상한 경우 — 화면에 그대로 보여준다).
 */
export async function searchPlaces(query) {
  const trimmed = query?.trim()
  if (!trimmed) return { places: [] }
  if (!isSupabaseConfigured) return { places: [], detail: '공유 DB 모드에서만 검색할 수 있어요' }
  try {
    const timeout = new Promise((resolve) => setTimeout(() => resolve({ error: 'timeout' }), 15000))
    const { data, error } = await Promise.race([
      supabase.functions.invoke('place-search', { body: { query: trimmed } }),
      timeout,
    ])
    if (error) {
      return { places: [], detail: `함수 호출 실패: ${error.message ?? error}` }
    }
    if (!Array.isArray(data?.places)) {
      return { places: [], detail: '응답 형식이 예상과 달라요' }
    }
    return { places: data.places, detail: data.failed ? data.detail : undefined }
  } catch (err) {
    return { places: [], detail: `오류: ${err?.message ?? err}` }
  }
}

/**
 * 검색 결과 한 건을 카드에 저장할 형태로 정리한다.
 * time_slots 는 빈 채로 둔다 — 사람이 폼에서 고르거나 AI가 채우기 전까지는
 * 카드 기본 시간대를 따라간다 (src/utils/timeSlots.js resolveTimeSlots).
 */
export function toStoredPlace(place, source = 'MANUAL') {
  return {
    name: place.name,
    address: place.roadAddress || place.address || '',
    lat: typeof place.lat === 'number' ? place.lat : null,
    lng: typeof place.lng === 'number' ? place.lng : null,
    category: place.category ?? '',
    url: place.url ?? '',
    source,
    time_slots: [],
    time_reason: '',
  }
}
