#!/usr/bin/env node
// Uploads files to a Device Farm project and waits until each is usable.

import { appendFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { basename } from 'node:path'
import { pathToFileURL } from 'node:url'

// A JSON array of objects with a `file` keeps its other fields; anything else is one path.
export function parseFiles(input, name) {
  const text = String(input).trim()
  if (text.startsWith('[')) return JSON.parse(text)
  return [{ file: text, uploadName: name || basename(text) }]
}

export async function uploadAll({ items, project, type, aws, put, sleep, attempts }) {
  const out = []
  for (const item of items) {
    const { upload } = aws([
      'create-upload',
      '--project-arn',
      project,
      '--name',
      item.uploadName || basename(item.file),
      '--type',
      type
    ])
    put(item.file, upload.url)
    let status = ''
    for (let i = 1; i <= attempts && status !== 'SUCCEEDED'; i++) {
      status = aws(['get-upload', '--arn', upload.arn]).upload.status
      if (status === 'FAILED') throw new Error(`${item.file}: Device Farm rejected the upload`)
      if (status !== 'SUCCEEDED') await sleep()
    }
    // An upload left INITIALIZED surfaces later as an invalid ARN at scheduling.
    if (status !== 'SUCCEEDED')
      throw new Error(`${item.file}: upload never reached SUCCEEDED (last ${status})`)
    out.push({ ...item, arn: upload.arn })
  }
  return out
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = process.env
  if (!/^[A-Z_]+$/.test(env.TYPE))
    throw new Error(`type '${env.TYPE}' is not a Device Farm upload type`)
  if (!/^arn:aws[\w-]*:devicefarm:/.test(env.PROJECT_ARN))
    throw new Error('project-arn is not a Device Farm ARN')
  if (!/^\d+$/.test(env.MAX_WAIT))
    throw new Error(`max-wait-seconds '${env.MAX_WAIT}' is not a number`)
  const uploads = await uploadAll({
    items: parseFiles(env.FILES, env.NAME),
    project: env.PROJECT_ARN,
    type: env.TYPE,
    aws: (args) =>
      JSON.parse(
        execFileSync('aws', ['devicefarm', ...args, '--output', 'json'], {
          encoding: 'utf8'
        })
      ),
    put: (file, url) =>
      execFileSync(
        'curl',
        [
          '--fail',
          '--retry',
          '5',
          '--retry-all-errors',
          '--retry-delay',
          '15',
          '--max-time',
          '1800',
          '-sS',
          '-T',
          file,
          url
        ],
        { stdio: 'inherit' }
      ),
    sleep: () => new Promise((r) => setTimeout(r, 10_000)),
    attempts: Math.max(1, Math.ceil(Number(env.MAX_WAIT) / 10))
  })
  for (const u of uploads) console.log(`${basename(u.file)} -> ${u.arn}`)
  appendFileSync(env.GITHUB_OUTPUT, `arn=${uploads[0].arn}\nuploads=${JSON.stringify(uploads)}\n`)
}
