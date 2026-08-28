import { useEffect, useMemo, useState } from 'react'
import { buildRegions } from '../utils/regions.js'
import { searchRegions, isAiRegionSearchAvailable } from '../utils/regionSearch.js'

/**
 * 지역(동네) 검색 한 줄 — 지도 바로 위.
 *
 * '충무로'처럼 **동네 이름**으로 찾거나, "비 오는 날 조용히 걷기 좋은 데"처럼
 * **분위기**로 던지면, 저장해 둔 카드가 있는 동네 중에서 어울리는 곳을 관련도 순으로
 * 보여준다. 지명으로 찾으면 그 동네가 없어도 **가까운 동네**가 위로 올라온다.
 * 결과를 누르면 그 동네로 목록·지도가 걸러진다
 * (검색이 곧 필터다 — 태그 칩과 같은 자리에서 같은 일을 한다).
 *
 * 후보는 **보드에 있는 동네뿐**이다. 안 가 본 새 동네를 발굴해 주지는 않는다.
 * 동 단위가 기본이고, 주소에 동이 없으면 구·시·군 단위로 묶인다 (utils/regions.js).
 *
 * - items    : 지금 탭의 카드들 (동네 후보를 여기서 만든다)
 * - selected : 지금 걸려 있는 동네 (Dashboard가 들고 있는 필터)
 * - onSelect : 동네를 고르거나(null이면 해제) 할 때 Dashboard에 알린다
 */

/**
 * 처음 열었을 때 뭘 검색하면 되는지 알려주는 예시 (누르면 그대로 검색된다).
 * 지명 검색('충무로')이 제일 흔하므로 맨 앞에 둔다.
 */
const EXAMPLES = ['충무로', '조용히 걷기 좋은 동네', '저녁 먹고 술 한잔']

export default function RegionSearch({ items, selected, onSelect }) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  // result: null | { query, results, mode, detail }
  const [result, setResult] = useState(null)
  const [open, setOpen] = useState(false)

  const regions = useMemo(() => buildRegions(items), [items])

  // 탭을 바꾸거나 카드가 줄어 후보 자체가 달라지면 옛 결과는 버린다
  useEffect(() => {
    setResult(null)
  }, [regions])

  const run = async (text) => {
    const trimmed = text.trim()
    if (!trimmed || searching) return
    setQuery(trimmed)
    setSearching(true)
    setOpen(true)
    const found = await searchRegions(trimmed, regions)
    setSearching(false)
    setResult({ query: trimmed, ...found })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    run(query)
  }

  const clear = () => {
    setQuery('')
    setResult(null)
    setOpen(false)
    onSelect(null)
  }

  // 장소가 있는 카드가 하나도 없으면 검색할 동네 자체가 없다
  if (regions.length === 0) return null

  return (
    <section className="mb-4">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm">
            🧭
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder="어디 갈까? — 동네 이름이나 분위기로"
            aria-label="가고 싶은 동네 검색"
            className="w-full rounded-full bg-white py-2.5 pl-9 pr-3 text-sm text-neutral-700 shadow-sm ring-1 ring-neutral-900/10 outline-none transition-shadow placeholder:text-neutral-400 focus:ring-2 focus:ring-rose-300"
          />
        </div>
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="shrink-0 rounded-full bg-rose-400 px-4 py-2.5 text-xs font-medium text-white shadow transition-colors hover:bg-rose-500 disabled:bg-neutral-200 disabled:text-neutral-400"
        >
          {searching ? '찾는 중…' : '찾기'}
        </button>
        {(result || selected) && (
          <button
            type="button"
            onClick={clear}
            className="shrink-0 rounded-full bg-white px-3 py-2.5 text-xs font-medium text-neutral-500 shadow-sm ring-1 ring-neutral-900/10 transition-colors hover:bg-neutral-50"
          >
            초기화
          </button>
        )}
      </form>

      {/* 예시 — 아직 아무것도 안 찾아봤을 때만 */}
      {open && !result && !searching && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => run(example)}
              className="rounded-full bg-white/70 px-3 py-1 text-[11px] text-neutral-500 ring-1 ring-neutral-900/5 transition-colors hover:bg-rose-50 hover:text-rose-500"
            >
              {example}
            </button>
          ))}
          <span className="px-1 py-1 text-[11px] text-neutral-400">
            저장한 카드가 있는 동네 {regions.length}곳에서 찾아요
          </span>
        </div>
      )}

      {searching && (
        <p className="mt-2 animate-pulse text-center text-xs text-neutral-400">
          🧭 &apos;{query}&apos;에 어울리는 동네를 찾는 중…
        </p>
      )}

      {result && !searching && (
        <RegionResults
          result={result}
          selected={selected}
          onSelect={onSelect}
        />
      )}
    </section>
  )
}

/** 검색 결과 목록 — 관련도 높은 순 */
function RegionResults({ result, selected, onSelect }) {
  const { results, detail, mode, query } = result

  return (
    <div className="mt-2 rounded-2xl bg-white px-3 py-3 shadow-sm ring-1 ring-neutral-900/5">
      <p className="mb-2 px-1 text-[11px] text-neutral-400">
        {results.length > 0
          ? `'${query}' — 어울리는 동네 ${results.length}곳 (관련도 순)`
          : `'${query}'에 어울리는 동네를 못 찾았어요`}
        {mode === 'LOCAL' && results.length > 0 && ' · 이름·태그 매칭'}
      </p>

      {/* 실패는 화면에 이유를 남긴다 — AI를 못 썼으면 왜 못 썼는지 그대로 보여준다 */}
      {detail && (
        <p className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-700 ring-1 ring-amber-200">
          ⚠️ {detail}
          {!isAiRegionSearchAvailable && ' (Supabase 키를 넣으면 AI가 분위기까지 읽어요)'}
        </p>
      )}

      {results.length === 0 ? (
        <p className="px-1 pb-1 text-xs text-neutral-500">
          다른 말로 찾아보거나, 카드에 📍 장소를 넣어 두면 그 동네도 후보가 돼요.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {results.map(({ region, score, reason }, index) => {
            const isActive = selected?.key === region.key
            return (
              <li key={region.key}>
                <button
                  type="button"
                  onClick={() => onSelect(isActive ? null : region)}
                  aria-pressed={isActive}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                    isActive ? 'bg-rose-50 ring-1 ring-rose-300' : 'hover:bg-neutral-50'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                      index === 0 ? 'bg-rose-400 text-white' : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1.5">
                      <span className="truncate text-sm font-medium text-neutral-800">
                        {region.label}
                      </span>
                      {/* 구로 묶인 동네는 이름만으론 어딘지 모른다 — 대표 도로명을 붙여 준다 */}
                      {region.hint && (
                        <span className="shrink-0 text-[11px] text-neutral-500">
                          {region.hint} 일대
                        </span>
                      )}
                      <span className="shrink-0 text-[11px] text-neutral-400">
                        카드 {region.contents.length}개
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
                      {reason || region.fullLabel}
                    </span>
                  </span>
                  {/* 관련도 — AI가 매긴 점수를 그대로 보여줘서 순서를 납득할 수 있게 */}
                  <span className="shrink-0 text-[11px] font-medium text-neutral-400">{score}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
