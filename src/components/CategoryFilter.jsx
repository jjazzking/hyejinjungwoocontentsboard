import { useMemo } from 'react'

/**
 * 태그(카테고리) 줄 — 지금 탭의 카드를 태그로 거른다.
 *
 * 예전엔 **카드에 이미 붙어 있는 태그만** 보여줬는데, 그러면 새 태그를 만들 방법이
 * 카드 폼 안밖에 없었다. 이제 보드의 태그를 전부 보여주고, 카드가 없는 태그는
 * 흐리게 둔다 — 태그를 먼저 만들고 거기에 카드를 채워 넣을 수 있게.
 *
 * 태그 만들기·색 고르기·지우기는 '🏷️ 태그 관리' 탭으로 옮겼다.
 * 이 줄은 거르는 일만 한다 (칩 사이에 입력칸이 끼어 있으면 줄이 계속 흔들렸다).
 *
 * - items      : 지금 탭의 카드들 (개수 세는 용도)
 * - categories : 보드 전체 태그 목록 (useCategories)
 * - colorMap   : { 태그 → 색 } Map — 고른 색을 칩에도 보여줘서 지도 핀과 이어 보이게
 *
 * '이 태그로 카드 추가'는 여기 두지 않는다 — 카드 그리드 맨 앞의 ＋ 타일과
 * (카드가 없을 때는) 빈 화면 버튼이 이미 그 자리를 맡고 있어서 겹친다.
 */
export default function CategoryFilter({ items, categories = [], colorMap, value, onChange }) {
  // 태그별 개수 — 목록에 없는 태그는 0으로 (방금 만든 태그가 여기 해당한다)
  const counts = useMemo(() => {
    const map = new Map()
    for (const item of items) {
      for (const category of item.categories ?? []) {
        map.set(category, (map.get(category) ?? 0) + 1)
      }
    }
    return map
  }, [items])

  const chipClass = (isActive, isEmpty) =>
    `flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium ring-1 transition-colors ${
      isActive
        ? 'text-white'
        : isEmpty
          ? 'bg-white/60 text-neutral-400 ring-neutral-900/5 hover:bg-rose-50 hover:text-rose-400'
          : 'bg-white text-neutral-600 ring-neutral-900/10 hover:bg-rose-50 hover:text-rose-500'
    }`

  return (
    <div className="mb-6 flex flex-wrap justify-center gap-2">
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-pressed={!value}
        className={`rounded-full px-3.5 py-1.5 text-xs font-medium ring-1 transition-colors ${
          !value
            ? 'bg-rose-400 text-white ring-rose-400 hover:bg-rose-500'
            : 'bg-white text-neutral-600 ring-neutral-900/10 hover:bg-rose-50 hover:text-rose-500'
        }`}
      >
        전체
        <span className={`ml-1 ${!value ? 'text-rose-100' : 'text-neutral-400'}`}>
          {items.length}
        </span>
      </button>

      {categories.map((category) => {
        const count = counts.get(category) ?? 0
        const isActive = value === category
        const color = colorMap?.get(category)
        return (
          <button
            key={category}
            type="button"
            onClick={() => onChange(isActive ? null : category)}
            aria-pressed={isActive}
            className={chipClass(isActive, count === 0)}
            // 고른 태그는 그 태그 색으로 채운다 — 지도 핀 색과 같은 색이다
            style={isActive && color ? { backgroundColor: color, boxShadow: `0 0 0 1px ${color}` } : undefined}
          >
            {!isActive && color && (
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: color, opacity: count === 0 ? 0.4 : 1 }}
              />
            )}
            {category}
            <span className={isActive ? 'text-white/70' : 'text-neutral-400'}>{count}</span>
          </button>
        )
      })}
    </div>
  )
}
