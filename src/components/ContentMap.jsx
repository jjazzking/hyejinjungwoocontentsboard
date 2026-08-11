import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

/**
 * 타일(지도 배경) 제공자.
 *
 * 계정·결제수단 없이 바로 쓸 수 있는 OpenStreetMap으로 시작한다.
 * 좌표는 우리 DB(`places`)에 이미 WGS84로 들어 있으므로, 나중에 네이버/카카오 지도로
 * 갈아끼울 때 바꿀 곳은 이 두 상수와 지도 생성부뿐이다 (docs/MAP_FEATURE.md 5번).
 */
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

// 핀이 하나도 없을 때 보여줄 기본 화면 (서울시청 근처)
const DEFAULT_CENTER = [37.5665, 126.978]
const DEFAULT_ZOOM = 11

function pinIcon(status, active) {
  const tone = status === 'COMPLETED' ? 'cb-pin-done' : 'cb-pin-todo'
  return L.divIcon({
    className: '',
    html: `<span class="cb-pin ${tone}${active ? ' cb-pin-active' : ''}"></span>`,
    iconSize: [18, 18],
    // 회전한 물방울 모양이라 뾰족한 끝이 아이콘 박스보다 아래에 온다
    iconAnchor: [9, 22],
  })
}

function formatDate(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(date.getTime())) return dateStr
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long' }).format(date)
}

const isCoord = (value) => typeof value === 'number' && Number.isFinite(value)

/**
 * 카드들의 장소를 지도에 핀으로 찍어 보여준다.
 *
 * - 핀 색: 할 것 = 앰버 빈 핀, 한 것 = 로즈 채운 핀
 * - 핀을 누르면 하단에 미니 카드가 뜨고, 편집 모드면 거기서 바로 수정할 수 있다
 * - 좌표가 없는 카드(이름만 저장한 장소, 장소 없는 카드)는 지도에 못 뜨므로
 *   아래에 "위치 없는 카드 N개"로 따로 안내한다
 *
 * items 는 Dashboard에서 이미 탭·태그·날짜 필터가 적용된 목록이라
 * 필터가 지도에도 그대로 반영된다.
 */
export default function ContentMap({ items, editable = false, onEdit }) {
  const containerRef = useRef(null)
  const markersRef = useRef(new Map())
  const [map, setMap] = useState(null)
  const [selectedKey, setSelectedKey] = useState(null)

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
          place,
          content,
        })
      })
    }
    return list
  }, [items])

  const missing = useMemo(
    () => items.filter((c) => !(c.places ?? []).some((p) => isCoord(p.lat) && isCoord(p.lng))),
    [items],
  )

  const selected = pins.find((pin) => pin.key === selectedKey) ?? null

  // 지도 생성 (마운트 때 한 번)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined
    const instance = L.map(el, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      // 페이지를 스크롤하다 지도 위에서 확대되는 사고를 막는다 (드래그·버튼은 그대로)
      scrollWheelZoom: false,
    })
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(instance)
    setMap(instance)
    return () => {
      instance.remove()
      setMap(null)
    }
  }, [])

  // 핀 다시 찍기 (필터가 바뀔 때마다)
  useEffect(() => {
    if (!map) return undefined
    // 탭 전환 직후에는 컨테이너 크기가 갓 잡혀서 회색 여백이 남을 수 있다
    map.invalidateSize()

    const group = L.layerGroup().addTo(map)
    const markers = new Map()
    for (const pin of pins) {
      const marker = L.marker([pin.lat, pin.lng], {
        icon: pinIcon(pin.content.status, false),
        title: pin.place.name,
        alt: pin.place.name,
      })
        .on('click', () => setSelectedKey(pin.key))
        .addTo(group)
      markers.set(pin.key, marker)
    }
    markersRef.current = markers

    if (pins.length > 0) {
      map.fitBounds(L.latLngBounds(pins.map((pin) => [pin.lat, pin.lng])), {
        padding: [48, 48],
        maxZoom: 16,
      })
    }

    return () => {
      group.remove()
      markersRef.current = new Map()
    }
  }, [map, pins])

  // 필터가 바뀌어 선택한 핀이 사라졌으면 미니 카드도 닫는다
  useEffect(() => {
    setSelectedKey((prev) => (prev && pins.some((pin) => pin.key === prev) ? prev : null))
  }, [pins])

  // 선택한 핀만 강조 (핀을 다시 찍지 않으므로 지도 위치는 그대로 유지된다)
  useEffect(() => {
    for (const pin of pins) {
      const marker = markersRef.current.get(pin.key)
      marker?.setIcon(pinIcon(pin.content.status, pin.key === selectedKey))
    }
  }, [pins, selectedKey])

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl shadow-sm ring-1 ring-neutral-900/5">
        <div
          ref={containerRef}
          role="application"
          aria-label="장소 지도"
          className="h-[60vh] min-h-80 w-full bg-neutral-100"
        />

        {/* 핀이 하나도 없을 때: 지도를 덮고 이유를 알려준다 */}
        {pins.length === 0 && (
          <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center gap-2 bg-white/85 px-6 text-center backdrop-blur-sm">
            <span className="text-4xl">🗺️</span>
            <p className="text-sm text-neutral-600">지도에 표시할 장소가 아직 없어요.</p>
            <p className="text-xs text-neutral-400">
              카드를 수정해서 📍 장소를 검색해 넣으면 여기에 핀으로 뜹니다.
            </p>
          </div>
        )}

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

      {/* 좌표가 없어 지도에 못 뜨는 카드 안내 */}
      {missing.length > 0 && (
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
      )}
    </div>
  )
}
