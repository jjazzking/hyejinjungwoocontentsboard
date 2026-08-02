import Dashboard from './components/Dashboard.jsx'
import { useContents } from './hooks/useContents.js'

export default function App() {
  const { contents, addContent, updateContent, removeContent, toggleStatus } = useContents()

  return (
    <Dashboard
      contents={contents}
      onAdd={addContent}
      onUpdate={updateContent}
      onRemove={removeContent}
      onToggleStatus={toggleStatus}
    />
  )
}
