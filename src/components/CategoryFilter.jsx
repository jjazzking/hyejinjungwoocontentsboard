import { useMemo, useState } from 'react'

/**
 * 태그(카테고리) 줄 — 필터 + 태그 만들기.
 *
 * 예전엔 **카드에 이미 붙어 있는 태그만** 보여줬는데, 그러면 새 태그를 만들 방법이
 * 카드 폼 안밖에 없었다. 이제 보드의 태그를 전부 보여주고, 카드가 없는 태그는
 * 흐리게 둔다 — 태그를 먼저 만들고 거기에 카드를 채워 넣을 수 있게.
 *
 * - items      : 지금 탭의 카드들 (개수 세는 용도)
 * - categories : 보드 전체 태그 목록 (useCategories)
 * - onAddCategory(name) → 만들어진 이름 (중복이면 기존 이름)
 *
 * '이 태그로 카드 추가'는 여기 두지 않는다 — 카드 그리드 맨 앞의 ＋ 타일과
 * (카드가 없을 때는) 빈 화면 버튼이 이미 그 자리를 맡고 있어서 겹친다.
 */
export default function CategoryFilter({ items, categories = [], value, onChange, onAddCategory }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

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

  const submit = (event) => {
    event.preventDefault()
    const added = onAddCategory?.(name)
    if (!added) return
    setName('')
    setAdding(false)
    // 만들자마자 그 태그만 보게 해서 "이제 여기에 카드를 넣으세요"로 자연스럽게 이어지도록
    onChange(added)
  }

  const chipClass = (isActive, isEmpty) =>
    `rounded-full px-3.5 py-1.5 text-xs font-medium ring-1 transition-colors ${
      isActive
        ? 'bg-rose-400 text-white ring-rose-400 hover:bg-rose-500'
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
        className={chipClass(!value, false)}
      >
        전체
        <span className={`ml-1 ${!value ? 'text-rose-100' : 'text-neutral-400'}`}>
          {items.length}
        </span>
      </button>

      {categories.map((category) => {
        const count = counts.get(category) ?? 0
        const isActive = value === category
        return (
          <button
            key={category}
            type="button"
            onClick={() => onChange(isActive ? null : category)}
            aria-pressed={isActive}
            className={chipClass(isActive, count === 0)}
          >
            {category}
            <span className={`ml-1 ${isActive ? 'text-rose-100' : 'text-neutral-400'}`}>
              {count}
            </span>
          </button>
        )
      })}

      {/* 태그 만들기 — 누르면 그 자리에서 입력칸으로 바뀐다 */}
      {adding ? (
        <form onSubmit={submit} className="flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => !name.trim() && setAdding(false)}
            onKeyDown={(event) => event.key === 'Escape' && setAdding(false)}
            placeholder="새 태그 이름"
            aria-label="새 태그 이름"
            maxLength={20}
            className="w-28 rounded-full bg-white px-3.5 py-1.5 text-xs text-neutral-700 outline-none ring-1 ring-rose-200 placeholder:text-neutral-300 focus:ring-rose-400"
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="rounded-full bg-rose-400 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-rose-500 disabled:opacity-40"
          >
            추가
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-full border border-dashed border-rose-200 px-3.5 py-1.5 text-xs font-medium text-rose-400 transition-colors hover:border-rose-300 hover:bg-rose-50"
        >
          ＋ 태그
        </button>
      )}
    </div>
  )
}
