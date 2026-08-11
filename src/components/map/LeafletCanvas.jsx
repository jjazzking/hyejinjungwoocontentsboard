import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { PIN_ANCHOR_Y, PIN_SIZE, pinHtml } from './pin.js'

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

function icon(status, active) {
  return L.divIcon({
    className: '',
    html: pinHtml(status, active),
    iconSize: [PIN_SIZE, PIN_SIZE],
    iconAnchor: [PIN_SIZE / 2, PIN_ANCHOR_Y],
  })
}

export default function LeafletCanvas({ pins, selectedKey, onSelect, className }) {
  const containerRef = useRef(null)
  const markersRef = useRef(new Map())
  const [map, setMap] = useState(null)

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
        icon: icon(pin.content.status, false),
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
      markersRef.current.get(pin.key)?.setIcon(icon(pin.content.status, pin.key === selectedKey))
    }
  }, [pins, selectedKey])

  return <div ref={containerRef} role="application" aria-label="장소 지도" className={className} />
}
