/** 'YYYY-MM-DD'를 한국어로 포맷한다. 파싱할 수 없으면 원본 문자열을 그대로 돌려준다. */
function format(dateStr, options) {
  const date = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(date.getTime())) return dateStr
  return new Intl.DateTimeFormat('ko-KR', options).format(date)
}

/** '2026년 7월 12일' */
export const formatDate = (dateStr) => format(dateStr, { dateStyle: 'long' })

/** '7월 12일' */
export const formatDay = (dateStr) => format(dateStr, { month: 'long', day: 'numeric' })
