import { useEffect, useRef, useState } from 'react'

/**
 * ⚙️ 설정 — 자주 쓰지 않는 일괄 작업들을 접어 두는 서랍.
 *
 * 예전엔 '복사한 링크로 카드 만들기'·'다시 분석'·'시간대'·'원문 수집' 버튼이 헤더에
 * 죄다 펼쳐져 있었다. 넷 다 **가끔 한 번 누르는 작업**인데 매번 자리를 차지해서
 * 보드를 열 때마다 카드보다 버튼이 먼저 보였다. 카드의 액션을 `⋯` 뒤에 접어 둔 것과
 * 같은 이유로 여기 모은다 — **상단에 액션을 새로 추가할 땐 이 안에 넣을 것.**
 *
 * 서랍은 겹쳐 뜨지 않고 **아래로 밀어내며 펼쳐진다.** 일괄 작업은 진행률·실패 사유가
 * 몇 줄씩 늘어나는데, 떠 있는 메뉴로 만들면 지도를 가리거나 잘린다.
 *
 * - busy : 일괄 작업이 도는 중(또는 결과가 아직 안 닫힌 상태)인지.
 *          그동안에는 **접히지 않는다** — 진행률이 안 보이면 끊긴 줄 알게 된다.
 */
export default function SettingsMenu({ busy = false, children }) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)

  // ESC로 닫기 (도는 중에는 무시한다)
  useEffect(() => {
    if (!open || busy) return undefined
    const onKeyDown = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, busy])

  const shown = open || busy

  return (
    <div className="mt-3">
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={shown}
          aria-controls="settings-panel"
          title="링크로 카드 만들기 · 일괄 분석 같은 가끔 쓰는 작업"
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium shadow-sm ring-1 transition-colors ${
            shown
              ? 'bg-rose-400 text-white ring-rose-400 hover:bg-rose-500'
              : 'bg-white text-neutral-600 ring-neutral-900/10 hover:bg-neutral-50'
          }`}
        >
          <span aria-hidden className={busy ? 'animate-pulse' : undefined}>
            ⚙️
          </span>
          설정
          {/* 도는 중에는 서랍을 닫아도 소용없다는 걸 알려 준다 */}
          {busy && <span className="text-[11px] text-rose-100">작업 중</span>}
        </button>
      </div>

      {shown && (
        <div
          id="settings-panel"
          ref={panelRef}
          className="mx-auto mt-2 max-w-md rounded-2xl bg-white/70 px-3 pb-3 text-left shadow-sm ring-1 ring-neutral-900/5"
        >
          {children}
        </div>
      )}
    </div>
  )
}
