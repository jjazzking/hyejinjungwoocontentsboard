import { useCallback, useEffect, useMemo, useState } from 'react'
import LeafletCanvas from './map/LeafletCanvas.jsx'
import MapLegend from './map/MapLegend.jsx'
import NaverCanvas from './map/NaverCanvas.jsx'
import { useNaverMapsScript } from './map/useNaverMapsScript.js'
import {
  NO_CATEGORY_COLOR,
  NO_CATEGORY_LABEL,
  buildCategoryColorMap,
  contentColor,
} from '../utils/categoryColors.js'

function formatDate(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(date.getTime())) return dateStr
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long' }).format(date)
}

const isCoord = (value) => typeof value === 'number' && Number.isFinite(value)

const DISTRICTS_STORAGE_KEY = 'couple-contents-board:map-districts:v1'

/** 경계 스위치는 켜고 끈 상태를 기억한다 (지도를 열 때마다 다시 끄면 귀찮다) */
function loadDistrictsPref() {
  try {
    return localStorage.getItem(DISTRICTS_STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

/**
 * 카드들의 장소를 지도에 핀으로 찍어 보여준다. 목록 위에 항상 떠 있다.
 *
 * - 지도 엔진: 네이버 지도 키가 있고 인증에 성공하면 네이버, 아니면 OpenStreetMap
 * - 핀 색 = 태그(첫 번째 카테고리), 핀 모양 = 상태(할 것은 테두리만, 한 것은 꽉 채움)
 *   → 어떤 태그가 무슨 색인지는 지도 아래 범례에 나온다
 * - 배경: 시·군·구 경계선 (범례 줄에서 켜고 끈다)
 * - 핀을 누르면 하단에 미니 카드가 뜨고, 편집 모드면 거기서 바로 수정할 수 있다
 * - 좌표가 없는 카드(이름만 저장한 장소, 장소 없는 카드)는 지도에 못 뜨므로
 *   아래에 "위치 없는 카드 N개"로 따로 안내한다
 *
 * items 는 Dashboard에서 이미 탭·태그·날짜 필터가 적용된 목록이라
 * 필터가 지도에도 그대로 반영된다.
 * categories 는 **보드 전체**의 카테고리 목록 — 필터를 걸어도 태그 색이 안 바뀌게 하려면
 * 지금 보이는 카드가 아니라 전체 목록을 기준으로 색을 나눠야 한다.
 */
export default function ContentMap({ items, categories = [], editable = false, onEdit }) {
  const [selectedKey, setSelectedKey] = useState(null)
  // 스크립트는 멀쩡했지만 실제로 그리다가 깨진 경우 (인증 실패한 반쪽짜리 지도 등)
  const [naverBroken, setNaverBroken] = useState(false)
  const [showDistricts, setShowDistricts] = useState(loadDistrictsPref)
  const [zoom, setZoom] = useState(null)
  const naverState = useNaverMapsScript()
  const useNaver = naverState === 'ready' && !naverBroken

  const colorMap = useMemo(() => buildCategoryColorMap(categories), [categories])

  // 좌표가 있는 장소만 핀으로 편다 (카드 하나에 장소가 여러 개면 여러 핀)
  const pins = useMemo(() => {
    const list = []
    for (const content of items) {
      ;(content.places ?? []).forEach((place, index) => {
        if (!isCoord(place.lat) || !isCoord(place.lng)) return
        list.push({
          key: `${content.id}-${index}`,
          lat: place.lat,
          lng: place.lng,
          color: contentColor(content, colorMap),
          place,
          content,
        })
      })
    }
    return list
  }, [items, colorMap])

  // 범례에는 지금 지도에 실제로 떠 있는 태그만 (등장 순서 유지)
  const swatches = useMemo(() => {
    const seen = new Map()
    for (const pin of pins) {
      const name = (pin.content.categories ?? []).find((c) => colorMap.has(c))
      if (name) seen.set(name, colorMap.get(name))
      else seen.set(NO_CATEGORY_LABEL, NO_CATEGORY_COLOR)
    }
    return [...seen.entries()].map(([name, color]) => ({ name, color }))
  }, [pins, colorMap])

  const missing = useMemo(
    () => items.filter((c) => !(c.places ?? []).some((p) => isCoord(p.lat) && isCoord(p.lng))),
    [items],
  )

  const selected = pins.find((pin) => pin.key === selectedKey) ?? null

  // 필터가 바뀌어 선택한 핀이 사라졌으면 미니 카드도 닫는다
  useEffect(() => {
    setSelectedKey((prev) => (prev && pins.some((pin) => pin.key === prev) ? prev : null))
  }, [pins])

  // 캔버스의 핀 이펙트가 이 함수를 의존성으로 잡으므로 정체성을 고정해 둔다
  const handleSelect = useCallback((key) => setSelectedKey(key), [])
  const handleNaverFailure = useCallback(() => setNaverBroken(true), [])
  const handleViewChange = useCallback((next) => setZoom(next), [])

  const toggleDistricts = useCallback(() => {
    setShowDistricts((prev) => {
      const next = !prev
      try {
        localStorage.setItem(DISTRICTS_STORAGE_KEY, next ? 'on' : 'off')
      } catch {
        // 저장 실패해도 이번 세션 동안은 그대로 동작한다
      }
      return next
    })
  }, [])

  // 네이버 스크립트를 기다리는 동안 Leaflet을 먼저 띄우면 지도가 두 번 바뀌어 보인다
  if (naverState === 'loading' || naverState === 'verifying') {
    return (
      <div className="mb-6 flex h-80 flex-col items-center justify-center gap-3 rounded-2xl bg-white/60 text-center sm:h-96">
        <span className="animate-pulse text-4xl">🗺️</span>
        <p className="text-sm text-neutral-400">지도를 불러오는 중…</p>
      </div>
    )
  }

  // 찍을 핀이 없으면 빈 지도를 크게 띄우지 않고 한 줄로 줄인다
  if (pins.length === 0) {
    return (
      <div className="mb-6">
        <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-white px-6 py-8 text-center shadow-sm ring-1 ring-neutral-900/5">
          <span className="text-3xl">🗺️</span>
          <p className="text-sm text-neutral-600">지도에 표시할 장소가 아직 없어요.</p>
          <p className="text-xs text-neutral-400">
            카드를 수정해서 📍 장소를 검색해 넣으면 여기에 핀으로 뜹니다.
          </p>
        </div>
        <MissingList missing={missing} editable={editable} onEdit={onEdit} />
      </div>
    )
  }

  const Canvas = useNaver ? NaverCanvas : LeafletCanvas

  return (
    <div className="mb-6">
      <div className="relative overflow-hidden rounded-2xl shadow-sm ring-1 ring-neutral-900/5">
        <Canvas
          // 네이버 → OSM으로 갈아탈 때 지도 DOM을 새로 만들도록 키를 바꾼다
          key={useNaver ? 'naver' : 'osm'}
          pins={pins}
          selectedKey={selectedKey}
          onSelect={handleSelect}
          onFailure={handleNaverFailure}
          showDistricts={showDistricts}
          onViewChange={handleViewChange}
          className="h-80 w-full bg-neutral-100 sm:h-96"
        />

        {/* 핀 탭 → 미니 카드 */}
        {selected && (
          <div className="absolute inset-x-3 bottom-3 z-[1000] flex gap-3 rounded-xl bg-white/95 p-3 shadow-lg ring-1 ring-neutral-900/10 backdrop-blur sm:right-auto sm:max-w-md">
            {selected.content.photo_urls?.[0] && (
              <img
                src={selected.content.photo_urls[0]}
                alt=""
                className="h-16 w-16 shrink-0 rounded-lg object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5">
                {/* 어느 핀을 눌렀는지 색으로 이어 보이게 */}
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white"
                  style={{
                    background:
                      selected.content.status === 'COMPLETED' ? selected.color : '#fff',
                    boxShadow: `0 0 0 2px ${selected.color}`,
                  }}
                />
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    selected.content.status === 'COMPLETED'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {selected.content.status === 'COMPLETED' ? '✅ 한 것' : '🗓️ 할 것'}
                </span>
                <span className="truncate text-sm font-semibold text-neutral-900">
                  {selected.content.title}
                </span>
              </p>
              <p className="mt-0.5 truncate text-xs text-neutral-500">
                📍 {selected.place.name}
                {selected.place.address ? ` · ${selected.place.address}` : ''}
              </p>
              <p className="mt-0.5 text-[11px] text-neutral-400">
                {formatDate(selected.content.date)}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {selected.place.url && (
                  <a
                    href={selected.place.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-medium text-neutral-600 transition-colors hover:bg-neutral-200"
                  >
                    지도에서 보기 ↗
                  </a>
                )}
                {editable && (
                  <button
                    type="button"
                    onClick={() => onEdit?.(selected.content)}
                    className="rounded-full bg-rose-400 px-2.5 py-0.5 text-[11px] font-medium text-white transition-colors hover:bg-rose-500"
                  >
                    ✏️ 카드 수정
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedKey(null)}
              aria-label="닫기"
              className="h-fit shrink-0 rounded-full px-1.5 text-sm text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      <MapLegend
        swatches={swatches}
        showDistricts={showDistricts}
        onToggleDistricts={toggleDistricts}
        zoom={zoom}
      />

      {/* 어떤 지도를 쓰고 있는지 — 네이버로 바뀌었는지 한눈에 알 수 있게 */}
      {!useNaver && (
        <p className="mt-1.5 text-right text-[11px] text-neutral-400">
          {naverState === 'off'
            ? '🗺️ OpenStreetMap · 네이버 지도 키를 등록하면 자동으로 바뀝니다'
            : '⚠️ 네이버 지도 인증 실패 — OpenStreetMap으로 표시 중 (키·서비스 URL 확인 필요)'}
        </p>
      )}

      <MissingList missing={missing} editable={editable} onEdit={onEdit} />
    </div>
  )
}

/** 좌표가 없어 지도에 못 뜨는 카드 안내 */
function MissingList({ missing, editable, onEdit }) {
  if (missing.length === 0) return null
  return (
    <details className="mt-3 rounded-xl bg-white px-4 py-2.5 text-sm shadow-sm ring-1 ring-neutral-900/5">
      <summary className="cursor-pointer text-neutral-500">
        📍 위치 없는 카드 {missing.length}개
      </summary>
      <ul className="mt-2 flex flex-col gap-1">
        {missing.map((content) => (
          <li key={content.id} className="flex items-center gap-2 text-xs text-neutral-500">
            <span className="truncate">{content.title}</span>
            {editable && (
              <button
                type="button"
                onClick={() => onEdit?.(content)}
                className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-600 transition-colors hover:bg-neutral-200"
              >
                장소 넣기
              </button>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}
