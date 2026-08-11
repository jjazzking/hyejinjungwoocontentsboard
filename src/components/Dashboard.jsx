import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import ContentCard from './ContentCard.jsx'
import ContentFormModal from './ContentFormModal.jsx'
import ClipboardPrompt from './ClipboardPrompt.jsx'
import CategoryFilter from './CategoryFilter.jsx'
import CompletedCalendar from './CompletedCalendar.jsx'
import MapErrorBoundary from './MapErrorBoundary.jsx'
// 지도 라이브러리(Leaflet)가 꽤 커서, 지도 보기를 켤 때만 내려받게 분리한다
const ContentMap = lazy(() => import('./ContentMap.jsx'))
import { useClipboardSuggestion } from '../hooks/useClipboardSuggestion.js'
import { useCategories } from '../hooks/useCategories.js'
import { analyzeLink } from '../utils/linkAnalyzer.js'

const TABS = [
  { key: 'PLANNING', label: '할 것들', emoji: '🗓️' },
  { key: 'COMPLETED', label: '한 것들', emoji: '✅' },
]

/** 'YYYY-MM-DD' → '7월 12일' */
function formatDay(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(date.getTime())) return dateStr
  return `${date.getMonth() + 1}월 ${date.getDate()}일`
}

/**
 * 메인 대시보드.
 * - 상단 탭으로 PLANNING / COMPLETED 전환
 * - '할 것들'은 태그 칩으로, '한 것들'은 달력의 날짜로 걸러서 볼 수 있다
 * - 매소너리(컬럼) 레이아웃: 임베드 카드는 크게, 매뉴얼 카드는 컴팩트하게
 *   섞여 쌓이면서 컬럼 폭은 일정하게 유지된다
 * - 편집 모드 토글: 카드마다 ☰(위치 이동)/상태 전환/수정/삭제 버튼 + 새 컨텐츠 추가 버튼 노출
 * - 위치 이동: ☰을 누르면 이동 모드 — 다른 카드를 누르면 그 앞으로, 맨 뒤 슬롯을 누르면 맨 뒤로
 * - 클립보드에서 SNS 링크를 발견하면 하단 배너로 카드 생성을 제안
 */
export default function Dashboard({
  contents,
  loading = false,
  error = null,
  onAdd,
  onUpdate,
  onRemove,
  onToggleStatus,
  onMove,
}) {
  const [activeTab, setActiveTab] = useState('PLANNING')
  const [editMode, setEditMode] = useState(false)
  // modal: null(닫힘) | { mode: 'add', draft? } | { mode: 'edit', content }
  const [modal, setModal] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  // 이동 모드: ☰을 누른 카드의 id (null이면 이동 중 아님)
  const [movingId, setMovingId] = useState(null)
  // 탭별 보기 필터: 할 것들은 태그, 한 것들은 날짜('YYYY-MM-DD')
  const [categoryFilter, setCategoryFilter] = useState(null)
  const [dateFilter, setDateFilter] = useState(null)

  const { suggestion, resolveSuggestion } = useClipboardSuggestion(contents)
  const { categories, addCategory } = useCategories(contents)

  // 배열 순서가 곧 표시 순서 — 탭별로 걸러낸 뒤 필터를 적용한다
  const tabItems = useMemo(() => contents.filter((c) => c.status === activeTab), [contents, activeTab])

  // 필터로 쓰던 태그가 사라지면(마지막 카드 삭제 등) 자동으로 전체 보기로 돌아간다
  const activeCategory =
    categoryFilter && tabItems.some((c) => (c.categories ?? []).includes(categoryFilter))
      ? categoryFilter
      : null

  const filtered = useMemo(() => {
    if (activeTab === 'PLANNING') {
      return activeCategory
        ? tabItems.filter((c) => (c.categories ?? []).includes(activeCategory))
        : tabItems
    }
    return dateFilter ? tabItems.filter((c) => c.date === dateFilter) : tabItems
  }, [activeTab, tabItems, activeCategory, dateFilter])

  const resetFilters = () => {
    setCategoryFilter(null)
    setDateFilter(null)
  }

  const hasFilter = activeTab === 'PLANNING' ? Boolean(activeCategory) : Boolean(dateFilter)

  // ESC로 이동 모드 취소
  useEffect(() => {
    if (!movingId) return undefined
    const onKeyDown = (e) => e.key === 'Escape' && setMovingId(null)
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [movingId])

  const handleMoveHere = (targetId) => {
    onMove(movingId, targetId)
    setMovingId(null)
  }

  const countByStatus = useMemo(
    () =>
      contents.reduce((acc, c) => {
        acc[c.status] = (acc[c.status] ?? 0) + 1
        return acc
      }, {}),
    [contents],
  )

  const handleSave = (data) => {
    if (modal?.mode === 'edit') {
      onUpdate(modal.content.id, data)
    } else {
      onAdd(data)
      // 추가한 컨텐츠가 바로 보이도록 해당 상태 탭으로 이동
      setActiveTab(data.status)
    }
    setModal(null)
  }

  const handleDelete = (content) => {
    if (window.confirm(`'${content.title}' 컨텐츠를 삭제할까요?`)) {
      onRemove(content.id)
    }
  }

  // 클립보드 링크로 카드 초안 만들기: 게시물 분석 후 폼을 미리 채워서 연다
  const handleCreateFromClipboard = async () => {
    if (!suggestion) return
    setAnalyzing(true)
    const draft = await analyzeLink(suggestion.url, categories)
    setAnalyzing(false)
    resolveSuggestion()
    setModal({ mode: 'add', draft })
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      {/* 헤더 */}
      <header className="relative mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          혜진 <span className="text-rose-400">♥</span> 정우 컨텐츠 보드
        </h1>
        <p className="mt-2 text-sm text-neutral-500">우리 둘의 하고 싶은 것, 해낸 것들을 한곳에</p>

        {/* 편집 모드 토글 */}
        <button
          type="button"
          onClick={() => {
            setEditMode((prev) => !prev)
            setMovingId(null)
          }}
          aria-pressed={editMode}
          className={`absolute right-0 top-0 rounded-full px-3.5 py-1.5 text-xs font-medium shadow-sm ring-1 transition-colors ${
            editMode
              ? 'bg-rose-400 text-white ring-rose-400 hover:bg-rose-500'
              : 'bg-white text-neutral-600 ring-neutral-900/10 hover:bg-neutral-50'
          }`}
        >
          {editMode ? '✔️ 편집 완료' : '✏️ 편집'}
        </button>
      </header>

      {/* 탭 */}
      <nav className="mb-8 flex justify-center">
        <div className="inline-flex rounded-full bg-white p-1 shadow-sm ring-1 ring-neutral-900/5">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setActiveTab(tab.key)
                  setMovingId(null)
                  resetFilters()
                }}
                aria-pressed={isActive}
                className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-rose-400 text-white shadow'
                    : 'text-neutral-500 hover:text-neutral-800'
                }`}
              >
                {tab.emoji} {tab.label}
                <span
                  className={`ml-1.5 text-xs ${isActive ? 'text-rose-100' : 'text-neutral-400'}`}
                >
                  {countByStatus[tab.key] ?? 0}
                </span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* 공유 DB 저장/불러오기 실패 안내 */}
      {error && (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-700 ring-1 ring-amber-200">
          ⚠️ {error}
        </p>
      )}

      {/* 탭별 보기 필터: 할 것들 = 태그 칩, 한 것들 = 달력 */}
      {!loading &&
        (activeTab === 'PLANNING' ? (
          <CategoryFilter items={tabItems} value={activeCategory} onChange={setCategoryFilter} />
        ) : (
          <CompletedCalendar items={tabItems} selectedDate={dateFilter} onSelect={setDateFilter} />
        ))}

      {/* 이동 모드 안내 */}
      {movingId && (
        <p className="mb-4 text-center text-sm text-rose-500">
          🚚 이동할 위치의 카드를 누르면 그 앞으로 들어가요 · <kbd className="rounded bg-rose-50 px-1.5 py-0.5 text-xs">ESC</kbd> 또는 ☰을 다시 누르면 취소
        </p>
      )}

      {/* 지도: 목록 위에 항상 떠 있고, 위의 필터가 핀에도 그대로 적용된다.
          외부 지도 스크립트가 터져도 보드는 살아 있어야 하므로 울타리를 두른다 */}
      {!loading && (
        <MapErrorBoundary>
          <Suspense
            fallback={
              <div className="mb-6 flex h-80 flex-col items-center justify-center gap-3 rounded-2xl bg-white/60 text-center sm:h-96">
                <span className="animate-pulse text-4xl">🗺️</span>
                <p className="text-sm text-neutral-400">지도를 불러오는 중…</p>
              </div>
            }
          >
            <ContentMap
              items={filtered}
              categories={categories}
              editable={editMode}
              onEdit={(content) => setModal({ mode: 'edit', content })}
            />
          </Suspense>
        </MapErrorBoundary>
      )}

      {/* 필터가 걸려 있을 때 지금 무엇을 보고 있는지 알려주는 한 줄 */}
      {!loading && hasFilter && filtered.length > 0 && (
        <p className="mb-4 text-center text-sm text-neutral-500">
          {activeTab === 'PLANNING'
            ? `🏷️ '${activeCategory}' 태그 ${filtered.length}개`
            : `📅 ${formatDay(dateFilter)}에 한 것 ${filtered.length}개`}
        </p>
      )}

      {/* 카드 매소너리: 카드 높이가 제각각이어도 컬럼 폭이 일정해 질서가 유지된다 */}
      {loading ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <span className="animate-pulse text-4xl">💌</span>
          <p className="text-sm text-neutral-400">보드를 불러오는 중…</p>
        </div>
      ) : filtered.length === 0 && hasFilter ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="text-4xl">🔍</span>
          <p className="text-sm text-neutral-500">
            {activeTab === 'PLANNING'
              ? `'${activeCategory}' 태그가 붙은 카드가 없어요.`
              : `${formatDay(dateFilter)}에 기록한 카드가 없어요.`}
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-neutral-600 shadow-sm ring-1 ring-neutral-900/10 transition-colors hover:bg-neutral-50"
          >
            전체 보기
          </button>
        </div>
      ) : filtered.length > 0 || editMode ? (
        <main className="columns-1 gap-6 sm:columns-2 lg:columns-3">
          {/* 편집 모드일 때 맨 앞에 추가 카드 (컴팩트 사이즈) */}
          {editMode && (
            <button
              type="button"
              onClick={() => setModal({ mode: 'add' })}
              className="mb-6 flex min-h-36 w-full break-inside-avoid flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-rose-200 bg-white/60 text-rose-400 transition-colors hover:border-rose-300 hover:bg-rose-50"
            >
              <span className="text-3xl">＋</span>
              <span className="text-sm font-medium">새 컨텐츠 추가</span>
            </button>
          )}

          {filtered.map((content) => (
            <ContentCard
              key={content.id}
              content={content}
              editable={editMode}
              moving={movingId === content.id}
              isMoveTarget={Boolean(movingId) && movingId !== content.id}
              onMoveStart={() => setMovingId((prev) => (prev === content.id ? null : content.id))}
              onMoveHere={() => handleMoveHere(content.id)}
              onEdit={() => setModal({ mode: 'edit', content })}
              onDelete={() => handleDelete(content)}
              onToggleStatus={() => onToggleStatus(content.id)}
            />
          ))}

          {/* 이동 모드: 맨 뒤로 보내는 슬롯 */}
          {movingId && (
            <button
              type="button"
              onClick={() => handleMoveHere(null)}
              className="mb-6 flex min-h-24 w-full break-inside-avoid items-center justify-center rounded-2xl border-2 border-dashed border-rose-300 bg-rose-50/40 text-sm font-medium text-rose-500 transition-colors hover:bg-rose-100/60"
            >
              ⤵️ 맨 뒤로 이동
            </button>
          )}
        </main>
      ) : (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <span className="text-5xl">🌱</span>
          <p className="text-neutral-500">
            {activeTab === 'PLANNING'
              ? '아직 계획한 컨텐츠가 없어요. 릴스 보다가 꽂힌 거 바로 추가해 보세요!'
              : '완료한 컨텐츠가 없어요. 첫 번째 추억을 만들러 가볼까요?'}
          </p>
          <button
            type="button"
            onClick={() => {
              setEditMode(true)
              setModal({ mode: 'add' })
            }}
            className="mt-2 rounded-full bg-rose-400 px-5 py-2 text-sm font-medium text-white shadow transition-colors hover:bg-rose-500"
          >
            ＋ 컨텐츠 추가하기
          </button>
        </div>
      )}

      {/* 클립보드 링크 감지 배너 */}
      <ClipboardPrompt
        suggestion={suggestion}
        analyzing={analyzing}
        onCreate={handleCreateFromClipboard}
        onDismiss={resolveSuggestion}
      />

      {/* 추가/수정 모달 */}
      {modal && (
        <ContentFormModal
          initial={modal.mode === 'edit' ? modal.content : (modal.draft ?? null)}
          isEdit={modal.mode === 'edit'}
          categoryOptions={categories}
          onAddCategory={addCategory}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
