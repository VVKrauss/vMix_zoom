#!/usr/bin/env node
/**
 * Build a "portable" SQL from a Supabase pg_dump plain SQL.
 *
 * Keeps:
 * - public schema objects (tables/types/functions/sequences/views/indexes, etc.)
 * - COPY public.* data blocks
 * - minimal safe prologue (SETs)
 *
 * Drops:
 * - non-public schemas (auth/storage/realtime/...)
 * - ownership/privileges/roles
 * - RLS/policies (we enforce auth in the API now)
 * - Supabase extensions in custom schemas
 *
 * Usage:
 *   node scripts/sql/make-portable-dump.mjs dump.sql dump.public.portable.sql
 */

import fs from 'node:fs'
import readline from 'node:readline'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
// iconv-lite is used only for data repair in COPY blocks
// (CP437 <-> UTF-8 mojibake in the provided dump.sql)
const iconv = require('iconv-lite')

const [inputPath, outputPath] = process.argv.slice(2)
if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/sql/make-portable-dump.mjs <input.sql> <output.sql>')
  process.exit(2)
}

function detectEncoding(p) {
  const fd = fs.openSync(p, 'r')
  try {
    const b = Buffer.alloc(4)
    const n = fs.readSync(fd, b, 0, 4, 0)
    const x = b.subarray(0, n)
    if (x.length >= 2 && x[0] === 0xff && x[1] === 0xfe) return 'utf16le'
    if (x.length >= 2 && x[0] === 0xfe && x[1] === 0xff) return 'utf16be'
    if (x.length >= 3 && x[0] === 0xef && x[1] === 0xbb && x[2] === 0xbf) return 'utf8'
    return 'utf8'
  } finally {
    fs.closeSync(fd)
  }
}

const encoding = detectEncoding(inputPath)
if (encoding === 'utf16be') {
  console.error('Input looks like UTF-16BE; please convert dump to UTF-8 or UTF-16LE.')
  process.exit(2)
}

const input = fs.createReadStream(inputPath, { encoding })
const rl = readline.createInterface({ input, crlfDelay: Infinity })
const out = fs.createWriteStream(outputPath, { encoding: 'utf8' })

let keptLines = 0

function writeln(s = '') {
  out.write(s + '\n')
  keptLines++
}

function shouldDropLine(line) {
  const l = line.trim()
  if (!l) return false
  // Drop any remaining Supabase/auth references even within public objects.
  if (/\bauth\./i.test(l)) return true
  if (/\bsupabase_functions\b/i.test(l)) return true
  if (/\bsupabase_realtime\b/i.test(l)) return true
  if (/^(ALTER\s+SCHEMA\s+.+\s+OWNER\s+TO\s+)/i.test(l)) return true
  if (/^(ALTER\s+TABLE\s+ONLY\s+.+\s+OWNER\s+TO\s+)/i.test(l)) return true
  if (/^(ALTER\s+TABLE\s+.+\s+OWNER\s+TO\s+)/i.test(l)) return true
  if (/^(ALTER\s+SEQUENCE\s+.+\s+OWNER\s+TO\s+)/i.test(l)) return true
  if (/^(ALTER\s+FUNCTION\s+.+\s+OWNER\s+TO\s+)/i.test(l)) return true
  if (/^(ALTER\s+TYPE\s+.+\s+OWNER\s+TO\s+)/i.test(l)) return true
  if (/^(ALTER\s+VIEW\s+.+\s+OWNER\s+TO\s+)/i.test(l)) return true
  if (/^(GRANT|REVOKE)\b/i.test(l)) return true
  if (/^ALTER\s+DEFAULT\s+PRIVILEGES\b/i.test(l)) return true
  if (/^(CREATE|ALTER)\s+ROLE\b/i.test(l)) return true
  if (/^COMMENT\s+ON\b/i.test(l)) return true
  if (/^SECURITY\s+LABEL\s+/i.test(l)) return true
  if (/^CREATE\s+POLICY\b/i.test(l)) return true
  if (/^ALTER\s+TABLE\s+.+\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;$/i.test(l)) return true
  if (/^ALTER\s+TABLE\s+.+\s+DISABLE\s+ROW\s+LEVEL\s+SECURITY;$/i.test(l)) return true
  return false
}

function parseSchemaFromNameHeader(line) {
  // Example:
  // -- Name: something; Type: FUNCTION; Schema: public; Owner: postgres
  const m = line.match(/Schema:\s*([^;]+);/i)
  return m ? m[1].trim() : null
}

function parseTypeFromNameHeader(line) {
  const m = line.match(/Type:\s*([^;]+);/i)
  return m ? m[1].trim() : null
}

function isPublicSchemaObjectTypeAllowed(type) {
  const t = (type ?? '').toUpperCase()
  if (!t) return false
  // Whitelist only portable structural objects for initial import.
  // (Constraints/views/triggers/functions often reference auth.* and Supabase schemas.)
  return t === 'TABLE' || t === 'SEQUENCE' || t === 'TYPE' || t === 'DOMAIN'
}

function isKeptExtensionHeader(line) {
  // Keep only safe/common extensions, and re-create them in default schema.
  // In dump they may appear as: CREATE EXTENSION ... WITH SCHEMA extensions;
  // We'll keep the section, but also rewrite CREATE EXTENSION line later.
  const isExt = /Type:\s*EXTENSION;/i.test(line)
  if (!isExt) return false
  return /Name:\s*(pgcrypto|uuid-ossp)\b/i.test(line)
}

let inCopyPublic = false
let keepSection = false
let sawFirstNameHeader = false
let inPrologue = true
let keptSections = 0
let keptCopyBlocks = 0

function tryRepairMojibake(value) {
  // dump.sql appears to contain UTF-8 text that was decoded through CP437,
  // resulting in box-drawing characters like "╨╤...".
  // Reverse it: encode as CP437 bytes -> decode as UTF-8.
  if (!value) return value
  if (!/[\u2500-\u257F]/u.test(value)) return value
  try {
    const repaired = Buffer.from(value, 'binary').toString('utf8')
    // Buffer.from(str,'binary') is latin1; not what we need.
    // Use TextEncoder? Node doesn't support cp437 directly; rely on iconv-lite? Avoid deps.
    return value
  } catch {
    return value
  }
}

function repairCopyLineIfNeeded(line) {
  if (line === '\\.' || line.startsWith('COPY ')) return line
  if (!/[\u2500-\u257F]/u.test(line)) return line

  const parts = line.split('\t')
  let changed = false
  for (let i = 0; i < parts.length; i++) {
    const v = parts[i]
    if (v === '\\N') continue
    if (!/[\u2500-\u257F]/u.test(v)) continue
    try {
      const bytes = iconv.encode(v, 'cp437')
      const repaired = bytes.toString('utf8')
      if (repaired && repaired !== v) {
        parts[i] = repaired
        changed = true
      }
    } catch {
      // ignore
    }
  }
  return changed ? parts.join('\t') : line
}

writeln('-- Portable dump generated from Supabase pg_dump')
writeln(`-- Source: ${inputPath}`)
writeln(`-- Generated: ${new Date().toISOString()}`)
writeln('--')
writeln('SET statement_timeout = 0;')
writeln("SET client_encoding = 'UTF8';")
writeln("SET standard_conforming_strings = on;")
writeln("SELECT pg_catalog.set_config('search_path', 'public', false);")
writeln('SET check_function_bodies = false;')
writeln('SET client_min_messages = warning;')
writeln('SET row_security = off;')
writeln('')
writeln('-- Extensions (portable)')
writeln('CREATE EXTENSION IF NOT EXISTS pgcrypto;')
writeln('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')
writeln('')

for await (const line of rl) {
  // COPY public.* data blocks
  if (!inCopyPublic && /^COPY\s+public\./i.test(line)) {
    inCopyPublic = true
    keepSection = true
    inPrologue = false
    sawFirstNameHeader = true
    keptCopyBlocks++
    writeln(line)
    continue
  }
  if (inCopyPublic) {
    writeln(repairCopyLineIfNeeded(line))
    if (line.trim() === '\\.') {
      inCopyPublic = false
      keepSection = false
    }
    continue
  }

  // Object sections (identified by "-- Name:" header)
  if (/^--\s+Name:\s+/i.test(line)) {
    sawFirstNameHeader = true
    inPrologue = false
    const schema = parseSchemaFromNameHeader(line)
    const type = parseTypeFromNameHeader(line)
    keepSection = (schema === 'public' && isPublicSchemaObjectTypeAllowed(type)) || isKeptExtensionHeader(line)
    if (keepSection) {
      keptSections++
      writeln(line)
    }
    continue
  }

  // Keep some pg_dump prologue SET lines until first object header.
  if (inPrologue && !sawFirstNameHeader) {
    const trimmed = line.trim()
    if (
      /^SET\s+/i.test(trimmed) ||
      /^SELECT\s+pg_catalog\.set_config/i.test(trimmed) ||
      trimmed === '' ||
      trimmed.startsWith('--')
    ) {
      // We already wrote our own prologue; skip original to reduce noise.
      continue
    }
  }

  if (!keepSection) continue

  if (shouldDropLine(line)) continue

  // Rewrite extension creation into portable form.
  if (/^CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+pgcrypto\b/i.test(line)) continue
  if (/^CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+"uuid-ossp"\b/i.test(line)) continue
  if (/^CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+pgcrypto\s+WITH\s+SCHEMA\b/i.test(line)) continue
  if (/^CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+"uuid-ossp"\s+WITH\s+SCHEMA\b/i.test(line)) continue

  writeln(line)
}

await new Promise((resolve) => out.end(resolve))
console.error(`Wrote ${outputPath}`)
console.error(`keptSections=${keptSections} keptCopyBlocks=${keptCopyBlocks} keptLines=${keptLines}`)

