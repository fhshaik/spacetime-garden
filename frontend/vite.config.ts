import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'

// Strip the /api prefix before forwarding to the backends. Services
// listen on /genomes, /breed, /gallery — the /api segment is purely a
// gateway concern (vite proxy here, ALB rewrite in production).
const apiProxy = (target: string): ProxyOptions => ({
  target,
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/api/, ''),
})

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/genomes': apiProxy('http://localhost:8001'),
      '/api/breed':   apiProxy('http://localhost:8002'),
      '/api/gallery': apiProxy('http://localhost:8003'),
    },
  },
})
