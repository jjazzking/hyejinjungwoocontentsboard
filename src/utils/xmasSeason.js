/**
 * 🎄 크리스마스 탭의 날짜 계산 · 종류 목록 (프론트 단일 출처).
 * 종류 키는 xmas-collect 함수의 KINDS 와 같아야 한다 — 둘을 함께 고칠 것.
 */

export const XMAS_KINDS = {
  MARKET: { label: '마켓', emoji: '🎪' },
  TREE: { label: '트리·점등', emoji: '🎄' },
  FACADE: { label: '백화점 외관', emoji: '🏬' },
  LIGHTS: { label: '빛축제', emoji: '✨' },
  CAFE: { label: '카페·식당', emoji: '☕' },
  HOTEL: { label: '호텔', emoji: '🏨' },
  POPUP: { label: '팝업', emoji: '🛍️' },
  ETC: { label: '기타', emoji: '🎁' },
}

export const kindOf = (kind) => XMAS_KINDS[kind] ?? XMAS_KINDS.ETC

/** 탭을 보여 줄 기간: 11월 1일 ~ 1월 6일 (그 밖에는 탭이 숨는다 — 데이터는 남아 있다) */
export function isXmasSeason(now = new Date()) {
  const month = now.getMonth() + 1
  return month === 11 || month === 12 || (month === 1 && now.getDate() <= 6)
}

/** 로컬 날짜 → 'YYYY-MM-DD' (toISOString은 UTC라 한국 새벽에 하루가 밀린다) */
export function toDay(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(date, n) {
  const next = new Date(date)
  next.setDate(next.getDate() + n)
  return next
}

const short = (date) => `${date.getMonth() + 1}/${date.getDate()}`

/**
 * 오늘부터 크리스마스까지 고를 수 있는 주말 목록.
 * 이미 시작한 주말(토·일)도 '이번 주말'로 남기고, 마지막에 이브·당일을 붙인다.
 * → [{ key, label, from, to }]
 */
export function upcomingWeekends(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const christmas = new Date(today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear(), 11, 25)
  // 일요일이면 어제(토)부터가 이번 주말
  const offset = today.getDay() === 0 ? -1 : (6 - today.getDay())
  let saturday = addDays(today, offset)
  const list = []
  while (saturday < addDays(christmas, -1)) {
    const sunday = addDays(saturday, 1)
    list.push({
      key: toDay(saturday),
      label: list.length === 0 ? `이번 주말 ${short(saturday)}–${short(sunday)}` : `${short(saturday)}–${short(sunday)}`,
      from: toDay(saturday),
      to: toDay(sunday),
    })
    saturday = addDays(saturday, 7)
  }
  if (today <= christmas) {
    list.push({
      key: 'christmas',
      label: `🎅 이브·당일 ${short(addDays(christmas, -1))}–${short(christmas)}`,
      from: toDay(addDays(christmas, -1)),
      to: toDay(christmas),
    })
  }
  return list
}

/**
 * 고른 기간에 열려 있는지.
 * 'open' 기간이 겹침 · 'closed' 확실히 안 겹침 · 'unknown' 날짜 정보가 없음
 */
export function openState(spot, range) {
  if (!spot.start_date && !spot.end_date) return 'unknown'
  if (spot.start_date && spot.start_date > range.to) return 'closed'
  if (spot.end_date && spot.end_date < range.from) return 'closed'
  return 'open'
}

/** 오늘 기준 상태 배지 */
export function todayBadge(spot, now = new Date()) {
  const today = toDay(now)
  if (spot.end_date && spot.end_date < today) return { text: '종료', className: 'bg-neutral-100 text-neutral-400' }
  if (spot.start_date && spot.start_date > today) {
    const [, m, d] = spot.start_date.split('-').map(Number)
    return { text: `${m}/${d} 오픈`, className: 'bg-sky-50 text-sky-600' }
  }
  if (spot.start_date || spot.end_date) return { text: '진행 중', className: 'bg-emerald-50 text-emerald-600' }
  return { text: '기간 미확인', className: 'bg-amber-50 text-amber-600' }
}

/** 'YYYY-MM-DD' ~ 'YYYY-MM-DD' → '11/14 ~ 12/31' */
export function formatPeriod(spot) {
  const fmt = (day) => {
    if (!day) return ''
    const [, m, d] = day.split('-').map(Number)
    return `${m}/${d}`
  }
  if (!spot.start_date && !spot.end_date) return ''
  return `${fmt(spot.start_date) || '?'} ~ ${fmt(spot.end_date) || '?'}`
}

/** 수도권(서울·경기·인천) 주소인지 — 장소를 못 찾은 후보는 걸러내지 않는다 */
export function isCapitalArea(spot) {
  const address = spot.place?.address ?? ''
  if (!address) return true
  return /^(서울|경기|인천)/.test(address)
}
