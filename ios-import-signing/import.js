// Imports a signing certificate into a throwaway keychain and installs the provisioning profile.
// cleanup.js undoes all of it after the job, so nothing outlives the job on a self-hosted Mac.

const { appendFileSync, copyFileSync, mkdirSync, rmSync, writeFileSync } = require('node:fs')
const { execFileSync } = require('node:child_process')
const { randomBytes } = require('node:crypto')
const { homedir } = require('node:os')
const { join } = require('node:path')

const input = (name) => (process.env[`INPUT_${name.toUpperCase()}`] || '').trim()
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] })
const save = (key, value) => appendFileSync(process.env.GITHUB_STATE, `${key}=${value}\n`)

const bundleId = input('bundle-id')
if (!/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(bundleId))
  throw new Error(`bundle-id '${bundleId}' is not a bundle id`)

const tmp = process.env.RUNNER_TEMP
const id = randomBytes(8).toString('hex')
const cert = join(tmp, `signing-${id}.p12`)
const pp = join(tmp, `signing-${id}.mobileprovision`)
const plist = join(tmp, `signing-${id}.plist`)
const keychain = join(tmp, `signing-${id}.keychain-db`)
// Nobody needs this password after the job, so it never leaves the action.
const password = randomBytes(24).toString('hex')
console.log(`::add-mask::${password}`)

// Everything cleanup.js must undo, recorded before it is created.
const searchList = keychainsInSearchList()
save('search-list', JSON.stringify(searchList))
save('keychain', keychain)
save('files', JSON.stringify([cert, pp, plist]))

writeFileSync(cert, Buffer.from(input('certificate-base64'), 'base64'), {
  mode: 0o600
})
writeFileSync(pp, Buffer.from(input('profile-base64'), 'base64'), {
  mode: 0o600
})

run('security', ['create-keychain', '-p', password, keychain])
run('security', ['set-keychain-settings', '-lut', '21600', keychain])
run('security', ['unlock-keychain', '-p', password, keychain])
// -T, not -A: only codesign may use the key without a prompt.
run('security', [
  'import',
  cert,
  '-P',
  input('certificate-password'),
  '-T',
  '/usr/bin/codesign',
  '-t',
  'cert',
  '-f',
  'pkcs12',
  '-k',
  keychain
])
run('security', [
  'set-key-partition-list',
  '-S',
  'apple-tool:,apple:',
  '-s',
  '-k',
  password,
  keychain
])
run('security', ['list-keychains', '-d', 'user', '-s', keychain, ...searchList])
rmSync(cert, { force: true })

writeFileSync(plist, execFileSync('security', ['cms', '-D', '-i', pp]))
const profile = readProfile(plist)
if (!/^[0-9A-Fa-f-]{36}$/.test(profile.uuid))
  throw new Error('the provisioning profile has no UUID')
if (profile.bundleId !== bundleId)
  throw new Error(`provisioning profile is for '${profile.bundleId}', not '${bundleId}'`)

const profiles = join(homedir(), 'Library/MobileDevice/Provisioning Profiles')
const installed = join(profiles, `${profile.uuid}.mobileprovision`)
save('profile', installed)
mkdirSync(profiles, { recursive: true })
copyFileSync(pp, installed)

run('security', ['find-identity', '-p', 'codesigning', '-v', keychain])
appendFileSync(
  process.env.GITHUB_OUTPUT,
  `profile-uuid=${profile.uuid}\nexport-method=${profile.exportMethod}\n`
)
console.log(`Provisioning profile ${profile.uuid} (export method ${profile.exportMethod})`)

// Only the keys needed: a profile carries <data> and <date> fields that do not convert to JSON.
function readProfile(file) {
  const get = (key) => {
    try {
      return execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print ${key}`, file], {
        stdio: ['ignore', 'pipe', 'ignore']
      })
        .toString()
        .trim()
    } catch {
      return null
    }
  }
  // application-identifier is <team id>.<bundle id>.
  const appId = get(':Entitlements:application-identifier') || ''
  let exportMethod = 'ad-hoc'
  if (get(':ProvisionsAllDevices') === 'true') exportMethod = 'enterprise'
  else if (get(':ProvisionedDevices') === null) exportMethod = 'app-store'
  else if (get(':Entitlements:get-task-allow') === 'true') exportMethod = 'development'
  return {
    uuid: get(':UUID') || '',
    bundleId: appId.slice(appId.indexOf('.') + 1),
    exportMethod
  }
}

function keychainsInSearchList() {
  return execFileSync('security', ['list-keychains', '-d', 'user'], {
    encoding: 'utf8'
  })
    .split('\n')
    .map((line) => line.trim().replace(/^"|"$/g, ''))
    .filter(Boolean)
}
