import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = String(env.VITE_SIGNALING_URL ?? 'https://s.redflow.online').replace(/\/$/, '')
  const secure = target.startsWith('https')

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: null,
        includeAssets: ['logo.png', 'logo-h.png'],
        manifest: {
          name: 'redflow.online',
          short_name: 'redflow',
          description: 'Комнаты и мессенджер redflow.online',
          theme_color: '#121212',
          background_color: '#0a0a0a',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          lang: 'ru',
          icons: [
            {
              src: '/logo.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/logo.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/socket\.io/, /^\/api\//],
          runtimeCaching: [
            {
              /** REST, Realtime (wss), Storage — не кэшируем в SW, мессенджер всегда из сети. */
              urlPattern: ({ url }) => /\.supabase\.co$/i.test(url.hostname),
              handler: 'NetworkOnly',
            },
          ],
        },
      }),
    ],
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
