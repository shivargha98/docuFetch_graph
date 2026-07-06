// Vite configuration for the docuFetch Graph frontend.
// Wires up the React + Tailwind v4 plugins, a dev-server proxy so the app can
// call the FastAPI backend (REST + WebSocket) without CORS friction, and the
// Vitest test runner (jsdom environment, shared setup file, unit+integration
// test discovery).
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.{test,spec}.{ts,tsx}', 'tests/integration/**/*.{test,spec}.{ts,tsx}'],
  },
})
