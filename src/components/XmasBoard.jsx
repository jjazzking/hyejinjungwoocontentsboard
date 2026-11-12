import { lazy, Suspense, useMemo, useState } from 'react'
import MapErrorBoundary from './MapErrorBoundary.jsx'
import { useXmasSpots } from '../hooks/useXmasSpots.js'
import { buildCategoryColorMap } from '../utils/categoryColors.js'
import {
  XMAS_KINDS,
  formatPeriod,
  isCapitalArea,
  kindOf,
  openState,
  todayBadge,
  toDay,
  upcomingWeekends,
} from '../utils/xmasSeason.js'

const ContentMap = lazy(() => import('./ContentMap.jsx'))

// 지도 핀 색은 종류별로 고정 — 보드의 태그 색과는 따로 논다
const KIND_COLORS = buildCategoryColorMap(Object.values(XMAS_KINDS).map((k) => k.label))

// 좋아요를 누르는 두 사람 — 로그인이 없는 보드라 이름 버튼을 따로 둔다
const LIKERS = [
  { name: '혜진', color: 'text-rose-500', ring: 'ring-rose-200', bg: 'bg-rose-50' },
  { name: '정우', color: 'text-sky-600', ring: 'ring-sky-200', bg: 'bg-sky-50' },
]

const VIEWS = [
  { key: 'OPEN', label: '그 주말에 열림' },
  { key: 'LIKED', label: '♥ 좋아요한 것' },
  { key: 'NEW', label: '이번 주 새로 뜸' },
  { key: 'ALL', label: '전체' },
  { key: 'HIDDEN', label: '숨긴 것' },
]

const NEW_WITHIN_MS = 7 * 24 * 3600_000

const chip = (active) =>
  `rounded-full px-3 py-1 text-xs font-medium transition-colors ${
    active ? 'bg-rose-400 text-white shadow' : 'bg-white text-neutral-500 ring-1 ring-neutral-900/10 hover:text-neutral-800'
  }`

/**
 * 🎄 크리스마스 탭.
 * 수집기(xmas-collect)가 모은 후보를 주말별로 거르고, 마음에 드는 곳만 '보드에 담기'로 카드로 만든다.
 * 후보는 카드가 아니다 — 수백 개가 쌓여도 보드를 어지럽히지 않게 별도 테이블에 둔다.
 */
export default function XmasBoard({ onAddToBoard }) {
  const {
    spots,
    lastRun,
    loading,
    error,
    collect,
    clearCollect,
    patch,
    loadSources,
    runCollect,
    runEnrich,
    likesReady,
    toggleLike,
  } = useXmasSpots()
  const weekends = useMemo(() => upcomingWeekends(), [])
  const [weekendKey, setWeekendKey] = useState(weekends[0]?.key ?? null)
  const [view, setView] = useState('OPEN')
  const [kind, setKind] = useState(null)
  const [capitalOnly, setCapitalOnly] = useState(true)
  const [expanded, setExpanded] = useState(null)
  // 카드의 '지도에서 보기' → 위 지도를 그 핀으로 옮긴다 ({ id, nonce })
  const [mapFocus, setMapFocus] = useState(null)

  const range = weekends.find((w) => w.key === weekendKey) ?? null

  const visible = useMemo(() => {
    const now = Date.now()
    const list = spots.filter((spot) => {
      if (view === 'HIDDEN') return spot.hidden
      if (spot.hidden) return false
      if (capitalOnly && !isCapitalArea(spot)) return false
      if (kind && spot.kind !== kind) return false
      if (view === 'LIKED') return (spot.liked_by ?? []).length > 0
      if (view === 'NEW') return now - new Date(spot.first_seen_at).getTime() < NEW_WITHIN_MS
      if (view === 'OPEN' && range) return openState(spot, range) !== 'closed'
      return true
    })
    // 좋아요 많은 순(둘 다 → 한 명 → 없음)이 먼저, 그 안에서 확실히 열린 곳 → 많이 언급된 순
    const rank = (spot) => (range && openState(spot, range) === 'open' ? 0 : 1)
    const likes = (spot) => (spot.liked_by ?? []).length
    return list.sort(
      (a, b) => likes(b) - likes(a) || rank(a) - rank(b) || b.mention_count - a.mention_count,
    )
  }, [spots, view, kind, capitalOnly, range])

  // 지도는 보드 지도를 그대로 쓴다 — 후보를 카드 모양으로 바꿔서 넘긴다
  const mapItems = useMemo(
    () =>
      visible.map((spot) => ({
        id: spot.id,
        title: spot.name,
        status: spot.added_content_id ? 'COMPLETED' : 'PLANNING',
        categories: [kindOf(spot.kind).label],
        places: spot.place ? [spot.place] : [],
        photo_urls: [],
      })),
    [visible],
  )

  const focus = (id) => {
    setExpanded(id)
    requestAnimationFrame(() =>
      document.getElementById(`xmas-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    )
  }

  const addToBoard = (spot) => {
    const today = toDay(new Date())
    const period = formatPeriod(spot)
    const id = onAddToBoard({
      title: spot.name,
      status: 'PLANNING',
      date: spot.start_date && spot.start_date > today ? spot.start_date : today,
      categories: ['크리스마스'],
      places: spot.place ? [{ ...spot.place, time_slots: [], time_reason: '' }] : [],
      memo: [spot.summary, period && `기간 ${period}`].filter(Boolean).join(' · '),
      reference_url: '',
      reference_platform: 'NONE',
      photo_urls: [],
      caption: '',
    })
    patch(spot.id, { added_content_id: id })
  }

  const counts = useMemo(() => {
    const map = new Map()
    for (const spot of spots) if (!spot.hidden) map.set(spot.kind, (map.get(spot.kind) ?? 0) + 1)
    return map
  }, [spots])

  const collecting = collect && !collect.done

  return (
    <section>
      {/* 수집 상태 */}
      <div className="mb-5 rounded-2xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-neutral-900/5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-neutral-500">
            {lastRun
              ? `마지막 수집 ${new Date(lastRun.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · 후보 ${spots.filter((s) => !s.hidden).length}곳`
              : "아직 수집한 적이 없어요 · '🔄 지금 수집'을 눌러 모아 보세요"}
          </p>
          <span className="flex gap-1.5">
          <button
            type="button"
            disabled={Boolean(collecting)}
            onClick={runEnrich}
            title="새로 수집하지 않고, 사진·위치가 빠진 후보만 채웁니다 (한 번에 최대 40곳)"
            className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 ring-1 ring-neutral-900/10 transition-colors hover:bg-neutral-50 disabled:opacity-60"
          >
            🖼️ 사진 채우기
          </button>
          <button
            type="button"
            disabled={Boolean(collecting)}
            onClick={runCollect}
            className="rounded-full bg-rose-400 px-3.5 py-1.5 text-xs font-medium text-white shadow transition-colors hover:bg-rose-500 disabled:opacity-60"
          >
            {collecting ? '수집 중…' : '🔄 지금 수집'}
          </button>
          </span>
        </div>
        {collect && (
          <div className="mt-2 rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
            <p className="font-medium">{collect.message}</p>
            {collect.log.map((line, i) => (
              <p key={i} className={line.startsWith('⚠️') ? 'text-amber-600' : ''}>
                {line}
              </p>
            ))}
            {collect.done && (
              <button type="button" onClick={clearCollect} className="mt-1 text-neutral-400 underline">
                닫기
              </button>
            )}
          </div>
        )}
        {!collect && lastRun?.detail && (
          <p className="mt-1.5 whitespace-pre-line text-[11px] text-amber-600">⚠️ {lastRun.detail}</p>
        )}
      </div>

      {!loading && !likesReady && (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-2.5 text-center text-xs text-amber-700 ring-1 ring-amber-200">
          ♥ 좋아요를 쓰려면 SUPABASE_SETUP.md 14-4의 SQL 한 줄을 먼저 실행해 주세요.
        </p>
      )}

      {error && (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-700 ring-1 ring-amber-200">
          ⚠️ {error}
        </p>
      )}

      {/* 주말 고르기 */}
      <div className="mb-3 flex flex-wrap justify-center gap-1.5">
        {weekends.map((w) => (
          <button
            key={w.key}
            type="button"
            onClick={() => {
              setWeekendKey(w.key)
              setView('OPEN')
            }}
            className={chip(view === 'OPEN' && weekendKey === w.key)}
          >
            {w.label}
          </button>
        ))}
      </div>

      {/* 보기 · 종류 · 지역 */}
      <div className="mb-5 flex flex-col items-center gap-2">
        <div className="flex flex-wrap justify-center gap-1.5">
          {VIEWS.map((v) => (
            <button key={v.key} type="button" onClick={() => setView(v.key)} className={chip(view === v.key)}>
              {v.label}
            </button>
          ))}
          <button type="button" onClick={() => setCapitalOnly((p) => !p)} className={chip(capitalOnly)}>
            📍 수도권만
          </button>
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          <button type="button" onClick={() => setKind(null)} className={chip(!kind)}>
            전체 종류
          </button>
          {Object.entries(XMAS_KINDS).map(([key, meta]) =>
            counts.get(key) ? (
              <button key={key} type="button" onClick={() => setKind(key)} className={chip(kind === key)}>
                {meta.emoji} {meta.label} <span className="opacity-60">{counts.get(key)}</span>
              </button>
            ) : null,
          )}
        </div>
      </div>

      {/* 지도 */}
      {!loading && (
        <MapErrorBoundary>
          <Suspense fallback={<div className="mb-6 h-80 animate-pulse rounded-2xl bg-white/60 sm:h-96" />}>
            <ContentMap
              items={mapItems}
              colorMap={KIND_COLORS}
              onOpen={(pin) => focus(pin.content.id)}
              onOpenCard={focus}
              onEdit={(item) => focus(item.id)}
              focusRequest={mapFocus}
            />
          </Suspense>
        </MapErrorBoundary>
      )}

      {/* 목록 */}
      {loading ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <span className="animate-pulse text-4xl">🎄</span>
          <p className="text-sm text-neutral-400">후보를 불러오는 중…</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <span className="text-4xl">🎁</span>
          <p className="text-sm text-neutral-500">
            {spots.length === 0 ? "아직 후보가 없어요. '🔄 지금 수집'을 눌러 보세요." : '조건에 맞는 후보가 없어요.'}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 items-start gap-x-3 gap-y-4 pt-2 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((spot) => (
            <SpotCard
              key={spot.id}
              spot={spot}
              range={range}
              expanded={expanded === spot.id}
              onToggle={() => setExpanded((prev) => (prev === spot.id ? null : spot.id))}
              loadSources={loadSources}
              onAdd={() => addToBoard(spot)}
              onHide={() => patch(spot.id, { hidden: !spot.hidden })}
              onLike={likesReady ? (who) => toggleLike(spot.id, who) : null}
              onShowOnMap={() => setMapFocus({ id: spot.id, nonce: Date.now() })}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function SpotCard({ spot, expanded, onToggle, loadSources, onAdd, onHide, onLike, onShowOnMap }) {
  const [sources, setSources] = useState(null)
  const [imageOk, setImageOk] = useState(true)
  const meta = kindOf(spot.kind)
  const badge = todayBadge(spot)
  const period = formatPeriod(spot)
  const isNew = Date.now() - new Date(spot.first_seen_at).getTime() < NEW_WITHIN_MS
  // 좋아요 단계: 0 보통 · 1 한 명(은은하게) · 2 둘 다(확 티 나게)
  const likeCount = (spot.liked_by ?? []).length
  const likeStyle =
    likeCount >= 2
      ? 'bg-gradient-to-br from-rose-100 via-pink-50 to-sky-100 ring-2 ring-rose-400 shadow-md shadow-rose-200'
      : likeCount === 1
        ? 'bg-rose-50/70 ring-2 ring-rose-200'
        : 'bg-white ring-1 ring-neutral-900/5'

  const toggle = () => {
    if (!expanded && sources === null) loadSources(spot.id).then(setSources)
    onToggle()
  }

  return (
    <li
      id={`xmas-${spot.id}`}
      className={`relative rounded-2xl p-3 shadow-sm transition-shadow ${likeStyle} ${
        expanded && likeCount === 0 ? '!ring-rose-300' : ''
      }`}
    >
      {likeCount >= 2 && (
        <span className="absolute -top-2.5 right-3 rounded-full bg-rose-500 px-2.5 py-0.5 text-[11px] font-bold text-white shadow">
          💑 둘 다 좋아요
        </span>
      )}
      <button type="button" onClick={toggle} className="flex w-full gap-3 text-left">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-rose-50 text-2xl">
          {spot.thumbnail_url && imageOk ? (
            // 인스타 이미지 주소는 며칠 뒤 만료된다 — 깨지면 이모지로 대신한다
            <img src={spot.thumbnail_url} alt="" className="h-full w-full object-cover" onError={() => setImageOk(false)} referrerPolicy="no-referrer" />
          ) : (
            meta.emoji
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1">
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${badge.className}`}>{badge.text}</span>
            {isNew && <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-500">NEW</span>}
            {spot.added_content_id && (
              <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-600">보드에 있음</span>
            )}
          </span>
          <span
            className={`mt-0.5 block truncate font-semibold ${
              likeCount >= 2 ? 'text-base text-rose-700' : 'text-sm text-neutral-900'
            }`}
          >
            {spot.name}
          </span>
          <span className="block truncate text-xs text-neutral-500">
            {meta.emoji} {meta.label}
            {period && ` · ${period}`} · 언급 {spot.mention_count}회
          </span>
          {spot.summary && <span className="mt-0.5 block text-xs text-neutral-600">{spot.summary}</span>}
        </span>
      </button>

      {/* 좋아요 — 카드를 펼치지 않아도 바로 누를 수 있게 늘 보인다 */}
      {onLike && (
        <div className="mt-2 flex gap-1.5 pl-[68px]">
          {LIKERS.map((liker) => {
            const on = (spot.liked_by ?? []).includes(liker.name)
            return (
              <button
                key={liker.name}
                type="button"
                aria-pressed={on}
                onClick={() => onLike(liker.name)}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 transition-colors ${
                  on
                    ? `${liker.bg} ${liker.color} ${liker.ring}`
                    : 'bg-white text-neutral-400 ring-neutral-900/10 hover:text-neutral-600'
                }`}
              >
                {on ? '♥' : '♡'} {liker.name}
              </button>
            )
          })}
        </div>
      )}

      {expanded && (
        <div className="mt-3 border-t border-neutral-100 pt-2.5 text-xs text-neutral-600">
          {spot.place ? (
            <a href={spot.place.url} target="_blank" rel="noreferrer" className="block truncate text-sky-600 underline-offset-2 hover:underline">
              📍 {spot.place.name} · {spot.place.address}
            </a>
          ) : (
            <a
              href={`https://map.naver.com/p/search/${encodeURIComponent(spot.name)}`}
              target="_blank"
              rel="noreferrer"
              className="block text-amber-600 underline-offset-2 hover:underline"
            >
              📍 장소 미확인 — 네이버 지도에서 찾아보기
            </a>
          )}

          <p className="mt-2 font-medium text-neutral-500">출처</p>
          {sources === null ? (
            <p className="text-neutral-400">불러오는 중…</p>
          ) : (
            <ul className="mt-1 flex max-h-40 flex-col gap-1 overflow-y-auto">
              {sources.map((s) => (
                <li key={s.url} className="truncate">
                  <a href={s.url} target="_blank" rel="noreferrer" className="hover:underline">
                    {s.type === 'INSTAGRAM' ? '📸' : s.type === 'NEWS' ? '📰' : '📝'} {s.posted_at ? `${s.posted_at.slice(5)} ` : ''}
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {typeof spot.place?.lat === 'number' && typeof spot.place?.lng === 'number' && (
              <button
                type="button"
                onClick={onShowOnMap}
                className="rounded-full bg-sky-50 px-3 py-1 font-medium text-sky-700 ring-1 ring-sky-200 transition-colors hover:bg-sky-100"
              >
                🗺️ 지도에서 보기
              </button>
            )}
            <button
              type="button"
              disabled={Boolean(spot.added_content_id)}
              onClick={onAdd}
              className="rounded-full bg-rose-400 px-3 py-1 font-medium text-white shadow transition-colors hover:bg-rose-500 disabled:bg-neutral-200 disabled:text-neutral-500 disabled:shadow-none"
            >
              {spot.added_content_id ? '✓ 보드에 담음' : '＋ 보드에 담기'}
            </button>
            <button
              type="button"
              onClick={onHide}
              className="rounded-full bg-white px-3 py-1 font-medium text-neutral-500 ring-1 ring-neutral-900/10 transition-colors hover:bg-neutral-50"
            >
              {spot.hidden ? '다시 보기' : '관심 없음'}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
