import { useMemo, useState } from 'react'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

const pad = (n) => String(n).padStart(2, '0')
const toKey = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`

/** 'YYYY-MM-DD' → 연*12+월 인덱스 (달 이동/비교를 정수 하나로 다루기 위해) */
function monthIndexOf(dateStr) {
  const match = /^(\d{4})-(\d{2})-/.exec(dateStr ?? '')
  if (!match) return null
  return Number(match[1]) * 12 + (Number(match[2]) - 1)
}

/**
 * '한 것들' 탭의 달력.
 * - 뭔가 한 날은 진하게(로즈 배경 + 굵은 숫자) 표시하고, 여러 개면 점을 개수만큼 찍는다
 * - 날짜를 누르면 그날 카드만 보이고, 다시 누르면 해제된다
 * - 처음에는 가장 최근에 기록이 있는 달을 보여준다 (없으면 이번 달)
 */
export default function CompletedCalendar({ items, selectedDate, onSelect }) {
  // 사용자가 화살표로 직접 옮기기 전에는 null — 데이터가 늦게 로드돼도 최신 달을 따라간다
  const [cursor, setCursor] = useState(null)

  const countByDate = useMemo(() => {
    const counts = new Map()
    for (const item of items) {
      if (item.date) counts.set(item.date, (counts.get(item.date) ?? 0) + 1)
    }
    return counts
  }, [items])

  const latestIndex = useMemo(() => {
    let latest = null
    for (const item of items) {
      const index = monthIndexOf(item.date)
      if (index !== null && (latest === null || index > latest)) latest = index
    }
    return latest
  }, [items])

  const today = new Date()
  const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate())
  const todayIndex = today.getFullYear() * 12 + today.getMonth()

  const index = cursor ?? latestIndex ?? todayIndex
  const year = Math.floor(index / 12)
  const month = index % 12

  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const monthCount = items.filter((item) => monthIndexOf(item.date) === index).length

  const navClass =
    'rounded-full px-2.5 py-1 text-sm text-neutral-500 transition-colors hover:bg-rose-50 hover:text-rose-500'

  return (
    <section className="mx-auto mb-8 w-full max-w-md rounded-2xl bg-white p-4 shadow-sm ring-1 ring-neutral-900/5">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={() => setCursor(index - 1)} className={navClass} aria-label="이전 달">
          ‹
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-neutral-900">
            {year}년 {month + 1}월
          </p>
          <p className="text-xs text-neutral-400">
            {monthCount > 0 ? `이 달에 ${monthCount}개 했어요 ✨` : '이 달의 기록은 아직 없어요'}
          </p>
        </div>
        <button type="button" onClick={() => setCursor(index + 1)} className={navClass} aria-label="다음 달">
          ›
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] text-neutral-400">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <span key={`blank-${i}`} />

          const key = toKey(year, month, day)
          const count = countByDate.get(key) ?? 0
          const isSelected = selectedDate === key
          const isToday = key === todayKey

          return (
            <button
              key={key}
              type="button"
              disabled={count === 0}
              onClick={() => onSelect(isSelected ? null : key)}
              aria-pressed={isSelected}
              title={count > 0 ? `${month + 1}월 ${day}일 · ${count}개` : undefined}
              className={`flex h-10 flex-col items-center justify-center rounded-lg text-sm transition-colors ${
                isSelected
                  ? 'bg-rose-400 font-bold text-white shadow'
                  : count > 0
                    ? 'bg-rose-100 font-bold text-rose-600 hover:bg-rose-200'
                    : 'text-neutral-300'
              } ${isToday && !isSelected ? 'ring-1 ring-rose-300' : ''}`}
            >
              <span className="leading-none">{day}</span>
              {count > 0 && (
                <span className="mt-0.5 flex gap-0.5">
                  {Array.from({ length: Math.min(count, 3) }, (_, dot) => (
                    <span
                      key={dot}
                      className={`h-1 w-1 rounded-full ${isSelected ? 'bg-white' : 'bg-rose-400'}`}
                    />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {(cursor !== null || selectedDate) && (
        <div className="mt-3 flex justify-center gap-2">
          {cursor !== null && (
            <button
              type="button"
              onClick={() => setCursor(null)}
              className="rounded-full px-3 py-1 text-xs text-neutral-500 transition-colors hover:bg-neutral-100"
            >
              최근 달로
            </button>
          )}
          {selectedDate && (
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-100"
            >
              ✕ 날짜 선택 해제
            </button>
          )}
        </div>
      )}
    </section>
  )
}
