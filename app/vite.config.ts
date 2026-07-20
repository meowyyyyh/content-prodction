import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure: (proxy: any) => {
          proxy.on('proxyRes', (_proxyRes: any, _req: any, res: any) => {
            // Prevent response buffering for SSE streams
            res.flushHeaders()
          })
        },
      },
    },
  },
})
