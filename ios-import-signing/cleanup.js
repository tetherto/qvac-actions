// Post step: takes its keychain off the search list and deletes the keychain, profile and key files import.js made.
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

// Drops only this job's keychain from the list as it is now, so another job's keychain added meanwhile stays.
if (state('keychain')) {
  attempt('remove signing keychain from the search list', () => {
    const current = execFileSync('security', ['list-keychains', '-d', 'user'], { encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim().replace(/^"|"$/g, ''))
      .filter((k) => k && k !== state('keychain'))
    execFileSync('security', ['list-keychains', '-d', 'user', '-s', ...current])
  })
}
if (state('keychain'))
  attempt('delete signing keychain', () =>
    execFileSync('security', ['delete-keychain', state('keychain')])
  )
if (state('profile'))
  attempt('remove provisioning profile', () => rmSync(state('profile'), { force: true }))
for (const file of JSON.parse(state('files') || '[]'))
  attempt(`remove ${file}`, () => rmSync(file, { force: true }))
