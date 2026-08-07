import { useEffect, useState } from 'react'

const EMPTY_FORM = {
  title: '',
  status: 'PLANNING',
  date: '',
  reference_url: '',
  reference_platform: 'NONE',
  photo_urls: '',
  category: '',
  memo: '',
}

const CATEGORY_SUGGESTIONS = ['맛집', '여행', '홈데이트', '액티비티']

/** reference_url에서 플랫폼을 자동으로 추측한다 (수동 선택으로 덮어쓸 수 있음). */
function guessPlatform(url) {
  if (/instagram\.com/i.test(url)) return 'INSTAGRAM'
  if (/youtube\.com|youtu\.be/i.test(url)) return 'YOUTUBE'
  if (/tiktok\.com/i.test(url)) return 'TIKTOK'
  return 'NONE'
}

/**
 * 컨텐츠 추가/수정 폼 모달.
 * - isEdit=false + initial 있음: 클립보드 분석 등으로 미리 채워진 '추가' 초안
 * - photo_urls는 한 줄에 하나씩 입력받아 배열로 변환해서 저장
 */
export default function ContentFormModal({ initial, isEdit = Boolean(initial), onSave, onClose }) {
  const [form, setForm] = useState(EMPTY_FORM)

  useEffect(() => {
    if (initial) {
      setForm({ ...initial, photo_urls: (initial.photo_urls ?? []).join('\n') })
    } else {
      setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) })
    }
  }, [initial])

  // ESC로 닫기
  useEffect(() => {
    const onKeyDown = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const setUrl = (e) => {
    const url = e.target.value
    setForm((prev) => ({ ...prev, reference_url: url, reference_platform: guessPlatform(url) }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      ...form,
      title: form.title.trim(),
      category: form.category.trim() || '기타',
      photo_urls: form.photo_urls
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    })
  }

  const inputClass =
    'w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-rose-300 focus:ring-2 focus:ring-rose-100'
  const labelClass = 'mb-1 block text-xs font-medium text-neutral-500'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? '컨텐츠 수정' : '새 컨텐츠 추가'}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-bold text-neutral-900">
          {isEdit ? '✏️ 컨텐츠 수정' : '💡 새 컨텐츠 추가'}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="cf-title" className={labelClass}>
              제목 *
            </label>
            <input
              id="cf-title"
              required
              value={form.title}
              onChange={set('title')}
              placeholder="예: 서해 바다 노을 드라이브"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cf-status" className={labelClass}>
                상태
              </label>
              <select id="cf-status" value={form.status} onChange={set('status')} className={inputClass}>
                <option value="PLANNING">🗓️ 할 것</option>
                <option value="COMPLETED">✅ 한 것</option>
              </select>
            </div>
            <div>
              <label htmlFor="cf-date" className={labelClass}>
                날짜 *
              </label>
              <input
                id="cf-date"
                type="date"
                required
                value={form.date}
                onChange={set('date')}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="cf-category" className={labelClass}>
              카테고리
            </label>
            <input
              id="cf-category"
              value={form.category}
              onChange={set('category')}
              placeholder="맛집, 여행, 홈데이트, 액티비티 …"
              list="category-suggestions"
              className={inputClass}
            />
            <datalist id="category-suggestions">
              {CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div>
              <label htmlFor="cf-url" className={labelClass}>
                아이디어 원본 링크
              </label>
              <input
                id="cf-url"
                type="url"
                value={form.reference_url}
                onChange={setUrl}
                placeholder="https://www.instagram.com/reel/…"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cf-platform" className={labelClass}>
                플랫폼
              </label>
              <select
                id="cf-platform"
                value={form.reference_platform}
                onChange={set('reference_platform')}
                className={inputClass}
              >
                <option value="NONE">없음</option>
                <option value="INSTAGRAM">Instagram</option>
                <option value="YOUTUBE">YouTube</option>
                <option value="TIKTOK">TikTok</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="cf-photos" className={labelClass}>
              사진 URL (한 줄에 하나씩)
            </label>
            <textarea
              id="cf-photos"
              rows={3}
              value={form.photo_urls}
              onChange={set('photo_urls')}
              placeholder={'https://…/photo1.jpg\nhttps://…/photo2.jpg'}
              className={inputClass}
            />
            <p className="mt-1 text-[11px] text-neutral-400">
              완료(한 것) 상태에서 사진이 있으면 임베드 대신 사진 슬라이드가 표시돼요.
            </p>
          </div>

          <div>
            <label htmlFor="cf-memo" className={labelClass}>
              메모
            </label>
            <textarea
              id="cf-memo"
              rows={3}
              value={form.memo}
              onChange={set('memo')}
              placeholder="기대되는 점이나 다녀온 후기를 남겨보세요"
              className={inputClass}
            />
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-4 py-2 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-100"
            >
              취소
            </button>
            <button
              type="submit"
              className="rounded-full bg-rose-400 px-5 py-2 text-sm font-medium text-white shadow transition-colors hover:bg-rose-500"
            >
              {isEdit ? '저장하기' : '추가하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
