import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

function pad(n: number, len: number) {
  return String(Math.max(0, Math.trunc(n))).padStart(len, '0')
}

function computeAppVersion() {
  try {
    const raw = fs.readFileSync('version.json', 'utf8')
    const meta = JSON.parse(raw) as {
      major: number
      minor: number
      basePatch: number
      baseRef: string
    }

    const major = Number(meta.major) || 0
    const minor = Number(meta.minor) || 0
    const basePatch = Math.max(0, Number(meta.basePatch) || 0)
    const baseRef = typeof meta.baseRef === 'string' ? meta.baseRef.trim() : ''

    let commitsSinceBase = 0
    if (baseRef) {
      commitsSinceBase = Number(
        execSync(`git rev-list --count ${baseRef}..HEAD`, { stdio: ['ignore', 'pipe', 'ignore'] })
          .toString()
          .trim(),
      )
      if (!Number.isFinite(commitsSinceBase)) commitsSinceBase = 0
    }

    const patch = basePatch + commitsSinceBase
    return `v ${major}.${pad(minor, 2)}.${pad(patch, 3)}`
  } catch {
    return 'v 0.00.000'
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = String(env.VITE_SIGNALING_URL ?? 'https://s.redflow.online').replace(/\/$/, '')
  const secure = target.startsWith('https')
  const appVersion = computeAppVersion()

  return {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
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
          importScripts: ['push-sw.js'],
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
