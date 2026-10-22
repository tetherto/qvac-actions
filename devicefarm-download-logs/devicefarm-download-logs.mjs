#!/usr/bin/env node
// Downloads the logs worth keeping from Device Farm runs and copies them, credentials scrubbed, to an upload dir.
// Layout: <log-dir>/<device>/<run>/... for the raw downloads, <console-dir>/<device>/<run>_<file> for the copies.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, relative, sep } from 'node:path'

const env = process.env
const runArns = JSON.parse(env.RUN_ARNS || '[]')
const patterns = (env.FILES || '').split(/\s+/).filter(Boolean)
const skipExtensions = (env.SKIP_EXTENSIONS || '').split(/[\s,]+/).filter(Boolean)
if (!/^devicefarm-logs\/[A-Za-z0-9_-]+$/.test(env.LOG_DIR))
  throw new Error('platform must be a plain label, e.g. Android')
if (!patterns.length) throw new Error('files is empty')
for (const p of patterns)
  if (p.split('/').some((seg) => !seg || seg === '..' || seg === '.'))
    throw new Error(`'${p}' is not a relative file pattern`)

await download()
extract()
console.log(`Redacted presigned credentials in ${scrub(env.CONSOLE_DIR)} file(s)`)

// Device Farm's own artifacts: the customer artifacts zip, logcat and the test spec's output.
// Videos, screenshots and TCP dumps (up to 600 MB) are skipped; the console links still reach them.
async function download() {
  for (const runArn of runArns) {
    const run = safe(aws(['get-run', '--arn', runArn]).run?.name || 'unknown')
    for (const job of aws(['list-jobs', '--arn', runArn]).jobs || []) {
      const jobDir = join(env.LOG_DIR, safe(job.device?.name || 'unknown'), run)
      for (const suite of aws(['list-suites', '--arn', job.arn]).suites || []) {
        if (['Setup Test', 'Teardown Test'].includes(suite.name)) continue
        for (const type of ['FILE', 'LOG']) {
          for (const artifact of aws(['list-artifacts', '--arn', suite.arn, '--type', type])
            .artifacts || [])
            await save(artifact, join(jobDir, safe(suite.name)))
        }
      }
      for (const artifact of aws(['list-artifacts', '--arn', job.arn, '--type', 'FILE'])
        .artifacts || [])
        await save(artifact, jobDir)
    }
  }
  for (const zip of regularFiles(env.LOG_DIR).filter((f) => f.endsWith('Customer_Artifacts.zip'))) {
    try {
      execFileSync('unzip', ['-qo', zip, '-d', zip.replace(/\.zip$/, '_unpacked')])
    } catch {
      console.log(`::warning::could not unzip ${zip}`)
    }
  }
}

async function save(artifact, dir) {
  const wanted = /customer.*artifact|logcat|test.*spec.*output|standard.*output/i.test(
    artifact.name
  )
  if (!artifact.url || !wanted || skipExtensions.includes(artifact.extension)) return
  mkdirSync(dir, { recursive: true })
  const res = await fetch(artifact.url, {
    signal: AbortSignal.timeout(300_000)
  }).catch(() => null)
  if (res?.ok)
    writeFileSync(
      join(dir, `${safe(artifact.name)}.${safe(artifact.extension)}`),
      Buffer.from(await res.arrayBuffer())
    )
}

// Device Farm's own logs are copied as they are; from the zip, which the app under test writes, only the files asked for.
function extract() {
  for (const file of regularFiles(env.LOG_DIR)) {
    const [device, run, ...rest] = relative(env.LOG_DIR, file).split(sep)
    const zipAt = rest.findIndex((seg) => seg.endsWith('Customer_Artifacts_unpacked'))
    const name = rest.at(-1)
    if (zipAt === -1) {
      if (/Logcat\.|test.*spec.*output|standard.*output/i.test(name)) copy(file, device, run, name)
    } else if (patterns.some((p) => matches(p, rest.slice(zipAt + 1)))) {
      copy(file, device, run, name)
    }
  }
}

// A pattern without "/" matches a file name anywhere; with "/" it matches the path's last segments. "*" and "?" glob within a segment.
function matches(pattern, segments) {
  const want = pattern.split('/')
  if (want.length > segments.length) return false
  const tail = segments.slice(-want.length)
  return want.every((p, i) =>
    new RegExp(
      `^${p
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')}$`
    ).test(tail[i])
  )
}

// The first file of a name wins, as one device can hold several copies.
function copy(file, device, run, name) {
  const to = join(env.CONSOLE_DIR, device, `${run}_${name}`)
  if (existsSync(to)) return
  mkdirSync(join(env.CONSOLE_DIR, device), { recursive: true })
  copyFileSync(file, to)
}

// The repo may be public, and runner masking does not reach uploaded files.
function scrub(dir) {
  let changed = 0
  for (const file of regularFiles(dir)) {
    const text = readFileSync(file, 'utf8')
    const out = text.replace(
      /X-Amz-(Signature|Credential|Security-Token)=[^&\s"<>]+/gi,
      (_, k) => `X-Amz-${k}=REDACTED`
    )
    if (out !== text) {
      writeFileSync(file, out)
      changed++
    }
  }
  return changed
}

// Regular files only, inside dir: a symlink in the zip could otherwise point at a runner file, such as the
// process environment holding AWS credentials, and get uploaded with the logs.
function regularFiles(dir) {
  if (!existsSync(dir)) return []
  const root = realpathSync(dir)
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name))
    .filter((file) => realpathSync(file).startsWith(root + sep))
}

function aws(args) {
  try {
    return JSON.parse(
      execFileSync('aws', ['devicefarm', ...args, '--output', 'json'], {
        encoding: 'utf8'
      })
    )
  } catch {
    return {}
  }
}

function safe(s) {
  return String(s)
    .replace(/[ /]/g, '_')
    .replace(/[^A-Za-z0-9_.-]/g, '')
}
