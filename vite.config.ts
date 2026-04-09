import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = String(env.VITE_SIGNALING_URL ?? 'https://s.redflow.online').replace(/\/$/, '')
  const secure = target.startsWith('https')

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (id.includes('mediasoup-client') || id.includes('socket.io-client')) {
              return 'webrtc'
            }
            if (id.includes('@supabase/supabase-js')) {
              return 'supabase'
            }
          },
        },
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/socket.io': {
          target,
          changeOrigin: true,
          ws: true,
          secure,
        },
        '/api': {
          target,
          changeOrigin: true,
          secure,
        },
      },
    },
  }
})
