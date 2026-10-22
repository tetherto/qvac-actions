#!/usr/bin/env node
// Hosted runners get an Xcode selected and the requested tools installed; self-hosted Macs must already have them.

import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const env = process.env
const words = (s) => (s || '').split(/\s+/).filter(Boolean)

const versions = words(env.XCODE_VERSIONS)
if (!versions.length) throw new Error('xcode-versions is empty')
for (const v of versions)
  if (!/^\d+(\.\d+){0,2}$/.test(v)) throw new Error(`'${v}' is not an Xcode version`)
const formulae = words(env.BREW_PACKAGES)
for (const f of formulae)
  if (!/^[a-z0-9][a-z0-9@+._/-]*$/.test(f)) throw new Error(`'${f}' is not a Homebrew formula`)
const gems = words(env.GEMS).map((g) => g.split(':'))
for (const [name, version, extra] of gems) {
  if (
    extra !== undefined ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) ||
    (version !== undefined && !/^[0-9][0-9A-Za-z.]*$/.test(version))
  )
    throw new Error(`'${[name, version].join(':')}' is not a gem name or name:version`)
}

if (env.RUNNER_ENVIRONMENT === 'github-hosted') {
  run('sudo', ['xcode-select', '-s', pickXcode(versions)])
  if (formulae.length) run('brew', ['install', ...formulae])
  for (const [name, version] of gems)
    run('sudo', ['gem', 'install', name, ...(version ? ['-v', version] : [])])
}

for (const tool of words(env.REQUIRE_TOOLS)) {
  if (!onPath(tool)) throw new Error(`${tool} is not on PATH; self-hosted Macs must ship it`)
}
if (env.SDK) {
  const sdks = execFileSync('xcodebuild', ['-showsdks'], { encoding: 'utf8' })
  if (!sdks.toLowerCase().includes(env.SDK.toLowerCase()))
    throw new Error(`xcodebuild lists no ${env.SDK} SDK`)
}
run('xcodebuild', ['-version'])

// Images name an Xcode both Xcode_16.1.app and Xcode_16.1.0.app.
function pickXcode(wanted) {
  const candidates = wanted.flatMap((v) => [
    `/Applications/Xcode_${v}.app`,
    ...(v.split('.').length === 2 ? [`/Applications/Xcode_${v}.0.app`] : [])
  ])
  const found = candidates.find(existsSync)
  if (!found) throw new Error(`none of Xcode ${wanted.join(', ')} is on this runner`)
  return found
}

function onPath(tool) {
  try {
    execFileSync('which', [tool], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: 'inherit' })
}
