import { MIN_ZOOM_DISTRICTS } from './overlays.js'

/**
 * 지도 아래 범례 + 시·군·구 경계 스위치.
 *
 * 지도 위에 띄우지 않고 아래에 붙인 이유: 지도 높이가 320px밖에 안 돼서
 * 떠 있는 패널이 핀을 가린다. 아래 줄이면 접었다 펴지 않아도 항상 다 보인다.
 *
 * - swatches: 지금 지도에 떠 있는 핀들의 태그와 색 [{ name, color }]
 * - showDistricts / onToggleDistricts: 시·군·구 경계 스위치
 * - zoom: 경계선이 배율 때문에 안 보이는 상황을 알려주기 위해 받는다 (없으면 안내 생략)
 */
export default function MapLegend({ swatches, showDistricts, onToggleDistricts, zoom }) {
  const districtsHidden =
    showDistricts && typeof zoom === 'number' && zoom < MIN_ZOOM_DISTRICTS

  const toggleClass = (isOn) =>
    `rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition-colors ${
      isOn
        ? 'bg-neutral-800 text-white ring-neutral-800 hover:bg-neutral-700'
        : 'bg-white text-neutral-500 ring-neutral-900/10 hover:bg-neutral-50'
    }`

  return (
    <div className="mt-2 rounded-xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-neutral-900/5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* 태그별 핀 색 */}
        {swatches.map(({ name, color }) => (
          <span key={name} className="flex items-center gap-1.5 text-[11px] text-neutral-600">
            <span
              aria-hidden="true"
              className="h-3 w-3 shrink-0 rounded-full ring-1 ring-white"
              style={{ background: color, boxShadow: '0 0 0 1px rgb(0 0 0 / 0.15)' }}
            />
            {name}
          </span>
        ))}

        {/* 채움 여부로 상태를 읽는 법 */}
        <span className="flex items-center gap-1.5 text-[11px] text-neutral-400">
          <span
            aria-hidden="true"
            className="h-3 w-3 shrink-0 rounded-full border-[3px] border-neutral-400 bg-white"
          />
          할 것
          <span
            aria-hidden="true"
            className="ml-1 h-3 w-3 shrink-0 rounded-full bg-neutral-400 ring-1 ring-white"
          />
          한 것
        </span>

        {/* 시·군·구 경계 스위치 */}
        <button
          type="button"
          onClick={onToggleDistricts}
          aria-pressed={showDistricts}
          className={`ml-auto ${toggleClass(showDistricts)}`}
        >
          🗺️ 시·구 경계
        </button>
      </div>

      {districtsHidden && (
        <p className="mt-1.5 text-[11px] text-neutral-400">
          경계선은 지도를 조금 더 확대하면 보여요.
        </p>
      )}
    </div>
  )
}
