import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  server: {
    port: 8080,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/coach': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/coach/, ''),
        ws: true,
      },
    },
  },
})
