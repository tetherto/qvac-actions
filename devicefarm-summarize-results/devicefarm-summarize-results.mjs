#!/usr/bin/env node
// Tabulates runner and TAP test results per device from <console-dir>/<device>/<run>_<file> logs.

import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const env = process.env
const tapFiles = (env.TAP_FILES || '').split(/\s+/).filter(Boolean)
if (!tapFiles.length) throw new Error('tap-files is empty')
if (!/^\d+$/.test(env.MIN_PASS_MS || ''))
  throw new Error(`min-pass-ms '${env.MIN_PASS_MS}' is not a number`)
const minPassMs = Number(env.MIN_PASS_MS)

const devices = existsSync(env.CONSOLE_DIR)
  ? readdirSync(env.CONSOLE_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  : []
const runners = {}
const cases = {}
for (const dir of devices) {
  const device = dir.replace(/_/g, ' ')
  const files = readdirSync(join(env.CONSOLE_DIR, dir))
  const named = (name) =>
    files
      .filter((f) => f === name || f.endsWith(`_${name}`))
      .map((f) => join(env.CONSOLE_DIR, dir, f))

  for (const file of env.RESULTS_FILE ? named(env.RESULTS_FILE) : []) {
    let tests = []
    try {
      tests = JSON.parse(readFileSync(file, 'utf8')).tests || []
    } catch {
      console.log(`::warning::${file} is not a JSON report`)
    }
    for (const t of tests) {
      const status =
        t.status === 'passed' && (t.duration || 0) < minPassMs ? 'skipped' : t.status || 'unknown'
      ;(runners[t.title || '?'] ||= {})[device] = {
        status,
        durationMs: t.duration || 0
      }
    }
  }

  for (const file of tapFiles.flatMap(named)) {
    for (const [name, result] of parseTap(readFileSync(file, 'utf8')))
      (cases[name] ||= {})[device] ??= result
  }
}

const names = devices.map((d) => d.replace(/_/g, ' '))
writeFileSync(
  join(env.CONSOLE_DIR, 'test-case-details.json'),
  JSON.stringify(
    {
      title: env.TITLE,
      devices: names,
      runners: Object.keys(runners)
        .sort()
        .map((runner) => ({ runner, results: runners[runner] })),
      testCases: Object.keys(cases)
        .sort()
        .map((test) => ({ test, results: cases[test] }))
    },
    null,
    2
  )
)
appendFileSync(env.GITHUB_STEP_SUMMARY, markdown(names))

// "ok 3 - name # time = 12ms", "not ok 4 - name: reason", "ok 5 - name # SKIP"; the first result for a name wins.
function parseTap(text) {
  const seen = new Map()
  for (const line of text.split('\n')) {
    const m = line.match(/((?:not )?ok) (\d+) - (.+)/)
    if (!m) continue
    let name = m[3].trim().replace(/['"]+$/, '')
    let status = m[1] === 'ok' ? 'passed' : 'failed'
    let timeMs = null
    if (name.includes('# SKIP')) [status, name] = ['skipped', name.split('# SKIP')[0]]
    else if (name.includes('# time ='))
      [timeMs, name] = [
        Math.round(Number((name.match(/# time = ([\d.]+)ms/) || [])[1])) || null,
        name.split('# time')[0]
      ]
    else if (status === 'failed') name = name.split(':')[0]
    name = normalize(name)
    if (!seen.has(name)) seen.set(name, { status, timeMs })
  }
  return seen
}

// Dynamic counts in a name would split one test across devices.
function normalize(name) {
  let n = name.replace(/\(\d+\)/g, '(N)').replace(/\b\d{2,}\b/g, 'N')
  for (const marker of ['. Found ', '. Full output', ': "', ', got "']) {
    const i = n.indexOf(marker)
    if (i > 0) {
      n = n.slice(0, i)
      break
    }
  }
  return n.trim()
}

function markdown(columns) {
  const ICON = { passed: '✅', failed: '❌', skipped: '⏭️' }
  const esc = (t) =>
    t
      .replace(/\\/g, '\\\\')
      .replace(/\|/g, '\\|')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/`/g, "'")
      .replace(/[[\]!]/g, '\\$&')
  const cell = (r, ms) =>
    r
      ? `${ICON[r.status] || '–'}${r.status !== 'skipped' && ms ? ` ${Math.floor(ms / 1000)}s` : ''}`
      : '–'
  const head = (cols) => [
    `| ${cols.map(esc).join(' | ')} |`,
    `| ${cols.map(() => '---').join(' | ')} |`
  ]
  const out = []
  if (Object.keys(runners).length) {
    out.push(`### ${esc(env.TITLE)} runners`, '', ...head(['Runner', ...columns]))
    for (const t of Object.keys(runners).sort())
      out.push(
        `| ${esc(t)} | ${columns.map((d) => cell(runners[t][d], runners[t][d]?.durationMs)).join(' | ')} |`
      )
    out.push('')
  }
  const tests = Object.keys(cases).sort()
  if (tests.length) {
    out.push(
      `<details><summary>${esc(env.TITLE)} test cases (${tests.length} tests)</summary>`,
      '',
      ...head(['#', 'Test', ...columns])
    )
    tests.forEach((n, i) =>
      out.push(
        `| ${i + 1} | ${esc(n)} | ${columns.map((d) => cell(cases[n][d], cases[n][d]?.timeMs)).join(' | ')} |`
      )
    )
    out.push('', '</details>', '')
  }
  return out.join('\n')
}
