import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

function parseArgs() {
  const dumpPath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : path.resolve(repoRoot, 'dump.sql')

  const outPath = process.argv[3]
    ? path.resolve(process.cwd(), process.argv[3])
    : path.resolve(repoRoot, 'public-seed.from-dump.sql')

  const tablesArg = process.argv.find((a) => a.startsWith('--tables='))
  if (!tablesArg) {
    throw new Error('missing --tables=table1,table2')
  }
  const tables = tablesArg
    .slice('--tables='.length)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (!tables.length) throw new Error('empty --tables list')

  return { dumpPath, outPath, tables }
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function main() {
  const { dumpPath, outPath, tables } = parseArgs()

  const raw = fs.readFileSync(dumpPath)
  // Supabase-provided dumps sometimes come as UTF-16LE with BOM (common on Windows transfers).
  // If we decode as UTF-8, ASCII tokens like "COPY public." become "C\0O\0P\0Y\0 ..." and matching fails.
  const dump =
    raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe
      ? raw.toString('utf16le')
      : raw.toString('utf8')

  const out = fs.createWriteStream(outPath, { encoding: 'utf8' })
  out.write('-- Extracted COPY blocks from dump.sql\n')
  out.write(`-- Source: ${path.basename(dumpPath)}\n`)
  out.write(`-- Tables: ${tables.join(', ')}\n`)
  out.write("SET client_encoding = 'UTF8';\n")
  out.write('SET standard_conforming_strings = on;\n')
  out.write('SET check_function_bodies = false;\n')
  out.write('SET client_min_messages = warning;\n')
  out.write('SET row_security = off;\n\n')

  let written = 0
  for (const table of tables) {
    const startRe = new RegExp(
      `^COPY\\s+public\\.${escapeRegExp(table)}\\s*\\([^\\n]*\\)\\s+FROM\\s+stdin;\\s*$`,
      'm'
    )
    const startMatch = dump.match(startRe)
    if (!startMatch || typeof startMatch.index !== 'number') {
      out.write(`-- WARNING: COPY block not found for public.${table}\n\n`)
      continue
    }

    const startIdx = startMatch.index
    const afterStartIdx = startIdx + startMatch[0].length
    const endRe = /^\s*\\\.\s*$/m
    endRe.lastIndex = 0
    const tail = dump.slice(afterStartIdx)
    const endMatch = tail.match(endRe)
    if (!endMatch || typeof endMatch.index !== 'number') {
      out.write(`-- WARNING: COPY block terminator not found for public.${table}\n\n`)
      continue
    }

    const endIdxInDump = afterStartIdx + endMatch.index + endMatch[0].length
    const block = dump.slice(startIdx, endIdxInDump).replace(/\r\n/g, '\n') + '\n\n'

    out.write(`-- public.${table}\n`)
    out.write(block)
    written += 1
  }

  out.end(() => {
    console.log(`Wrote: ${outPath}`)
    console.log(`COPY blocks written: ${written}/${tables.length}`)
  })
}

main()

