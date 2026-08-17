import { useEffect, useMemo, useState } from 'react'

/**
 * '이 태그에 카드 넣기' 창.
 *
 * 태그를 새로 만들면 대개 **이미 있는 카드들을 그 태그로 묶고 싶은 것**이지
 * 빈 카드를 새로 만들고 싶은 게 아니다. 그래서 기본 화면은 기존 카드 목록이고,
 * 새로 만들기는 맨 위에 버튼 하나로 둔다.
 *
 * 누를 때마다 바로 반영된다 (따로 저장 버튼 없음) — 붙였다 뗐다 하며
 * 고르는 동작이라 확인 단계를 두면 오히려 번거롭다.
 */
export default function CategoryPicker({ category, contents, onToggle, onCreateNew, onClose }) {
  const [keyword, setKeyword] = useState('')

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const rows = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    const matched = query
      ? contents.filter((content) => content.title.toLowerCase().includes(query))
      : contents
    // 이미 태그가 붙은 카드를 위로 올려서 지금 상태가 한눈에 보이게
    return [...matched].sort((a, b) => {
      const has = (c) => ((c.categories ?? []).includes(category) ? 0 : 1)
      return has(a) - has(b)
    })
  }, [contents, category, keyword])

  const pickedCount = contents.filter((c) => (c.categories ?? []).includes(category)).length

  return (
    <>
      <div
        className="fixed inset-0 z-[1100] bg-neutral-900/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`'${category}' 태그에 카드 넣기`}
        className="cb-sheet fixed inset-x-0 bottom-0 z-[1101] flex flex-col rounded-t-3xl bg-white shadow-2xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
      >
        <div className="flex justify-center pt-2.5 sm:hidden">
          <span aria-hidden="true" className="h-1 w-10 rounded-full bg-neutral-200" />
        </div>

        <div className="flex items-center gap-2 border-b border-neutral-900/5 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-neutral-900">
              &apos;{category}&apos;에 넣을 카드 고르기
            </p>
            <p className="text-xs text-neutral-400">지금 {pickedCount}개가 이 태그에 있어요</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-1 shrink-0 rounded-full px-2 py-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-2 px-4 pt-3">
          <button
            type="button"
            onClick={onCreateNew}
            className="w-full rounded-xl border-2 border-dashed border-rose-200 py-2.5 text-sm font-medium text-rose-400 transition-colors hover:border-rose-300 hover:bg-rose-50"
          >
            ＋ 새 카드 만들기
          </button>
          {contents.length > 6 && (
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="카드 제목 검색"
              aria-label="카드 제목 검색"
              className="w-full rounded-xl bg-neutral-50 px-3 py-2 text-sm text-neutral-700 outline-none ring-1 ring-neutral-900/10 placeholder:text-neutral-300 focus:ring-rose-300"
            />
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-400">
              {contents.length === 0 ? '아직 카드가 하나도 없어요.' : '찾는 카드가 없어요.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {rows.map((content) => {
                const picked = (content.categories ?? []).includes(category)
                return (
                  <li key={content.id}>
                    <button
                      type="button"
                      onClick={() => onToggle(content)}
                      aria-pressed={picked}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left ring-1 transition-colors ${
                        picked
                          ? 'bg-rose-50 ring-rose-200'
                          : 'bg-white ring-neutral-900/5 hover:bg-neutral-50'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                          picked ? 'bg-rose-400 text-white' : 'bg-neutral-100 text-transparent'
                        }`}
                      >
                        ✓
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="truncate block text-sm font-medium text-neutral-800">
                          {content.title}
                        </span>
                        <span className="truncate block text-[11px] text-neutral-400">
                          {content.status === 'COMPLETED' ? '✅ 한 것' : '🗓️ 할 것'}
                          {(content.categories ?? []).length > 0 &&
                            ` · ${content.categories.join(', ')}`}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-neutral-900/5 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-full bg-rose-400 py-2.5 text-sm font-medium text-white transition-colors hover:bg-rose-500"
          >
            완료
          </button>
        </div>
      </div>
    </>
  )
}
