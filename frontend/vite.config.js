import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    // Same-origin API calls in dev: no CORS, no hard-coded backend URL.
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
