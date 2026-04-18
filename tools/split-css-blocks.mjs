/**
 * Вырезает из src/index.css крупные блоки в src/styles/*.css
 * и вставляет @import на тех же позициях (порядок каскада сохраняется).
 *
 * Границы ищутся по якорным комментариям, не по номерам строк.
 *
 * Запуск из корня проекта: npm run css:split
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const indexPath = path.join(root, 'src', 'index.css')
const stylesDir = path.join(root, 'src', 'styles')

const raw = fs.readFileSync(indexPath, 'utf8')
if (raw.includes("@import './styles/dashboard-page.css'")) {
  console.error(JSON.stringify({ ok: false, skip: 'already_contains_dashboard_import' }))
  process.exit(0)
}

const lines = raw.split(/\r?\n/)

const idx = (pred) => {
  const i = lines.findIndex(pred)
  if (i < 0) throw new Error('Anchor not found')
  return i
}

const iDash = idx((l) => l.includes('/* ─── Dashboard page'))
const iAdmin = idx((l) => l.includes('/* ─── Admin: пользователи'))
const iRoom = idx((l) => l.includes('/* ─── Room ─'))
const iPip = idx((l) => l.includes('/* ─── PiP container'))

if (!(iDash < iAdmin && iAdmin < iRoom && iRoom < iPip)) {
  throw new Error(
    `Unexpected order: dashboard=${iDash} admin=${iAdmin} room=${iRoom} pip=${iPip}`,
  )
}

const head = lines.slice(0, iDash).join('\n')
const dashChunk = lines.slice(iDash, iAdmin).join('\n')
const mid = lines.slice(iAdmin, iRoom).join('\n')
const roomChunk = lines.slice(iRoom, iPip).join('\n')
const tail = lines.slice(iPip).join('\n')

const dashHeader =
  '/* Dashboard: shell, topbar, cabinet, админ-обвязка в лейауте — вынесено из index.css */\n'
const roomHeader =
  '/* Room: раскладка комнаты, плитки, чат фазы B — вынесено из index.css */\n'

fs.mkdirSync(stylesDir, { recursive: true })
fs.writeFileSync(path.join(stylesDir, 'dashboard-page.css'), dashHeader + dashChunk + '\n', 'utf8')
fs.writeFileSync(path.join(stylesDir, 'room-page.css'), roomHeader + roomChunk + '\n', 'utf8')

const merged =
  head +
  "\n@import './styles/dashboard-page.css';\n" +
  mid +
  "\n@import './styles/room-page.css';\n" +
  tail +
  '\n'

fs.writeFileSync(indexPath, merged, 'utf8')

console.error(
  JSON.stringify({
    ok: true,
    dashboardLines: iAdmin - iDash,
    roomLines: iPip - iRoom,
    indexLinesAfter: merged.split(/\r?\n/).length,
  }),
)
