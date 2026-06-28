import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from "@tailwindcss/vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // 綁定到區網，手機可連 (等同 --host)
    proxy: {
      // 前端用相對路徑 /api/...，由 Vite 轉發到本機後端，IP 變了也不用改
      "/api": "http://127.0.0.1:8000",
    },
  },
})
