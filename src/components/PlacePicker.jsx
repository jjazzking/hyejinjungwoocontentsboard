import { useState } from 'react'
import { isPlaceSearchAvailable, searchPlaces, toStoredPlace } from '../utils/placeSearch.js'
import { TIME_SLOTS, resolveTimeSlots, sanitizeTimeSlots } from '../utils/timeSlots.js'

const SOURCE_LABEL = {
  AI: 'AI 추측',
  INSTAGRAM: '인스타 위치',
  NAVER_LINK: '네이버 링크',
}

/**
 * 카드에 장소를 붙이는 입력 영역.
 *
 * - 공유 DB 모드: 이름으로 네이버 지역 검색 → 후보 중 하나를 골라 좌표까지 저장
 * - localStorage 모드(또는 검색 실패): 이름만 직접 입력해도 저장된다 (좌표 없음)
 *
 * value/onChange 는 장소 배열을 그대로 주고받는다.
 * 한 카드에 여러 곳(맛집 투어 등)을 담을 수 있게 배열로 두었다.
 *
 * 시간대도 여기서 곳마다 따로 고른다 — 한 카드에 점심 국밥집과 야장이 같이 있을 수
 * 있어서 카드 하나에 시간대 하나로는 코스를 짤 수 없기 때문이다.
 * defaultSlots 는 카드 기본 시간대로, 아직 직접 고르지 않은 장소가 따라가는 값이다.
 */
export default function PlacePicker({
  value = [],
  onChange,
  defaultSlots = [],
  hint = '',
  inputClass,
  labelClass,
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  // 검색이 실패했을 때 서버가 알려준 원인 (설정 문제 진단용)
  const [detail, setDetail] = useState('')

  const addPlace = (place) => {
    // 같은 이름이 이미 있으면 중복 추가하지 않는다
    if (value.some((p) => p.name === place.name)) return
    onChange([...value, place])
    setQuery('')
    setResults(null)
    setMessage('')
    setDetail('')
  }

  const removePlace = (index) => onChange(value.filter((_, i) => i !== index))

  /**
   * 장소 하나의 시간대를 켜고 끈다.
   * 아직 직접 고른 적이 없는 장소는 화면에 카드 기본값이 켜진 채로 보이므로,
   * 편집도 그 값에서 출발해야 눌린 대로 바뀐다.
   * 사람이 손댄 값이므로 AI 판단 근거는 지운다.
   */
  const toggleTimeSlot = (index, key) => {
    onChange(
      value.map((p, i) => {
        if (i !== index) return p
        const own = sanitizeTimeSlots(p.time_slots)
        const base = own.length > 0 ? own : sanitizeTimeSlots(defaultSlots)
        const next = base.includes(key) ? base.filter((k) => k !== key) : [...base, key]
        return { ...p, time_slots: sanitizeTimeSlots(next), time_reason: '' }
      }),
    )
  }

  /** 자동으로 찾아준 장소를 "맞다"고 확정 — 확인 필요 배지가 사라진다 */
  const confirmPlace = (index) =>
    onChange(value.map((p, i) => (i === index ? { ...p, source: 'MANUAL' } : p)))

  /** 자동 장소가 틀렸을 때: 목록에서 빼고 그 이름을 검색창에 올려 다시 찾게 한다 */
  const researchPlace = (index) => {
    setQuery(value[index].name)
    setResults(null)
    setMessage('')
    setDetail('')
    removePlace(index)
  }

  const handleSearch = async () => {
    const trimmed = query.trim()
    if (!trimmed) return
    setBusy(true)
    setMessage('')
    setDetail('')
    const { places, detail: why } = await searchPlaces(trimmed)
    setBusy(false)
    setResults(places)
    if (why) {
      setMessage('검색에 실패했어요. 이름만 직접 추가할 수도 있어요.')
      setDetail(why)
    } else if (places.length === 0) {
      setMessage('검색 결과가 없어요. 이름만 직접 추가할 수도 있어요.')
    }
  }

  const addByName = () => {
    const trimmed = query.trim()
    if (!trimmed) return
    addPlace({
      name: trimmed,
      address: '',
      lat: null,
      lng: null,
      category: '',
      url: '',
      source: 'MANUAL',
      time_slots: [],
      time_reason: '',
    })
  }

  return (
    <div>
      <span className={labelClass}>📍 장소</span>

      {/* 자동으로 장소를 못 찾았을 때 그 이유를 그대로 보여준다 */}
      {hint && (
        <p className="mb-2 break-words rounded-lg bg-neutral-100 px-2 py-1.5 text-[11px] text-neutral-500">
          🔍 자동 장소 없음 — {hint}
        </p>
      )}

      {/* 선택된 장소들 */}
      {value.length > 0 && (
        <ul className="mb-2 flex flex-col gap-1.5">
          {value.map((place, index) => {
            // 이 장소에 실제로 적용 중인 시간대와, 그게 카드 기본값을 물려받은 것인지
            const applied = resolveTimeSlots(place, { time_slots: defaultSlots })
            const inherited = sanitizeTimeSlots(place.time_slots).length === 0
            return (
              <li
                key={`${place.name}-${index}`}
                className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-neutral-800">
                    {place.name}
                    {SOURCE_LABEL[place.source] && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        ⚠️ {SOURCE_LABEL[place.source]} · 확인해 주세요
                      </span>
                    )}
                    {place.lat == null && (
                      <span className="rounded-full bg-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-600">
                        좌표 없음
                      </span>
                    )}
                  </p>
                  {place.address && <p className="truncate text-xs text-neutral-500">{place.address}</p>}

                  {/* 자동으로 찾아준 장소는 확정하거나 다시 찾을 수 있게 한다 */}
                  {SOURCE_LABEL[place.source] && (
                    <div className="mt-1.5 flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => confirmPlace(index)}
                        className="rounded-full bg-rose-400 px-2.5 py-0.5 text-[11px] font-medium text-white transition-colors hover:bg-rose-500"
                      >
                        ✓ 맞아요
                      </button>
                      <button
                        type="button"
                        onClick={() => researchPlace(index)}
                        className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-neutral-600 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50"
                      >
                        🔍 다시 찾기
                      </button>
                    </div>
                  )}

                  {/* 이 장소의 시간대 — 코스를 짤 때 쓰는 진짜 값이라 곳마다 따로 고른다.
                      아직 안 고른 곳은 카드 기본값이 옅게 켜진 채로 보인다 (지금 뭐가
                      적용 중인지 화면에서 바로 알 수 있게). 누르는 순간 이 장소만의 값이 된다. */}
                  <div className="mt-1.5">
                    <div className="flex flex-wrap gap-1">
                      {TIME_SLOTS.map((slot) => {
                        const selected = applied.includes(slot.key)
                        return (
                          <button
                            key={slot.key}
                            type="button"
                            onClick={() => toggleTimeSlot(index, slot.key)}
                            aria-pressed={selected}
                            title={slot.hint}
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 transition-colors ${
                              selected
                                ? inherited
                                  ? 'bg-sky-50 text-sky-500 ring-sky-200 hover:bg-sky-100'
                                  : 'bg-sky-500 text-white ring-sky-500 hover:bg-sky-600'
                                : 'bg-white text-neutral-400 ring-neutral-200 hover:bg-sky-50 hover:text-sky-600'
                            }`}
                          >
                            {slot.emoji} {slot.label}
                          </button>
                        )
                      })}
                    </div>
                    <p className="mt-1 text-[10px] text-neutral-400">
                      {inherited
                        ? '카드 기본 시간대를 따라가는 중 — 누르면 이 장소만 따로 정해요'
                        : place.time_reason
                          ? `🤖 AI 판단 근거: ${place.time_reason}`
                          : '이 장소만의 시간대'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removePlace(index)}
                  aria-label={`${place.name} 삭제`}
                  className="shrink-0 rounded-full px-1.5 text-sm text-neutral-400 transition-colors hover:bg-white hover:text-red-500"
                >
                  ✕
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* 검색 입력 */}
      <div className="flex gap-2">
        <input
          id="cf-place"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (isPlaceSearchAvailable) handleSearch()
              else addByName()
            }
          }}
          placeholder={isPlaceSearchAvailable ? '가게 이름으로 검색 (예: 속초 중앙시장)' : '장소 이름'}
          aria-label="장소 검색"
          className={inputClass}
        />
        <button
          type="button"
          onClick={isPlaceSearchAvailable ? handleSearch : addByName}
          disabled={busy || !query.trim()}
          className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-500 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? '⏳' : isPlaceSearchAvailable ? '🔍 검색' : '＋ 추가'}
        </button>
      </div>

      {/* 검색 결과 후보 */}
      {results && results.length > 0 && (
        <ul className="mt-2 flex flex-col overflow-hidden rounded-lg border border-neutral-200">
          {results.map((place, index) => (
            <li key={`${place.name}-${index}`} className="border-b border-neutral-100 last:border-b-0">
              <button
                type="button"
                onClick={() => addPlace(toStoredPlace(place))}
                className="block w-full px-3 py-2 text-left transition-colors hover:bg-rose-50"
              >
                <span className="block text-sm font-medium text-neutral-800">{place.name}</span>
                <span className="block truncate text-xs text-neutral-500">
                  {place.roadAddress || place.address}
                  {place.category ? ` · ${place.category}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {message && (
        <p className="mt-1.5 flex items-center gap-2 text-[11px] text-neutral-400">
          {message}
          <button
            type="button"
            onClick={addByName}
            className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-600 transition-colors hover:bg-neutral-200"
          >
            ＋ 이름만 추가
          </button>
        </p>
      )}

      {/* 설정이 덜 됐을 때 원인을 그대로 보여준다 (로그를 열지 않아도 되게) */}
      {detail && (
        <p className="mt-1 break-words rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
          ⚠️ {detail}
        </p>
      )}
    </div>
  )
}
