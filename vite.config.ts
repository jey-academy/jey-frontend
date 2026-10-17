import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // `npm run dev:https`에서만 켠다. 아이폰은 HTTPS여야 카메라가 켜져서, 같은 와이파이의 휴대폰으로
    // QR 스캔을 확인할 때 쓴다(자체 서명 인증서라 처음에 경고가 뜬다). 평소 개발과 빌드에는 쓰지 않는다.
    mode === 'https' && basicSsl(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // 개발 서버가 /api 요청을 백엔드로 넘겨준다. 브라우저에는 같은 출처로 보여 쿠키·CORS 설정이 필요 없다.
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    passWithNoTests: true,
  },
}))
