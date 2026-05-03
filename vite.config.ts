import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

/**
 * @import в середине index.css браузером не применяется. Подставляем фрагменты на этапе сборки,
 * порядок каскада как при «живом» разбиении файла.
 */
function inlineIndexCssImports(): Plugin {
  const markDash = "@import './styles/dashboard-page.css';"
  const markRoom = "@import './styles/room-page.css';"
  return {
    name: 'inline-index-css-imports',
    enforce: 'pre',
    transform(code, id) {
      const norm = id.split(path.sep).join('/')
      if (!norm.endsWith('/src/index.css')) return null
      if (!code.includes(markDash)) return null
      const root = process.cwd()
      let dash: string
      let room: string
      try {
        dash = fs.readFileSync(path.join(root, 'src/styles/dashboard-page.css'), 'utf8')
        room = fs.readFileSync(path.join(root, 'src/styles/room-page.css'), 'utf8')
      } catch {
        return null
      }
      let out = code.replace(markDash, `${dash}\n`)
      if (out.includes(markRoom)) out = out.replace(markRoom, `${room}\n`)
      return out
    },
  }
}

function pad(n: number, len: number) {
  return String(Math.max(0, Math.trunc(n))).padStart(len, '0')
}

function pickCommitSha() {
  const envSha =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.NETLIFY_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.COMMIT_REF ||
    ''
  const sha = String(envSha).trim()
  if (sha) return sha
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
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

    const sha = pickCommitSha()
    const shaShort = sha ? sha.slice(0, 7) : ''

    let commitsSinceBase = 0
    let hasReliablePatch = false
    if (baseRef) {
      try {
        commitsSinceBase = Number(
          execSync(`git rev-list --count ${baseRef}..HEAD`, { stdio: ['ignore', 'pipe', 'ignore'] })
            .toString()
            .trim(),
        )
        if (Number.isFinite(commitsSinceBase)) hasReliablePatch = true
      } catch {
        commitsSinceBase = 0
        hasReliablePatch = false
      }
    }

    const patch = basePatch + commitsSinceBase
    const base = `v ${major}.${pad(minor, 2)}.${pad(patch, 3)}`

    // Если CI делает shallow checkout и baseRef недоступен, patch не растёт.
    // Тогда добавляем SHA, чтобы версия на деплое точно менялась на каждый коммит.
    return !hasReliablePatch && shaShort ? `${base}-${shaShort}` : base
  } catch {
    return 'v 0.00.000'
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = String(env.VITE_SIGNALING_URL ?? 'https://s.redflow.online').replace(/\/$/, '')
  const secure = target.startsWith('https')
  const appVersion = computeAppVersion()

  let supabaseApiHost = ''
  try {
    const raw = String(env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '')
    if (raw) supabaseApiHost = new URL(raw).hostname.toLowerCase()
  } catch {
    supabaseApiHost = ''
  }

  /** Для Workbox в sw.js нельзя ссылаться на переменные из vite-конфига внутри urlPattern — только литералы / RegExp на этапе сборки. */
  function escapeRegExpLiteral(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  const supabaseRuntimeCaching = [
    {
      /** Cloud: *.supabase.co — без замыканий из vite config. */
      urlPattern: ({ url }: { url: URL }) => {
        const h = url.hostname.toLowerCase()
        return h.endsWith('.supabase.co')
      },
      handler: 'NetworkOnly' as const,
    },
    ...(supabaseApiHost
      ? [
          {
            urlPattern: new RegExp(
              `^https?:\\/\\/${escapeRegExpLiteral(supabaseApiHost)}(?=/|:|\\?|#|$)`,
              'i',
            ),
            handler: 'NetworkOnly' as const,
          },
        ]
      : []),
  ]

  return {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    plugins: [
      inlineIndexCssImports(),
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: null,
        includeAssets: ['logo.png', 'logo-h.png', 'push-badge.png'],
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
          /** Не тащить в precache тяжёлые чанки комнаты/WebRTC — они подгружаются по маршруту. */
          globIgnores: ['**/webrtc-*.js', '**/RoomSession-*.js', '**/StudioModeWorkspace-*.js'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/socket\.io/, /^\/api\//],
          runtimeCaching: supabaseRuntimeCaching,
        },
      }),
    ],
    build: {
      /** Не вешать `<link rel="modulepreload">` на тяжёлые ленивые чанки — иначе они качаются сразу с index. */
      modulePreload: {
        resolveDependencies(_filename, deps) {
          return deps.filter(
            (d) =>
              !d.includes('/webrtc-') &&
              !d.includes('/RoomSession-') &&
              !d.includes('/StudioModeWorkspace-') &&
              !d.includes('/supabase-'),
          )
        },
      },
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
    optimizeDeps: {
      // Ограничиваем сканирование entry-поинтов (иначе Vite иногда подбирает fixtures из node_modules_ci_test).
      entries: ['index.html', 'src/main.tsx'],
    },
    server: {
      port: 5173,
      fs: {
        // Локальная папка для CI-установки зависимостей; не должна попадать в dev graph.
        deny: ['**/node_modules_ci_test/**'],
      },
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
