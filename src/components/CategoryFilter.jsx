import { useMemo } from 'react'

/**
 * 태그(카테고리) 필터 칩 줄.
 * 지금 탭에 실제로 쓰이고 있는 카테고리만 개수와 함께 보여주고,
 * 하나를 고르면 그 태그가 붙은 카드만 남는다 (다시 누르면 해제).
 */
export default function CategoryFilter({ items, value, onChange }) {
  // 카드에 처음 등장한 순서를 유지하면서 태그별 개수를 센다
  const options = useMemo(() => {
    const counts = new Map()
    for (const item of items) {
      for (const name of item.categories ?? []) {
        counts.set(name, (counts.get(name) ?? 0) + 1)
      }
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count }))
  }, [items])

  if (options.length === 0) return null

  const chipClass = (isActive) =>
    `rounded-full px-3.5 py-1.5 text-xs font-medium ring-1 transition-colors ${
      isActive
        ? 'bg-rose-400 text-white ring-rose-400 hover:bg-rose-500'
        : 'bg-white text-neutral-600 ring-neutral-900/10 hover:bg-rose-50 hover:text-rose-500'
    }`

  return (
    <div className="mb-6 flex flex-wrap justify-center gap-2">
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-pressed={!value}
        className={chipClass(!value)}
      >
        전체
        <span className={`ml-1 ${!value ? 'text-rose-100' : 'text-neutral-400'}`}>{items.length}</span>
      </button>

      {options.map(({ name, count }) => {
        const isActive = value === name
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(isActive ? null : name)}
            aria-pressed={isActive}
            className={chipClass(isActive)}
          >
            {name}
            <span className={`ml-1 ${isActive ? 'text-rose-100' : 'text-neutral-400'}`}>{count}</span>
          </button>
        )
      })}
    </div>
  )
}
