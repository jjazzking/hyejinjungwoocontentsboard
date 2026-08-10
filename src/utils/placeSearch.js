/**
 * 장소 검색 — Supabase Edge Function(place-search)에 위임한다.
 * 네이버 지역 검색 키는 서버에만 있으므로 브라우저에서 직접 부르지 않는다.
 */
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js'

/** 장소 검색 기능을 쓸 수 있는 환경인지 (키 없이 빌드하면 false) */
export const isPlaceSearchAvailable = isSupabaseConfigured

/**
 * 검색어로 장소 후보를 찾는다.
 * 성공하면 Place 배열, 실패하면 null (호출한 쪽에서 안내 문구 표시).
 */
export async function searchPlaces(query) {
  const trimmed = query?.trim()
  if (!trimmed || !isSupabaseConfigured) return null
  try {
    const timeout = new Promise((resolve) => setTimeout(() => resolve({ error: 'timeout' }), 15000))
    const { data, error } = await Promise.race([
      supabase.functions.invoke('place-search', { body: { query: trimmed } }),
      timeout,
    ])
    if (error || !Array.isArray(data?.places)) return null
    return data.places
  } catch {
    return null
  }
}

/** 검색 결과 한 건을 카드에 저장할 형태로 정리한다. */
export function toStoredPlace(place, source = 'MANUAL') {
  return {
    name: place.name,
    address: place.roadAddress || place.address || '',
    lat: typeof place.lat === 'number' ? place.lat : null,
    lng: typeof place.lng === 'number' ? place.lng : null,
    category: place.category ?? '',
    url: place.url ?? '',
    source,
  }
}
