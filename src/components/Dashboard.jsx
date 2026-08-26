import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import ContentSummary from './ContentSummary.jsx'
import ContentSheet from './ContentSheet.jsx'
import CategoryPicker from './CategoryPicker.jsx'
import ContentFormModal from './ContentFormModal.jsx'
import ClipboardPrompt from './ClipboardPrompt.jsx'
import BulkAnalyzeButton from './BulkAnalyzeButton.jsx'
import BulkTimeButton from './BulkTimeButton.jsx'
import BulkCaptionButton from './BulkCaptionButton.jsx'
import ShareToast from './ShareToast.jsx'
import CategoryFilter from './CategoryFilter.jsx'
import CategoryManager from './CategoryManager.jsx'
import CompletedCalendar from './CompletedCalendar.jsx'
import MapErrorBoundary from './MapErrorBoundary.jsx'
// 지도 라이브러리(Leaflet)가 꽤 커서, 지도 보기를 켤 때만 내려받게 분리한다
const ContentMap = lazy(() => import('./ContentMap.jsx'))
import { useClipboardSuggestion } from '../hooks/useClipboardSuggestion.js'
import { useSharedLink } from '../hooks/useSharedLink.js'
import { useCategories } from '../hooks/useCategories.js'
import { analyzeLink, normalizeSnsUrl } from '../utils/linkAnalyzer.js'
import { buildCategoryColorMap, contentColor } from '../utils/categoryColors.js'

const TABS = [
  { key: 'PLANNING', label: '할 것들', emoji: '🗓️' },
  { key: 'COMPLETED', label: '한 것들', emoji: '✅' },
  // 카드 탭이 아니라 관리 화면 — 태그 만들기·색 고르기가 여기 모여 있다
  { key: 'CATEGORIES', label: '태그 관리', emoji: '🏷️' },
]

/** 'YYYY-MM-DD' → '7월 12일' */
function formatDay(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(date.getTime())) return dateStr
  return `${date.getMonth() + 1}월 ${date.getDate()}일`
}

/**
 * 메인 대시보드.
 * - 상단 탭으로 PLANNING / COMPLETED 전환 (+ 태그 관리 탭)
 * - '할 것들'은 태그 칩으로, '한 것들'은 달력의 날짜로 걸러서 볼 수 있다
 * - 목록은 **축약 카드**로 깔고, 누르면 풀 카드 시트가 뜬다.
 *   전부 풀 카드로 깔면 임베드·사진 때문에 한 화면에 두세 장밖에 안 들어온다
 * - 카드 액션(✏️ 수정 + ⋯)은 항상 떠 있다 — '편집' 토글을 먼저 켜는 단계를 없앴다
 * - 위치 이동: ☰을 누르면 이동 모드 — 다른 카드를 누르면 그 앞으로, 맨 뒤 슬롯을 누르면 맨 뒤로
 * - 클립보드에서 SNS 링크를 발견하면 하단 배너로 카드 생성을 제안
 * - 다른 앱에서 '공유'로 들어오면(`?url=…`) 묻지 않고 바로 카드로 저장하고 결과만 알린다
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
  // modal: null(닫힘) | { mode: 'add', draft? } | { mode: 'edit', content }
  const [modal, setModal] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  // 이동 모드: ☰을 누른 카드의 id (null이면 이동 중 아님)
  const [movingId, setMovingId] = useState(null)
  // 탭별 보기 필터: 할 것들은 태그, 한 것들은 날짜('YYYY-MM-DD')
  const [categoryFilter, setCategoryFilter] = useState(null)
  const [dateFilter, setDateFilter] = useState(null)
  // 풀 카드 시트: null | { id, place?, color? } — 내용은 contents에서 매번 찾는다
  // (스냅샷을 들고 있으면 수정 직후 옛 내용이 남는다)
  const [detail, setDetail] = useState(null)
  // 기존 카드를 이 태그에 넣는 창: null | 태그 이름
  const [picker, setPicker] = useState(null)

  const { suggestion, resolveSuggestion, checkClipboard, notice } = useClipboardSuggestion(contents)
  const { categories, categoryColors, addCategory, setCategoryColor, removeCategory } =
    useCategories(contents)
  // 축약 카드·지도 핀·태그 칩이 같은 태그 색을 쓰도록 한곳에서 만든다.
  // 태그 관리 탭에서 고른 색(categoryColors)이 있으면 그게 자동 색을 이긴다.
  const colorMap = useMemo(
    () => buildCategoryColorMap(categories, categoryColors),
    [categories, categoryColors],
  )
  // 다른 앱에서 공유로 넘어온 링크 (처음 뜰 때 한 번만 잡힌다)
  const sharedUrl = useSharedLink()
  // shareState: null | { status, title?, contentId? }
  const [shareState, setShareState] = useState(sharedUrl ? { status: 'saving' } : null)
  // 공유 처리는 비동기라 도중에 값이 바뀐다 — 항상 최신값을 읽도록 ref로 따라다닌다
  const contentsRef = useRef(contents)
  contentsRef.current = contents
  const categoriesRef = useRef(categories)
  categoriesRef.current = categories

  // 배열 순서가 곧 표시 순서 — 탭별로 걸러낸 뒤 필터를 적용한다
  const tabItems = useMemo(() => contents.filter((c) => c.status === activeTab), [contents, activeTab])

  // 카드가 하나도 없는 태그도 골라둘 수 있어야 한다 — 방금 만든 태그에 첫 카드를
  // 넣는 게 목적이라서. 목록에서 아예 사라진 태그만 전체 보기로 되돌린다.
  const activeCategory = categoryFilter && categories.includes(categoryFilter) ? categoryFilter : null

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

  // 태그별 카드 개수 — 관리 탭은 탭 구분 없이 보드 전체를 센다
  const countByCategory = useMemo(() => {
    const map = new Map()
    for (const content of contents) {
      for (const category of content.categories ?? []) {
        map.set(category, (map.get(category) ?? 0) + 1)
      }
    }
    return map
  }, [contents])

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

  /** 카드 추가 폼 열기. 태그를 넘기면 그 태그가 미리 붙은 채로 시작한다 */
  const openAddForm = (category) =>
    setModal({ mode: 'add', draft: category ? { categories: [category] } : null })

  /**
   * 태그에 카드 채우기.
   * 태그를 골라둔 상태면 **기존 카드 중에서 고르는 창**을 먼저 연다 —
   * 새 태그를 만드는 건 대개 이미 있는 카드들을 묶으려는 것이라서.
   */
  const openCardsForCategory = (category) =>
    category ? setPicker(category) : openAddForm(null)

  /** 고른 카드에 태그를 붙이거나 뗀다 */
  const toggleCategoryOn = (content, category) => {
    const current = content.categories ?? []
    const next = current.includes(category)
      ? current.filter((name) => name !== category)
      : [...current, category]
    onUpdate(content.id, { categories: next })
  }

  const handleDelete = (content) => {
    if (window.confirm(`'${content.title}' 컨텐츠를 삭제할까요?`)) {
      onRemove(content.id)
    }
  }

  // 공유로 들어온 링크는 확인을 묻지 않고 바로 카드로 만든다.
  // 카드 목록을 다 받은 뒤에 시작해야 중복 검사가 맞고, Supabase 모드에서
  // 정렬 순서(sort_order)도 제대로 붙는다.
  useEffect(() => {
    if (!sharedUrl || loading) return
    let alive = true

    const run = async () => {
      const already = contentsRef.current.find(
        (c) => c.reference_url && normalizeSnsUrl(c.reference_url) === sharedUrl,
      )
      if (already) {
        setShareState({ status: 'duplicate', title: already.title, contentId: already.id })
        return
      }

      let draft
      try {
        draft = await analyzeLink(sharedUrl, categoriesRef.current)
      } catch (analyzeError) {
        console.error('공유 링크 분석 실패:', analyzeError)
      }
      if (!alive) return

      if (!draft) {
        setShareState({ status: 'failed', title: sharedUrl })
        return
      }
      const id = onAdd(draft)
      // 새 카드는 '할 것'으로 들어가므로 그 탭을 보여줘야 방금 저장한 게 보인다
      setActiveTab('PLANNING')
      setShareState({ status: 'saved', title: draft.title, contentId: id })
    }

    run()
    return () => {
      alive = false
    }
    // sharedUrl은 처음 한 번만 정해지고, 나머지는 최신값을 ref로 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedUrl, loading])

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
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          혜진 <span className="text-rose-400">♥</span> 정우 컨텐츠 보드
        </h1>
        <p className="mt-2 text-sm text-neutral-500">우리 둘의 하고 싶은 것, 해낸 것들을 한곳에</p>

        {/* 복사해 둔 SNS 링크 확인 — 브라우저 붙여넣기 팝업은 이 버튼을 눌렀을 때만 뜬다 */}
        <button
          type="button"
          onClick={checkClipboard}
          title="복사해 둔 인스타/유튜브/틱톡 링크로 카드 만들기"
          className="mt-3 rounded-full bg-white px-3.5 py-1.5 text-xs font-medium text-neutral-600 shadow-sm ring-1 ring-neutral-900/10 transition-colors hover:bg-neutral-50"
        >
          📋 복사한 링크로 카드 만들기
        </button>

        {/* 링크만 있고 내용이 안 채워진 카드들 일괄 재분석 (대상이 없으면 안 뜬다) */}
        <div className="mx-auto max-w-md">
          <BulkAnalyzeButton
            contents={contents}
            categories={categories}
            onUpdate={onUpdate}
            onOpenCard={(id) => setDetail({ id })}
          />
          {/* 카드들의 '가기 좋은 시간대' 일괄 채우기 */}
          <BulkTimeButton contents={contents} onUpdate={onUpdate} />
          {/* 원문 캡션이 없는 카드에 게시물 원문만 채워 넣기 (다른 필드는 안 건드린다) */}
          <BulkCaptionButton
            contents={contents}
            onUpdate={onUpdate}
            onOpenCard={(id) => setDetail({ id })}
          />
        </div>
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
                  {tab.key === 'CATEGORIES' ? categories.length : (countByStatus[tab.key] ?? 0)}
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

      {/* 탭별 보기 필터: 할 것들 = 태그 칩, 한 것들 = 달력 (태그 관리 탭은 필터가 없다) */}
      {!loading &&
        activeTab !== 'CATEGORIES' &&
        (activeTab === 'PLANNING' ? (
          <CategoryFilter
            items={tabItems}
            categories={categories}
            colorMap={colorMap}
            value={activeCategory}
            onChange={setCategoryFilter}
          />
        ) : (
          <CompletedCalendar items={tabItems} selectedDate={dateFilter} onSelect={setDateFilter} />
        ))}

      {/* 태그 관리 탭 — 카드 목록·지도 대신 이 화면만 뜬다 */}
      {!loading && activeTab === 'CATEGORIES' && (
        <CategoryManager
          categories={categories}
          colorMap={colorMap}
          pickedColors={categoryColors}
          counts={countByCategory}
          onAdd={addCategory}
          onPickColor={setCategoryColor}
          onRemove={removeCategory}
          onSelect={(category) => {
            setActiveTab('PLANNING')
            setCategoryFilter(category)
          }}
        />
      )}

      {/* 이동 모드 안내 */}
      {movingId && (
        <p className="mb-4 text-center text-sm text-rose-500">
          🚚 이동할 위치의 카드를 누르면 그 앞으로 들어가요 · <kbd className="rounded bg-rose-50 px-1.5 py-0.5 text-xs">ESC</kbd> 또는 ☰을 다시 누르면 취소
        </p>
      )}

      {/* 지도: 목록 위에 항상 떠 있고, 위의 필터가 핀에도 그대로 적용된다.
          외부 지도 스크립트가 터져도 보드는 살아 있어야 하므로 울타리를 두른다 */}
      {!loading && activeTab !== 'CATEGORIES' && (
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
              colorMap={colorMap}
              onOpen={(pin) => setDetail({ id: pin.content.id, place: pin.place, color: pin.color })}
              onOpenCard={(id) => setDetail({ id })}
              onEdit={(content) => setModal({ mode: 'edit', content })}
            />
          </Suspense>
        </MapErrorBoundary>
      )}

      {/* 필터가 걸려 있을 때 지금 무엇을 보고 있는지 알려주는 한 줄 */}
      {!loading && activeTab !== 'CATEGORIES' && hasFilter && filtered.length > 0 && (
        <p className="mb-4 text-center text-sm text-neutral-500">
          {activeTab === 'PLANNING'
            ? `🏷️ '${activeCategory}' 태그 ${filtered.length}개`
            : `📅 ${formatDay(dateFilter)}에 한 것 ${filtered.length}개`}
        </p>
      )}

      {/* 카드 매소너리: 카드 높이가 제각각이어도 컬럼 폭이 일정해 질서가 유지된다 */}
      {activeTab === 'CATEGORIES' ? null : loading ? (
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
          {/* 태그를 갓 만든 직후가 바로 이 화면이다 — 여기서 첫 카드를 넣을 수 있어야 한다 */}
          <div className="flex flex-wrap justify-center gap-2">
            {activeTab === 'PLANNING' && activeCategory && (
              <button
                type="button"
                onClick={() => openCardsForCategory(activeCategory)}
                className="rounded-full bg-rose-400 px-4 py-1.5 text-xs font-medium text-white shadow transition-colors hover:bg-rose-500"
              >
                ＋ &apos;{activeCategory}&apos;에 카드 넣기
              </button>
            )}
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-neutral-600 shadow-sm ring-1 ring-neutral-900/10 transition-colors hover:bg-neutral-50"
            >
              전체 보기
            </button>
          </div>
        </div>
      ) : (
        <main className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* 추가 타일은 항상 맨 앞에. 태그를 골라둔 상태면 그 태그로 채우기가 된다 */}
          <button
            type="button"
            onClick={() => openCardsForCategory(activeCategory)}
            className="flex min-h-20 w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-rose-200 bg-white/60 text-rose-400 transition-colors hover:border-rose-300 hover:bg-rose-50"
          >
            <span className="text-xl">＋</span>
            <span className="text-xs font-medium">
              {activeCategory ? `'${activeCategory}'에 카드 넣기` : '새 컨텐츠 추가'}
            </span>
          </button>

          {filtered.map((content) => (
            <ContentSummary
              key={content.id}
              content={content}
              color={contentColor(content, colorMap)}
              moving={movingId === content.id}
              isMoveTarget={Boolean(movingId) && movingId !== content.id}
              onOpen={() => setDetail({ id: content.id })}
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
              className="flex min-h-20 w-full items-center justify-center rounded-2xl border-2 border-dashed border-rose-300 bg-rose-50/40 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-100/60"
            >
              ⤵️ 맨 뒤로 이동
            </button>
          )}
        </main>
      )}

      {/* 클립보드 링크 감지 배너 */}
      {/* 축약 카드를 누르면 뜨는 풀 카드. 내용은 항상 최신 contents에서 찾는다 */}
      <ContentSheet
        content={detail ? contents.find((c) => c.id === detail.id) ?? null : null}
        place={detail?.place}
        color={detail?.color}
        onEdit={(content) => {
          setDetail(null)
          setModal({ mode: 'edit', content })
        }}
        onClose={() => setDetail(null)}
      />

      {picker && (
        <CategoryPicker
          category={picker}
          contents={contents}
          onToggle={(content) => toggleCategoryOn(content, picker)}
          onCreateNew={() => {
            const category = picker
            setPicker(null)
            openAddForm(category)
          }}
          onClose={() => setPicker(null)}
        />
      )}

      <ShareToast
        state={shareState}
        onEdit={
          shareState?.contentId
            ? () => {
                const content = contents.find((c) => c.id === shareState.contentId)
                if (content) setModal({ mode: 'edit', content })
                setShareState(null)
              }
            : undefined
        }
        onDismiss={() => setShareState(null)}
      />

      <ClipboardPrompt
        suggestion={suggestion}
        notice={notice}
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
