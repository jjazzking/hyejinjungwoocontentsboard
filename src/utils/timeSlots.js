/**
 * '가기 좋은 시간대' 공용 상수.
 *
 * AI(analyze-link / analyze-time)가 채우고 사람이 폼에서 고칠 수 있는 값이다.
 * 카테고리와 달리 사용자가 늘릴 수 없는 고정 목록이라 저장·표시 양쪽에서
 * 여기 있는 키만 통과시킨다. 데이트 코스를 짤 때 슬롯으로 쓰기 위한 값이라
 * 자유 문장이 아니라 고정 enum이어야 한다.
 *
 * ★ 시간대는 **장소마다** 다르다 (점심 국밥집과 야장이 한 카드에 같이 있을 수 있다).
 *   그래서 값이 두 군데에 붙는다.
 *     - places[].time_slots — 그 장소 하나의 시간대. 코스를 짤 때 쓰는 진짜 값
 *     - contents.time_slots — 카드 기본값. 장소가 없는 카드(홈데이트·온라인)와,
 *                             아직 장소별로 못 채운 곳의 폴백
 *   읽는 쪽은 직접 고르지 말고 아래 resolveTimeSlots / cardTimeSlots 를 쓸 것.
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

/**
 * 장소 한 곳에 적용되는 시간대.
 * 장소가 직접 갖고 있으면 그 값, 아직 없으면 카드 기본값으로 떨어진다.
 */
export function resolveTimeSlots(place, content) {
  const own = sanitizeTimeSlots(place?.time_slots)
  return own.length > 0 ? own : sanitizeTimeSlots(content?.time_slots)
}

/**
 * 카드 한 장을 대표하는 시간대 (칩 표시용).
 * 장소가 있으면 장소별 시간대를 전부 합치고, 없으면 카드 기본값을 쓴다.
 */
export function cardTimeSlots(content) {
  const places = content?.places ?? []
  if (places.length === 0) return sanitizeTimeSlots(content?.time_slots)
  return sanitizeTimeSlots(places.flatMap((place) => resolveTimeSlots(place, content)))
}

/**
 * 시간대 툴팁 문구. 장소가 있으면 곳마다 한 줄씩 풀어서 보여준다 —
 * 합쳐 놓은 칩만 봐서는 어느 곳이 야간인지 알 수 없기 때문이다.
 */
export function timeSlotHint(content) {
  const lines = (content?.places ?? [])
    .map((place) => {
      const chips = toTimeSlotChips(resolveTimeSlots(place, content))
      if (chips.length === 0) return ''
      const own = sanitizeTimeSlots(place?.time_slots).length > 0
      const reason = (own ? place?.time_reason : content?.time_reason) ?? ''
      return `${place.name}: ${chips.map((c) => c.label).join('·')}${reason ? ` (${reason})` : ''}`
    })
    .filter(Boolean)
  return lines.length > 0 ? lines.join('\n') : (content?.time_reason ?? '')
}

/**
 * 아직 시간대를 못 채운 곳이 남은 카드인지 (일괄 분석 대상).
 * 카드 기본값이 비었거나, 장소 중 하나라도 제 시간대가 없으면 대상이다 —
 * 카드 단위로만 채워 둔 옛 카드를 장소 단위로 옮기는 것도 이 경로를 탄다.
 */
export function needsTimeAnalysis(content) {
  if (sanitizeTimeSlots(content?.time_slots).length === 0) return true
  return (content?.places ?? []).some((place) => sanitizeTimeSlots(place?.time_slots).length === 0)
}
