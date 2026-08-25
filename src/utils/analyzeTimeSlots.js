/**
 * 이미 만들어 둔 카드들의 '가기 좋은 시간대'를 AI로 일괄 채우는 유틸.
 * Supabase Edge Function(analyze-time)에 위임한다 — Anthropic 키는 서버에만 있다.
 *
 * 카드를 한 장씩 부르면 호출 수가 카드 수만큼 늘어나므로 묶어서 보내고,
 * 한 번에 다 보내면 응답이 잘리므로 CHUNK_SIZE 장씩 끊어 보낸다.
 */
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js'
import { sanitizeTimeSlots } from './timeSlots.js'

/** 일괄 분석을 쓸 수 있는 환경인지 (키 없이 빌드하면 false) */
export const isTimeAnalysisAvailable = isSupabaseConfigured

const CHUNK_SIZE = 20
// Haiku가 20장을 한 번에 판단하는 데 걸리는 시간 + 여유
const CHUNK_TIMEOUT_MS = 60000

/**
 * 카드에서 AI 판단에 필요한 것만 추린다 (사진 URL 등은 보내지 않는다).
 * 장소는 순서를 그대로 유지한다 — 서버가 1부터의 번호로 짝을 맞춰
 * 장소별 시간대를 돌려주기 때문에 배열 인덱스가 곧 그 번호다.
 */
function toPayload(content) {
  return {
    title: content.title ?? '',
    memo: content.memo ?? '',
    categories: content.categories ?? [],
    places: (content.places ?? []).map((p) => ({ name: p.name ?? '', category: p.category ?? '' })),
  }
}

/** AI가 준 근거 문구를 저장할 길이로 다듬는다 */
function reasonOf(value) {
  return typeof value === 'string' ? value.trim().slice(0, 40) : ''
}

/**
 * 서버가 돌려준 장소별 시간대를 원본 장소 배열에 얹는다.
 * 서버에는 이름·분류만 보냈으므로 좌표·주소 같은 나머지 필드는 그대로 두고
 * 시간대만 갈아끼운다 (통째로 덮어쓰면 좌표를 잃는다).
 * 바뀐 게 하나도 없으면 null — patches에서 places를 아예 빼기 위해서다.
 */
function applyPlaceSlots(places, rows) {
  if (!Array.isArray(places) || places.length === 0) return null
  if (!Array.isArray(rows) || rows.length === 0) return null
  let changed = false
  const next = places.map((place, index) => {
    const row = rows.find((r) => Number(r?.i) === index + 1)
    const time_slots = sanitizeTimeSlots(row?.time_slots)
    if (time_slots.length === 0) return place
    changed = true
    return { ...place, time_slots, time_reason: reasonOf(row.time_reason) }
  })
  return changed ? next : null
}

/**
 * 카드 목록의 시간대를 분석한다.
 * onProgress(done, total)로 진행 상황을 알려준다 (버튼에 12/47 형태로 표시).
 * → { patches: [{ id, time_slots?, time_reason?, places? }], failed: number, detail?: string }
 *   patches는 저장에 바로 쓸 수 있는 형태이고, 판단하지 못한 카드는 빠진다.
 *   카드 기본 시간대와 장소별 시간대는 따로 오므로 건진 쪽만 patch에 담는다.
 */
export async function analyzeTimeSlots(contents, onProgress) {
  if (!isSupabaseConfigured) {
    return { patches: [], failed: contents.length, detail: '공유 DB 모드에서만 분석할 수 있어요' }
  }

  const patches = []
  let failed = 0
  let detail
  let done = 0

  for (let i = 0; i < contents.length; i += CHUNK_SIZE) {
    const chunk = contents.slice(i, i + CHUNK_SIZE)
    const before = patches.length
    try {
      const timeout = new Promise((resolve) =>
        setTimeout(() => resolve({ error: { message: '시간이 너무 오래 걸려요' } }), CHUNK_TIMEOUT_MS),
      )
      const { data, error } = await Promise.race([
        supabase.functions.invoke('analyze-time', { body: { cards: chunk.map(toPayload) } }),
        timeout,
      ])
      if (error || !Array.isArray(data?.results)) {
        detail ??= error?.message ? `함수 호출 실패: ${error.message}` : '응답 형식이 예상과 달라요'
      } else {
        // 서버는 uuid 대신 1부터 매긴 번호로 짝을 돌려준다
        for (const item of data.results) {
          const card = chunk[Number(item?.no) - 1]
          if (!card) continue
          const time_slots = sanitizeTimeSlots(item?.time_slots)
          // 코스를 짤 때 쓰는 진짜 값은 장소별 시간대다 (카드 값은 장소 없는 카드의 기본값)
          const places = applyPlaceSlots(card.places, item?.places)
          if (time_slots.length === 0 && !places) continue
          patches.push({
            id: card.id,
            ...(time_slots.length > 0
              ? { time_slots, time_reason: reasonOf(item.time_reason) }
              : {}),
            ...(places ? { places } : {}),
          })
        }
        if (data.failed && data.detail) detail ??= data.detail
      }
    } catch (err) {
      detail ??= `오류: ${err?.message ?? err}`
    }
    failed += chunk.length - (patches.length - before)
    done += chunk.length
    onProgress?.(done, contents.length)
  }

  return { patches, failed, detail }
}
