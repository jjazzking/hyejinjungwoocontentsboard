import { useMemo, useState } from 'react'
import { PIN_PALETTE } from '../utils/categoryColors.js'
import { DEFAULT_CATEGORIES } from '../hooks/useCategories.js'

/**
 * '태그 관리' 탭 — 태그를 만들고, 태그마다 색을 고르고, 안 쓰는 태그를 지운다.
 *
 * 예전엔 태그 줄 끝의 '＋ 태그' 칩이 유일한 태그 만들기 창구였는데,
 * 색을 고르거나 지우는 자리가 없어서 관리용 탭을 따로 뒀다.
 * 태그 줄(CategoryFilter)은 이제 **거르는 일만** 한다.
 *
 * - categories    : 보드 전체 태그 목록 (useCategories)
 * - colorMap      : 자동 색까지 반영된 { 이름 → 색 } Map (지도 핀·카드와 같은 색)
 * - pickedColors  : 직접 고른 색만 담긴 객체 — '자동' 배지를 붙일지 판단하는 데 쓴다
 * - counts        : 태그별 카드 개수 Map (탭 상관없이 보드 전체 기준)
 * - onSelect(name): 그 태그로 걸러진 '할 것들' 탭으로 보낸다
 */
export default function CategoryManager({
  categories = [],
  colorMap,
  pickedColors = {},
  counts,
  onAdd,
  onPickColor,
  onRemove,
  onSelect,
}) {
  const [name, setName] = useState('')
  // 팔레트를 펼쳐 둔 태그 (한 번에 하나만)
  const [openColor, setOpenColor] = useState(null)

  const defaults = useMemo(() => new Set(DEFAULT_CATEGORIES), [])

  const submit = (event) => {
    event.preventDefault()
    const added = onAdd?.(name)
    if (!added) return
    setName('')
    // 만들자마자 색부터 고를 수 있게 팔레트를 펴 준다
    setOpenColor(added)
  }

  return (
    <section className="mb-8">
      <div className="mb-4 text-center">
        <p className="text-sm text-neutral-500">
          태그를 만들고 색을 고르면 카드 · 지도 핀에 그대로 적용돼요.
        </p>
      </div>

      {/* 태그 만들기 */}
      <form onSubmit={submit} className="mx-auto mb-4 flex max-w-md items-center gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="새 태그 이름 (예: 전시·공연)"
          aria-label="새 태그 이름"
          maxLength={20}
          className="min-w-0 flex-1 rounded-full bg-white px-4 py-2 text-sm text-neutral-700 shadow-sm outline-none ring-1 ring-neutral-900/10 placeholder:text-neutral-300 focus:ring-rose-400"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="shrink-0 rounded-full bg-rose-400 px-4 py-2 text-sm font-medium text-white shadow transition-colors hover:bg-rose-500 disabled:opacity-40"
        >
          ＋ 추가
        </button>
      </form>

      {/* 태그 목록 */}
      <ul className="mx-auto flex max-w-md flex-col gap-2">
        {categories.map((category) => {
          const count = counts?.get(category) ?? 0
          const color = colorMap?.get(category)
          const isOpen = openColor === category
          // 카드에 붙어 있는 태그는 지워도 카드 쪽에서 되살아나므로 지우기를 감춘다.
          // 기본 태그 넷도 코드에 박혀 있어서 지울 수 없다.
          const removable = count === 0 && !defaults.has(category)

          return (
            <li
              key={category}
              className="rounded-2xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-neutral-900/5"
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpenColor(isOpen ? null : category)}
                  aria-expanded={isOpen}
                  title="색 고르기"
                  className="h-6 w-6 shrink-0 rounded-full ring-2 ring-white ring-offset-1 ring-offset-neutral-200 transition-transform hover:scale-110"
                  style={{ backgroundColor: color }}
                >
                  <span className="sr-only">{category} 색 고르기</span>
                </button>

                <button
                  type="button"
                  onClick={() => onSelect?.(category)}
                  className="min-w-0 flex-1 truncate text-left text-sm font-medium text-neutral-700 hover:text-rose-500"
                >
                  {category}
                  {!pickedColors[category] && (
                    <span className="ml-1.5 text-[10px] font-normal text-neutral-300">자동 색</span>
                  )}
                </button>

                <span className="shrink-0 text-xs text-neutral-400">{count}개</span>

                {removable && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`'${category}' 태그를 지울까요?`)) onRemove?.(category)
                    }}
                    title="태그 지우기"
                    className="shrink-0 rounded-full px-2 py-1 text-xs text-neutral-300 transition-colors hover:bg-rose-50 hover:text-rose-500"
                  >
                    🗑️
                  </button>
                )}
              </div>

              {/* 팔레트 — 지도 핀에 쓰는 색 그대로라 배경 위에서도 잘 보인다 */}
              {isOpen && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-neutral-100 pt-2.5">
                  {PIN_PALETTE.map((swatch) => {
                    const isPicked = pickedColors[category] === swatch
                    return (
                      <button
                        key={swatch}
                        type="button"
                        onClick={() => onPickColor?.(category, swatch)}
                        aria-pressed={isPicked}
                        title={swatch}
                        className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${
                          isPicked ? 'ring-2 ring-neutral-800 ring-offset-1' : ''
                        }`}
                        style={{ backgroundColor: swatch }}
                      >
                        <span className="sr-only">{swatch} 색으로</span>
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => onPickColor?.(category, null)}
                    disabled={!pickedColors[category]}
                    className="rounded-full px-2 py-1 text-xs text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-40"
                  >
                    자동으로
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
