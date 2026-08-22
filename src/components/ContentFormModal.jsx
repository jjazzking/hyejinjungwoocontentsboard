import { useEffect, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabaseClient.js'
import { uploadPhoto } from '../utils/uploadPhoto.js'
import { analyzeCaption } from '../utils/linkAnalyzer.js'
import PlacePicker from './PlacePicker.jsx'

// 캡션 붙여넣기 → AI 자동 작성 영역을 숨겨둔다.
// 지금은 안 쓰지만 나중에 다시 켤 수 있게 코드는 그대로 두고 이 값만 true로 바꾸면 된다.
const SHOW_AI_CAPTION = false

const EMPTY_FORM = {
  title: '',
  status: 'PLANNING',
  date: '',
  reference_url: '',
  reference_platform: 'NONE',
  photo_urls: '',
  categories: [],
  places: [],
  memo: '',
}

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
 * - 카테고리는 칩 버튼으로 복수 선택하고, 새 카테고리를 즉석에서 추가할 수 있다
 */
export default function ContentFormModal({
  initial,
  isEdit = Boolean(initial),
  categoryOptions,
  onAddCategory,
  onSave,
  onClose,
}) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [newCategory, setNewCategory] = useState('')
  const [uploading, setUploading] = useState(false)
  const [aiCaption, setAiCaption] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  // 자동 장소를 못 찾았을 때 서버가 알려준 이유 (저장 대상은 아님)
  const [placeDebug, setPlaceDebug] = useState('')
  // 링크 분석이 실패했거나 캡션을 못 읽었을 때의 사유 (저장 대상은 아님)
  const [analysisNote, setAnalysisNote] = useState('')

  useEffect(() => {
    if (initial) {
      const { place_debug, analysis_note, ...rest } = initial
      setPlaceDebug(place_debug ?? '')
      setAnalysisNote(analysis_note ?? '')
      setForm({
        ...rest,
        categories: initial.categories ?? [],
        places: initial.places ?? [],
        photo_urls: (initial.photo_urls ?? []).join('\n'),
      })
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

  const toggleCategory = (name) => {
    setForm((prev) => ({
      ...prev,
      categories: prev.categories.includes(name)
        ? prev.categories.filter((c) => c !== name)
        : [...prev.categories, name],
    }))
  }

  const handleAddCategory = () => {
    const added = onAddCategory(newCategory)
    if (!added) return
    setForm((prev) => ({
      ...prev,
      categories: prev.categories.includes(added) ? prev.categories : [...prev.categories, added],
    }))
    setNewCategory('')
  }

  // 붙여넣은 캡션을 AI로 분석해서 제목·카테고리·메모를 채운다
  const handleAiFill = async () => {
    setAiBusy(true)
    const draft = await analyzeCaption(aiCaption, form.reference_url, categoryOptions)
    setAiBusy(false)
    if (!draft || draft.failed) {
      setAnalysisNote([draft?.failed, draft?.detail].filter(Boolean).join(' — '))
      return
    }
    setAnalysisNote('')
    setPlaceDebug(draft.place_debug ?? '')
    setForm((prev) => {
      const known = new Set((prev.places ?? []).map((p) => p.name))
      return {
        ...prev,
        title: draft.title || prev.title,
        memo: draft.memo || prev.memo,
        categories: [...new Set([...prev.categories, ...draft.categories])],
        places: [...(prev.places ?? []), ...(draft.places ?? []).filter((p) => !known.has(p.name))],
      }
    })
    setAiCaption('')
  }

  // 기기에서 고른 사진들을 Storage에 올리고 URL 목록에 덧붙인다
  const handleUploadFiles = async (e) => {
    const files = [...e.target.files]
    e.target.value = ''
    if (files.length === 0) return
    setUploading(true)
    try {
      const urls = []
      for (const file of files) urls.push(await uploadPhoto(file))
      setForm((prev) => ({
        ...prev,
        photo_urls: [prev.photo_urls.trim(), ...urls].filter(Boolean).join('\n'),
      }))
    } catch {
      window.alert('사진 업로드에 실패했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      ...form,
      title: form.title.trim(),
      places: form.places ?? [],
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
          {/* 링크 분석이 왜 안 됐는지 화면에 그대로 남긴다 (로그를 열지 않아도 알 수 있게) */}
          {analysisNote && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
              ⚠️ 링크에서 내용을 자동으로 채우지 못했어요.
              <br />
              {analysisNote}
              <br />
              게시물 글을 복사해서 아래에 붙여넣으면 그걸로 채워드릴게요.
            </p>
          )}

          {/* 캡션 붙여넣기 → AI 자동 작성 (인스타 등에서 서버 수집이 막혔을 때의 경로) */}
          {(SHOW_AI_CAPTION || analysisNote) && isSupabaseConfigured && (
            <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50/50 p-3">
              <label htmlFor="cf-ai-caption" className={labelClass}>
                ✨ AI 자동 작성 — 게시물 글(캡션)을 붙여넣으면 제목·카테고리·메모를 채워줘요
              </label>
              <textarea
                id="cf-ai-caption"
                rows={2}
                value={aiCaption}
                onChange={(e) => setAiCaption(e.target.value)}
                placeholder="인스타그램 게시물의 글을 복사해서 여기에 붙여넣기"
                className={inputClass}
              />
              <button
                type="button"
                onClick={handleAiFill}
                disabled={aiBusy || !aiCaption.trim()}
                className="mt-2 rounded-full bg-rose-400 px-4 py-1.5 text-xs font-medium text-white shadow transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {aiBusy ? '🤖 분석 중…' : '🤖 AI로 채우기'}
              </button>
            </div>
          )}

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
            <span className={labelClass}>카테고리 (복수 선택 가능)</span>
            <div className="flex flex-wrap gap-2">
              {categoryOptions.map((name) => {
                const selected = form.categories.includes(name)
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleCategory(name)}
                    aria-pressed={selected}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors ${
                      selected
                        ? 'bg-rose-400 text-white ring-rose-400 hover:bg-rose-500'
                        : 'bg-white text-neutral-600 ring-neutral-200 hover:bg-rose-50 hover:ring-rose-200'
                    }`}
                  >
                    {selected ? '✓ ' : ''}
                    {name}
                  </button>
                )
              })}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddCategory()
                  }
                }}
                placeholder="새 카테고리 이름"
                aria-label="새 카테고리 이름"
                className={inputClass}
              />
              <button
                type="button"
                onClick={handleAddCategory}
                disabled={!newCategory.trim()}
                className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-500 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ＋ 추가
              </button>
            </div>
          </div>

          <PlacePicker
            value={form.places}
            onChange={(places) => setForm((prev) => ({ ...prev, places }))}
            hint={form.places.length === 0 ? placeDebug : ''}
            inputClass={inputClass}
            labelClass={labelClass}
          />

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
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="cf-photos" className={`${labelClass} mb-0`}>
                사진 {isSupabaseConfigured ? '' : 'URL (한 줄에 하나씩)'}
              </label>
              {isSupabaseConfigured && (
                <label
                  className={`cursor-pointer rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-100 ${
                    uploading ? 'cursor-not-allowed opacity-50' : ''
                  }`}
                >
                  {uploading ? '⏳ 업로드 중…' : '📷 사진 올리기'}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={uploading}
                    onChange={handleUploadFiles}
                    className="hidden"
                  />
                </label>
              )}
            </div>
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
              disabled={uploading}
              className="rounded-full bg-rose-400 px-5 py-2 text-sm font-medium text-white shadow transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isEdit ? '저장하기' : '추가하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
