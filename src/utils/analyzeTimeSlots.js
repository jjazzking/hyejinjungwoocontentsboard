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

/** 카드에서 AI 판단에 필요한 것만 추린다 (사진 URL 등은 보내지 않는다). */
function toPayload(content) {
  return {
    title: content.title ?? '',
    memo: content.memo ?? '',
    categories: content.categories ?? [],
    places: (content.places ?? []).map((p) => ({ name: p.name ?? '', category: p.category ?? '' })),
  }
}

/**
 * 카드 목록의 시간대를 분석한다.
 * onProgress(done, total)로 진행 상황을 알려준다 (버튼에 12/47 형태로 표시).
 * → { patches: [{ id, time_slots, time_reason }], failed: number, detail?: string }
 *   patches는 저장에 바로 쓸 수 있는 형태이고, 판단하지 못한 카드는 빠진다.
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
          const time_slots = sanitizeTimeSlots(item?.time_slots)
          if (!card || time_slots.length === 0) continue
          patches.push({
            id: card.id,
            time_slots,
            time_reason: typeof item.time_reason === 'string' ? item.time_reason.trim().slice(0, 40) : '',
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
