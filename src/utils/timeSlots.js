/**
 * 카드의 '가기 좋은 시간대' 공용 상수.
 *
 * AI(analyze-link / analyze-time)가 채우고 사람이 폼에서 고칠 수 있는 값이다.
 * 카테고리와 달리 사용자가 늘릴 수 없는 고정 목록이라 저장·표시 양쪽에서
 * 여기 있는 키만 통과시킨다. 나중에 데이트 코스를 짤 때 슬롯으로 쓰기 위한 값이라
 * 자유 문장이 아니라 고정 enum이어야 한다.
 *
 * ⚠️ 목록을 바꾸면 두 Edge Function(analyze-link / analyze-time)의
 *    TIME_SLOT_KEYS 와 프롬프트도 같이 고쳐야 한다.
 */
export const TIME_SLOTS = [
  { key: 'MORNING', label: '아침', emoji: '🌅', hint: '~11시' },
  { key: 'LUNCH', label: '점심', emoji: '🍚', hint: '11~15시' },
  { key: 'AFTERNOON', label: '오후', emoji: '☕', hint: '15~18시' },
  { key: 'EVENING', label: '저녁', emoji: '🌆', hint: '18~21시' },
  { key: 'NIGHT', label: '야간', emoji: '🌙', hint: '21시~' },
]

const BY_KEY = new Map(TIME_SLOTS.map((slot) => [slot.key, slot]))

/** 모르는 값·중복을 걸러내고 항상 시간 순서로 정렬한다. */
export function sanitizeTimeSlots(value) {
  if (!Array.isArray(value)) return []
  const picked = new Set(value.filter((v) => BY_KEY.has(v)))
  return TIME_SLOTS.filter((slot) => picked.has(slot.key)).map((slot) => slot.key)
}

/** ['NIGHT','LUNCH'] → [{ key, label, emoji, hint }, …] (표시용, 시간 순) */
export function toTimeSlotChips(value) {
  return sanitizeTimeSlots(value).map((key) => BY_KEY.get(key))
}

/** 아직 시간대가 분석되지 않은 카드인지 */
export function needsTimeAnalysis(content) {
  return sanitizeTimeSlots(content?.time_slots).length === 0
}
