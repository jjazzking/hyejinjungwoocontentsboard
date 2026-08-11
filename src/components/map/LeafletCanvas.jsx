import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { PIN_ANCHOR_Y, PIN_SIZE, pinHtml } from './pin.js'
import {
  DISTRICT_STYLE,
  MIN_ZOOM_SUBWAY,
  SUBWAY_CORE,
  SUBWAY_HALO,
  loadMapOverlays,
  stillCovered,
  visibleDistricts,
} from './overlays.js'

/**
 * 네이버 지도 키가 없거나 인증에 실패했을 때 쓰는 대체 지도.
 * 계정·결제수단이 필요 없는 OpenStreetMap 타일을 쓴다.
 */
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

// 핀이 하나도 없을 때의 기본 화면 (서울시청 근처)
const DEFAULT_CENTER = [37.5665, 126.978]
const DEFAULT_ZOOM = 11

// 오버레이가 핀을 덮지 않도록 층을 나눈다 (Leaflet 기본: 타일 200 · 마커 600)
const DISTRICT_PANE = 'cb-districts'
const SUBWAY_PANE = 'cb-subway'

function icon(color, done, active) {
  return L.divIcon({
    className: '',
    html: pinHtml({ color, done, active }),
    iconSize: [PIN_SIZE, PIN_SIZE],
    iconAnchor: [PIN_SIZE / 2, PIN_ANCHOR_Y],
  })
}

export default function LeafletCanvas({
  pins,
  selectedKey,
  onSelect,
  overlays,
  onViewChange,
  className,
}) {
  const containerRef = useRef(null)
  const markersRef = useRef(new Map())
  const [map, setMap] = useState(null)
  // 오버레이 데이터(경계·노선)는 켤 때 한 번 받아서 들고 있는다
  const [overlayData, setOverlayData] = useState(null)
  // 경계선은 화면에 걸치는 것만 그리므로 지도를 움직일 때마다 다시 계산한다
  const [view, setView] = useState(null)

  // 지도 생성 (마운트 때 한 번)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined
    const instance = L.map(el, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      // 지도 위에서는 휠로 확대/축소한다 (페이지 스크롤은 지도 밖에서)
      scrollWheelZoom: true,
    })
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(instance)
    instance.createPane(DISTRICT_PANE).style.zIndex = '350'
    instance.createPane(SUBWAY_PANE).style.zIndex = '360'
    // 배경 오버레이는 클릭을 먹지 않아야 핀·지도 조작이 막히지 않는다
    instance.getPane(DISTRICT_PANE).style.pointerEvents = 'none'
    instance.getPane(SUBWAY_PANE).style.pointerEvents = 'none'
    setMap(instance)
    return () => {
      instance.remove()
      setMap(null)
    }
  }, [])

  // 지금 보고 있는 영역·배율을 따라다닌다
  useEffect(() => {
    if (!map) return undefined
    const report = () => {
      const bounds = map.getBounds()
      const zoom = map.getZoom()
      const next = {
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
      }
      // 이미 그려둔 범위 안에서 움직인 거라면 그대로 둔다 (오버레이 재생성 방지)
      setView((prev) => (stillCovered(prev, next, zoom) ? prev : { zoom, bounds: next }))
    }
    report()
    map.on('moveend zoomend', report)
    return () => map.off('moveend zoomend', report)
  }, [map])

  useEffect(() => onViewChange?.(view ? view.zoom : null), [view, onViewChange])

  // 핀 다시 찍기 (필터가 바뀔 때마다)
  useEffect(() => {
    if (!map) return undefined
    // 탭 전환 직후에는 컨테이너 크기가 갓 잡혀서 회색 여백이 남을 수 있다
    map.invalidateSize()

    const group = L.layerGroup().addTo(map)
    const markers = new Map()
    for (const pin of pins) {
      const marker = L.marker([pin.lat, pin.lng], {
        icon: icon(pin.color, pin.content.status === 'COMPLETED', false),
        title: pin.place.name,
        alt: pin.place.name,
      })
        .on('click', () => onSelect(pin.key))
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
  }, [map, pins, onSelect])

  // 선택한 핀만 강조 (핀을 다시 찍지 않으므로 지도 위치는 그대로 유지된다)
  useEffect(() => {
    for (const pin of pins) {
      markersRef.current
        .get(pin.key)
        ?.setIcon(icon(pin.color, pin.content.status === 'COMPLETED', pin.key === selectedKey))
    }
  }, [pins, selectedKey])

  // 오버레이를 하나라도 켜면 그때 데이터를 받는다
  const wantsOverlay = overlays.districts || overlays.subway
  useEffect(() => {
    if (!wantsOverlay || overlayData) return undefined
    let alive = true
    loadMapOverlays().then((data) => alive && setOverlayData(data))
    return () => {
      alive = false
    }
  }, [wantsOverlay, overlayData])

  // 시·군·구 경계
  useEffect(() => {
    if (!map || !overlayData || !overlays.districts) return undefined
    const lines = visibleDistricts(overlayData.districts, view?.bounds, view?.zoom ?? 0)
    if (lines.length === 0) return undefined
    const layer = L.polyline(
      lines.map((line) => line.path),
      {
        pane: DISTRICT_PANE,
        color: DISTRICT_STYLE.color,
        weight: DISTRICT_STYLE.weight,
        opacity: DISTRICT_STYLE.opacity,
        dashArray: DISTRICT_STYLE.dash.join(','),
        interactive: false,
      },
    ).addTo(map)
    return () => layer.remove()
  }, [map, overlayData, overlays.districts, view])

  // 수도권 전철 노선
  useEffect(() => {
    if (!map || !overlayData || !overlays.subway) return undefined
    if ((view?.zoom ?? 0) < MIN_ZOOM_SUBWAY) return undefined
    const group = L.layerGroup().addTo(map)
    for (const line of overlayData.subway) {
      // 후광 → 심 순서로 두 번 그려야 노선이 배경에서 떠오른다
      for (const style of [SUBWAY_HALO, SUBWAY_CORE]) {
        L.polyline(line.paths, {
          pane: SUBWAY_PANE,
          color: line.color,
          weight: style.weight,
          opacity: style.opacity,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false,
        }).addTo(group)
      }
    }
    return () => group.remove()
  }, [map, overlayData, overlays.subway, view?.zoom])

  return <div ref={containerRef} role="application" aria-label="장소 지도" className={className} />
}
