import { useEffect, useRef, useState } from 'react'

/**
 * 오른쪽 위 톱니바퀴 → 일괄 작업을 모아 두는 작은 설정 메뉴.
 *
 * 예전엔 일괄 작업 버튼들이 헤더에 그대로 깔려 있었는데, 셋이 되고 나니 제목 아래가
 * 버튼 줄로 시끄러워졌다. 자주 누르는 게 아니라 가끔 정리할 때만 쓰는 것들이라
 * 톱니바퀴 뒤로 접었다.
 *
 * ★ 닫혀 있어도 **안의 내용은 계속 살아 있어야 한다** (CSS로만 감춘다).
 *   일괄 작업은 카드당 1분씩 몇십 분을 돌 수 있는데, 패널을 닫을 때 React가 트리를
 *   지워 버리면 Wake Lock이 풀리고 진행 표시도 사라진다. 그래서 조건부 렌더링
 *   (`{open && ...}`)을 쓰면 안 되고 `hidden` 클래스로 감추기만 한다.
 *
 * 그래서 도는 중에 닫으면 화면에 아무 흔적이 없어지므로, busy면 톱니바퀴에 점을 띄워
 * "뭔가 돌고 있다"를 남긴다 (탭을 닫으려 하면 경고가 뜨는데 이유를 알 수 있어야 한다).
 */
export default function SettingsMenu({ busy = false, children }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  // 바깥을 누르면 닫는다
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Esc로 닫기
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div ref={rootRef} className="absolute right-0 top-0 z-40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="설정"
        title="일괄 작업"
        className={`relative flex h-9 w-9 items-center justify-center rounded-full bg-white text-base shadow-sm ring-1 transition-colors ${
          open ? 'ring-rose-300 text-rose-500' : 'ring-neutral-900/10 text-neutral-500 hover:bg-neutral-50'
        }`}
      >
        ⚙️
        {/* 도는 중 표시 — 패널을 닫아도 뭔가 진행 중이라는 걸 알 수 있게 */}
        {busy && (
          <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
          </span>
        )}
      </button>

      {/*
        닫혀 있어도 언마운트하지 않는다 — 위 설명 참고.
        `hidden`은 display:none 이라 안에서 도는 작업은 그대로 살아 있다.
      */}
      <div
        className={`absolute right-0 top-11 w-[min(19rem,calc(100vw-2rem))] rounded-2xl bg-white p-3 text-left shadow-lg ring-1 ring-neutral-900/10 ${
          open ? '' : 'hidden'
        }`}
      >
        <p className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
          일괄 작업
        </p>
        {children}
        <p className="mt-3 border-t border-neutral-100 px-1 pt-2 text-[11px] leading-relaxed text-neutral-400">
          가끔 정리할 때만 쓰는 것들이에요. 도는 중에 이 창을 닫아도 작업은 계속돼요.
        </p>
      </div>
    </div>
  )
}
