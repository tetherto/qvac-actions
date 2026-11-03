#!/usr/bin/env node
// Stops Device Farm runs still in flight, so a cancelled job stops billing device minutes.

import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

// Any other status, an unreadable one included, gets a stop-run; on a run that has just finished it only fails.
const DONE = ['COMPLETED', 'STOPPING']

export function cancel(arns, aws) {
  const tally = { stopped: 0, finished: 0, failed: 0 }
  for (const arn of arns) {
    let status = 'UNKNOWN'
    try {
      status = aws(['get-run', '--arn', arn]).run.status
    } catch {}
    if (DONE.includes(status)) {
      tally.finished++
      continue
    }
    try {
      aws(['stop-run', '--arn', arn])
      tally.stopped++
    } catch {
      tally.failed++
    }
    console.log(`${arn}: ${status}`)
  }
  return tally
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const t = cancel(JSON.parse(process.env.RUN_ARNS || '[]'), (args) =>
    JSON.parse(
      execFileSync('aws', ['devicefarm', ...args, '--output', 'json'], {
        encoding: 'utf8'
      })
    )
  )
  console.log(
    `${t.stopped} stopped, ${t.finished} already finished, ${t.failed} could not be stopped`
  )
}
