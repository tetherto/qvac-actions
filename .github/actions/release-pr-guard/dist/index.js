const fs = require('fs')
const https = require('https')
const { execSync } = require('child_process')

function getInput(name) {
  const key = `INPUT_${name.replace(/ /g, '_').toUpperCase()}`
  return process.env[key] || ''
}

function parseEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH
  if (!eventPath || !fs.existsSync(eventPath)) return {}
  const payload = JSON.parse(fs.readFileSync(eventPath, 'utf8'))
  return { prNumber: payload.pull_request?.number }
}

function parseVersion(v) {
  const match = v.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) {
    throw new Error(`Invalid semver: ${v}`)
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function isGreater(a, b) {
  const [am, an, ap] = parseVersion(a)
  const [bm, bn, bp] = parseVersion(b)
  if (am !== bm) return am > bm
  if (an !== bn) return an > bn
  return ap > bp
}

function postComment(token, owner, repo, prNumber, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ body })
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: `/repos/${owner}/${repo}/issues/${prNumber}/comments`,
        method: 'POST',
        headers: {
          'User-Agent': 'release-pr-guard',
          Authorization: `token ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve()
          } else {
            reject(
              new Error(`Failed to post PR comment. Status: ${res.statusCode}. Body: ${Buffer.concat(chunks).toString()}`)
            )
          }
        })
      }
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

async function run() {
  const token = getInput('github-token')
  const baseRef = getInput('base-ref')
  const baseSha = getInput('base-sha')
  const headSha = getInput('head-sha')
  const pkgSlug = getInput('package-slug')
  const pkgJsonPath = getInput('package-json-path')
  const changelogPath = getInput('changelog-path')

  const errors = []

  if (!baseRef) {
    errors.push('❌ **Missing base ref**\n`base-ref` input is required for release validation.')
  }

  const match = baseRef.match(/^release-(.+)-(\d+\.\d+\.\d+)$/)
  if (!match) {
    errors.push(
      `❌ **Invalid release branch name**\nExpected: \`release-${pkgSlug}-x.y.z\`\nActual: \`${baseRef}\``
    )
  }

  let branchPkg = ''
  let branchVersion = ''
  if (match) {
    branchPkg = match[1]
    branchVersion = match[2]

    if (branchPkg !== pkgSlug) {
      errors.push(`❌ **Package mismatch**\nBranch targets \`${branchPkg}\`, workflow expects \`${pkgSlug}\``)
    }
  }

  let baseVersion = ''
  let headVersion = ''
  try {
    const basePkg = JSON.parse(execSync(`git show ${baseSha}:${pkgJsonPath}`).toString())
    baseVersion = basePkg.version
  } catch (err) {
    errors.push(`❌ **Unable to read base package.json**\nPath: \`${pkgJsonPath}\``)
  }

  try {
    const headPkg = JSON.parse(execSync(`git show ${headSha}:${pkgJsonPath}`).toString())
    headVersion = headPkg.version
  } catch (err) {
    errors.push(`❌ **Unable to read head package.json**\nPath: \`${pkgJsonPath}\``)
  }

  if (branchVersion && headVersion && branchVersion !== headVersion) {
    errors.push(`❌ **Version mismatch**\nBranch version: \`${branchVersion}\`\npackage.json: \`${headVersion}\``)
  }

  if (baseVersion && headVersion) {
    try {
      if (!isGreater(headVersion, baseVersion)) {
        errors.push(`❌ **Version not incremented**\nBase: \`${baseVersion}\`\nPR: \`${headVersion}\``)
      }
    } catch (err) {
      errors.push(`❌ **Invalid version format**\nBase: \`${baseVersion}\`\nPR: \`${headVersion}\``)
    }
  }

  if (baseSha && headSha) {
    try {
      const changedFiles = execSync(`git diff --name-only ${baseSha} ${headSha}`).toString()
      const changedList = changedFiles.split('\n').filter(Boolean)
      if (!changedList.includes(changelogPath)) {
        errors.push(`❌ **Missing CHANGELOG update**\nFile not modified: \`${changelogPath}\``)
      }
    } catch (err) {
      errors.push(`❌ **Unable to read changed files**\nBase: \`${baseSha}\`\nHead: \`${headSha}\``)
    }
  }

  const repoFull = process.env.GITHUB_REPOSITORY || ''
  const [owner, repo] = repoFull.split('/')
  const { prNumber } = parseEvent()

  if (errors.length && token && owner && repo && prNumber) {
    try {
      await postComment(token, owner, repo, prNumber, `### 🚫 Release PR validation failed\n\n${errors.join('\n\n')}`)
    } catch (err) {
      console.error(`Failed to post PR comment: ${err.message}`)
    }
  }

  if (errors.length) {
    console.error(errors.join('\n\n'))
    process.exit(1)
  }
}

run().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})

