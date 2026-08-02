import { useMemo, useState } from 'react'
import ContentCard from './ContentCard.jsx'

const TABS = [
  { key: 'PLANNING', label: '할 것들', emoji: '🗓️' },
  { key: 'COMPLETED', label: '한 것들', emoji: '✅' },
]

/**
 * 메인 대시보드.
 * 상단 탭으로 PLANNING / COMPLETED를 전환하고,
 * 선택된 상태의 컨텐츠를 반응형 카드 그리드로 보여준다.
 */
export default function Dashboard({ contents }) {
  const [activeTab, setActiveTab] = useState('PLANNING')

  const filtered = useMemo(() => {
    const list = contents.filter((c) => c.status === activeTab)
    // 할 것들은 다가오는 순서, 한 것들은 최근 완료 순서로 정렬
    return list.sort((a, b) =>
      activeTab === 'PLANNING' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date),
    )
  }, [contents, activeTab])

  const countByStatus = useMemo(
    () =>
      contents.reduce((acc, c) => {
        acc[c.status] = (acc[c.status] ?? 0) + 1
        return acc
      }, {}),
    [contents],
  )

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      {/* 헤더 */}
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          혜진 <span className="text-rose-400">♥</span> 정우 컨텐츠 보드
        </h1>
        <p className="mt-2 text-sm text-neutral-500">우리 둘의 하고 싶은 것, 해낸 것들을 한곳에</p>
      </header>

      {/* 탭 */}
      <nav className="mb-8 flex justify-center">
        <div className="inline-flex rounded-full bg-white p-1 shadow-sm ring-1 ring-neutral-900/5">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                aria-pressed={isActive}
                className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-rose-400 text-white shadow'
                    : 'text-neutral-500 hover:text-neutral-800'
                }`}
              >
                {tab.emoji} {tab.label}
                <span
                  className={`ml-1.5 text-xs ${isActive ? 'text-rose-100' : 'text-neutral-400'}`}
                >
                  {countByStatus[tab.key] ?? 0}
                </span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* 카드 그리드 */}
      {filtered.length > 0 ? (
        <main className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((content) => (
            <ContentCard key={content.id} content={content} />
          ))}
        </main>
      ) : (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <span className="text-5xl">🌱</span>
          <p className="text-neutral-500">
            {activeTab === 'PLANNING'
              ? '아직 계획한 컨텐츠가 없어요. 릴스 보다가 꽂힌 거 바로 추가해 보세요!'
              : '완료한 컨텐츠가 없어요. 첫 번째 추억을 만들러 가볼까요?'}
          </p>
        </div>
      )}
    </div>
  )
}
