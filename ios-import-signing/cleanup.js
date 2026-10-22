// Post step: restores the keychain search list and deletes the keychain, profile and key files import.js made.
// Each step runs even if an earlier one fails, and none fails the job.

const { rmSync } = require('node:fs')
const { execFileSync } = require('node:child_process')

const state = (key) => process.env[`STATE_${key}`] || ''
const attempt = (what, fn) => {
  try {
    fn()
    console.log(`${what}: done`)
  } catch (e) {
    console.log(`::warning::${what} failed: ${e.message}`)
  }
}

if (state('search-list')) {
  attempt('restore keychain search list', () =>
    execFileSync('security', [
      'list-keychains',
      '-d',
      'user',
      '-s',
      ...JSON.parse(state('search-list'))
    ])
  )
}
if (state('keychain'))
  attempt('delete signing keychain', () =>
    execFileSync('security', ['delete-keychain', state('keychain')])
  )
if (state('profile'))
  attempt('remove provisioning profile', () => rmSync(state('profile'), { force: true }))
for (const file of JSON.parse(state('files') || '[]'))
  attempt(`remove ${file}`, () => rmSync(file, { force: true }))
