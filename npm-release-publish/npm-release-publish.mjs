#!/usr/bin/env node
// Gate, idempotency check and publish in one place; a re-run never publishes over an existing version.

import { appendFileSync, readFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { join } from 'node:path'

const env = process.env
if (!/^[A-Za-z][A-Za-z0-9._-]*$/.test(env.TAG || ''))
  throw new Error(`tag '${env.TAG}' is not a dist-tag`)
if (!['public', 'restricted'].includes(env.ACCESS))
  throw new Error(`access must be public or restricted, got '${env.ACCESS}'`)
if (!env.RELEASE_REF_PREFIX?.startsWith('refs/'))
  throw new Error(`release-ref-prefix '${env.RELEASE_REF_PREFIX}' is not a ref prefix`)
const skipTags = (env.SKIP_TAGS || '').split(/\s+/).filter(Boolean)

const { name, version } = JSON.parse(readFileSync(join(env.WORKDIR, 'package.json'), 'utf8'))
let published = ''
if (skipTags.includes(env.TAG)) {
  console.log(`Skipping npm publish: ${env.TAG} never goes to npm`)
} else if (!env.GITHUB_REF.startsWith(env.RELEASE_REF_PREFIX)) {
  throw new Error(`npm publishes from ${env.RELEASE_REF_PREFIX}* only, got ${env.GITHUB_REF}`)
} else if (
  alreadyPublished(
    spawnSync('npm', ['view', name, 'versions', '--json'], {
      encoding: 'utf8'
    })
  )
) {
  console.log(`Skipping npm publish: ${name}@${version} is already on npm`)
} else {
  const provenance = env.ACCESS === 'public' ? ['--provenance'] : []
  execFileSync('npm', ['publish', '--tag', env.TAG, '--access', env.ACCESS, ...provenance], {
    cwd: env.WORKDIR,
    stdio: 'inherit'
  })
  published = version
  console.log(`::notice title=npm published::${name}@${version} (${env.TAG})`)
}
appendFileSync(env.GITHUB_OUTPUT, `version=${published}\n`)

// `npm view <pkg> versions --json` is an array, a bare string for one version, or an E404 for none.
function alreadyPublished({ status, stdout }) {
  if (status !== 0) {
    let code
    try {
      code = JSON.parse(stdout).error?.code
    } catch {}
    if (code === 'E404') return false
    throw new Error(`npm view failed (exit ${status}); re-run after the registry recovers`)
  }
  return [JSON.parse(stdout || '[]')].flat().includes(version)
}
