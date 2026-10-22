#!/usr/bin/env node
// latest only for a stable version at or above npm's latest; anything else lands on <fallback-prefix><major>.<minor>.

import { appendFileSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const env = process.env
const DIST_TAG = /^[A-Za-z][A-Za-z0-9._-]*$/
if (env.TAG && !DIST_TAG.test(env.TAG)) throw new Error(`tag '${env.TAG}' is not a dist-tag`)
if (!/^[A-Za-z][A-Za-z0-9._-]*$/.test(env.FALLBACK_PREFIX || ''))
  throw new Error(`fallback-prefix '${env.FALLBACK_PREFIX}' is not a dist-tag prefix`)

const { name, version } = JSON.parse(readFileSync(join(env.WORKDIR, 'package.json'), 'utf8'))
let tag = env.TAG
if (!tag || tag === 'latest') {
  const latest = npmLatest(
    spawnSync('npm', ['view', name, 'dist-tags.latest', '--json'], {
      encoding: 'utf8'
    })
  )
  const [a, b, c] = core(version)
  const [x, y, z] = core(latest)
  const stable = !version.includes('-')
  tag = stable && (a - x || b - y || c - z) >= 0 ? 'latest' : `${env.FALLBACK_PREFIX}${a}.${b}`
}
console.log(`${name}@${version}: ${tag}`)
appendFileSync(env.GITHUB_OUTPUT, `tag=${tag}\n`)

function core(v) {
  return v.replace(/^v/, '').split('-')[0].split('.').map(Number)
}

// A package npm has never seen starts from 0.0.0; any other registry failure stops the release.
function npmLatest({ status, stdout }) {
  if (status === 0) return JSON.parse(stdout || '"0.0.0"') || '0.0.0'
  let code
  try {
    code = JSON.parse(stdout).error?.code
  } catch {}
  if (code === 'E404') return '0.0.0'
  throw new Error(
    `npm view failed (exit ${status}); re-run after the registry recovers, or pass an explicit tag`
  )
}
