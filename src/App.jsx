import Dashboard from './components/Dashboard.jsx'
import { useContents } from './hooks/useContents.js'

export default function App() {
  const { contents, loading, error, addContent, updateContent, removeContent, toggleStatus, moveContent } =
    useContents()

  return (
    <Dashboard
      contents={contents}
      loading={loading}
      error={error}
      onAdd={addContent}
      onUpdate={updateContent}
      onRemove={removeContent}
      onToggleStatus={toggleStatus}
      onMove={moveContent}
    />
  )
}
