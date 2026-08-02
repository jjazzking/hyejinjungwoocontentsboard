import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // GitHub Pages 프로젝트 페이지(https://<user>.github.io/hyejinjungwoocontentsboard/) 경로 대응
  base: '/hyejinjungwoocontentsboard/',
  plugins: [react(), tailwindcss()],
})
