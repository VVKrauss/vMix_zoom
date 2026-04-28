import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.cwd())
const SRC = path.join(ROOT, 'dump.public.portable.sql')
const OUT = path.join(ROOT, 'docs', 'db-schema.vps.sql')

const input = fs.readFileSync(SRC, 'utf8')
const lines = input.split(/\r?\n/)

let skippingCopy = false
const out = []

for (const line of lines) {
  if (!skippingCopy && /^COPY\s+/i.test(line)) {
    skippingCopy = true
    continue
  }
  if (skippingCopy) {
    if (line.trim() === '\\.') {
      skippingCopy = false
    }
    continue
  }
  out.push(line)
}

const header = [
  '-- Portable schema-only SQL for clean VPS Postgres.',
  `-- Source: ${path.basename(SRC)}`,
  `-- Generated: ${new Date().toISOString()}`,
  '--',
  '-- NOTE:',
  '-- - Data (COPY ... FROM stdin) blocks are stripped.',
  '-- - This file is intended to be applied on an empty database.',
  '',
].join('\n')

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, header + out.join('\n').trimEnd() + '\n', 'utf8')

console.log(`Wrote schema-only SQL to ${path.relative(ROOT, OUT)}`)

