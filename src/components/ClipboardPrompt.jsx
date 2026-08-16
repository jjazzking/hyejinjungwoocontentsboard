const PLATFORM_INFO = {
  INSTAGRAM: { name: 'Instagram', emoji: '📸' },
  YOUTUBE: { name: 'YouTube', emoji: '▶️' },
  TIKTOK: { name: 'TikTok', emoji: '🎵' },
}

/**
 * 클립보드에서 SNS 링크를 발견했을 때 화면 하단에 뜨는 확인 배너.
 * '카드 만들기'를 누르면 게시물 분석 후 추가 폼이 미리 채워진 채 열린다.
 * 제안이 없고 안내 문구(notice)만 있으면 같은 자리에 잠깐 문구만 띄운다.
 */
export default function ClipboardPrompt({ suggestion, notice, analyzing, onCreate, onDismiss }) {
  if (!suggestion) {
    if (!notice) return null
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
        <p className="rounded-full bg-neutral-900/85 px-4 py-2 text-xs font-medium text-white shadow-lg">
          {notice}
        </p>
      </div>
    )
  }

  const platform = PLATFORM_INFO[suggestion.platform] ?? { name: '링크', emoji: '🔗' }

  return (
    <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div className="flex w-full max-w-md flex-col gap-3 rounded-2xl bg-white/95 p-4 shadow-lg ring-1 ring-neutral-900/10 backdrop-blur">
        <div className="flex items-start gap-2.5">
          <span className="text-2xl">{platform.emoji}</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-900">
              복사한 {platform.name} 링크를 발견했어요!
            </p>
            <p className="truncate text-xs text-neutral-400">{suggestion.url}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onDismiss}
            disabled={analyzing}
            className="rounded-full px-3.5 py-1.5 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 disabled:opacity-50"
          >
            나중에
          </button>
          <button
            type="button"
            onClick={onCreate}
            disabled={analyzing}
            className="rounded-full bg-rose-400 px-4 py-1.5 text-xs font-medium text-white shadow transition-colors hover:bg-rose-500 disabled:opacity-70"
          >
            {analyzing ? '게시물 분석 중… (최대 1분)' : '✨ 이 게시물로 카드 만들기'}
          </button>
        </div>
      </div>
    </div>
  )
}
