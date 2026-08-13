import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// 서비스 워커는 '설치 가능한 앱'이 되기 위한 최소 조건일 뿐이다 (public/sw.js 참고).
// 개발 서버에서는 등록하지 않는다 — 껍데기가 껴 있으면 새로고침이 헷갈려진다.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch((error) => console.error('서비스 워커 등록 실패(무시함):', error))
  })
}
