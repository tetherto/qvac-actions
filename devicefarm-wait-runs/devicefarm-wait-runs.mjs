#!/usr/bin/env node
// Waits for Device Farm runs to finish, then reports per device and fails on any failed device.

import { appendFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

// arn:aws:devicefarm:<region>:<account>:run:<project>/<run>[/<job>]
export const consoleLink = (arn) => {
  const parts = arn.split(':')
  const [project, run, job] = parts.pop().split('/')
  return `https://${parts[3]}.console.aws.amazon.com/devicefarm/home#/mobile/projects/${project}/runs/${run}${job ? `/jobs/${job}` : ''}`
}

// Runs are scheduled spec-major with a fixed number per spec.
export const specFor = (i, runCount, specs) =>
  specs[
    specs.length && runCount % specs.length === 0 ? Math.floor(i / (runCount / specs.length)) : i
  ]

export async function wait({ arns, aws, sleep, maxWait, poll, log = console.log }) {
  const prev = arns.map(() => '')
  const runningAt = arns.map(() => null)
  const done = new Set()
  for (let t = 0; ; t += poll) {
    for (const [i, arn] of arns.entries()) {
      if (done.has(i)) continue
      const run = (await aws(['get-run', '--arn', arn]).catch(() => ({}))).run || {}
      const status = run.status || 'UNKNOWN'
      if (status === 'RUNNING' && runningAt[i] === null) {
        runningAt[i] = t
        if (prev[i])
          log(
            `::notice title=Device Farm run ${i + 1} acquired device::${prev[i]} -> RUNNING after ${t}s queued`
          )
      }
      if (status === 'COMPLETED') {
        done.add(i)
        log(
          `::notice title=Device Farm run ${i + 1} finished::result=${run.result} | queued ${runningAt[i] ?? '?'}s | total ${t}s`
        )
      } else if (status !== prev[i])
        log(`Run ${i + 1}: ${prev[i] || 'attached at'} -> ${status} (${t}s)`)
      prev[i] = status
    }
    if (done.size === arns.length) return
    // A line every three minutes, so a long RUNNING stretch never looks like a hang.
    if (t && t % 180 < poll)
      log(
        `${t}s: ${arns.map((_, i) => `run ${i + 1} ${done.has(i) ? 'COMPLETED' : prev[i] || 'UNKNOWN'}`).join(', ')}`
      )
    if (t >= maxWait) throw new Error(`Device Farm runs still going after ${maxWait}s`)
    await sleep()
  }
}

// STOPPED counts only the tests that ran, so it passes only when the caller accepts a device stopped by Device
// Farm's timeout after every counted test passed.
export function judge(job, acceptStopped = false) {
  const c = job.counters || {}
  if (['PASSED', 'WARNED'].includes(job.result)) return true
  return acceptStopped && job.result === 'STOPPED' && !c.failed && !c.errored && c.passed > 0
}

export async function report({ arns, aws, specs, acceptStopped = false }) {
  const r = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    devicesPassed: 0,
    devicesFailed: 0,
    allRunsPassed: true,
    failures: []
  }
  for (const [i, arn] of arns.entries()) {
    const run = (await aws(['get-run', '--arn', arn]).catch(() => ({}))).run || {}
    if (!['PASSED', 'SKIPPED'].includes(run.result)) r.allRunsPassed = false
    for (const k of ['total', 'passed', 'failed', 'skipped']) r[k] += run.counters?.[k] || 0
    const spec = specFor(i, arns.length, specs)
    console.log(
      `--- Run ${i + 1}: ${run.name || arn} (${run.result || 'UNKNOWN'})${spec ? ` [${spec.tests || spec.grep || spec.name}]` : ''}`
    )
    const jobs = (await aws(['list-jobs', '--arn', arn]).catch(() => ({ jobs: [] }))).jobs || []
    // A run that lists no jobs is judged by its own result, so a failed one still counts.
    if (!jobs.length && !['PASSED', 'SKIPPED'].includes(run.result)) {
      r.devicesFailed++
      r.failures.push(
        `${run.name || arn}: ${run.result || 'UNKNOWN'} with no jobs listed ${consoleLink(arn)}`
      )
    }
    for (const job of jobs) {
      const c = job.counters || {}
      const ok = judge(job, acceptStopped)
      console.log(
        `  ${ok ? 'PASS' : 'FAIL'} ${job.device?.name || 'unknown device'}: ${job.result} (${c.passed || 0}/${c.total || 0} passed, ${c.failed || 0} failed, ${c.errored || 0} errored)`
      )
      if (ok) r.devicesPassed++
      else {
        r.devicesFailed++
        r.failures.push(
          `${job.device?.name || 'unknown device'}: ${job.result} ${consoleLink(job.arn)}`
        )
      }
    }
  }
  r.result = r.devicesFailed === 0 && r.devicesPassed > 0 ? 'PASSED' : 'FAILED'
  return r
}

export function summary(r, arns) {
  const icon = r.devicesFailed ? ':x:' : r.devicesPassed ? ':white_check_mark:' : ':warning:'
  return [
    `### ${icon} Device Farm test results`,
    '',
    '| Metric | Count |',
    '| --- | --- |',
    `| Devices passed | ${r.devicesPassed} |`,
    `| Devices failed | ${r.devicesFailed} |`,
    `| Test cases total | ${r.total} |`,
    `| Test cases passed | ${r.passed} |`,
    `| Test cases failed | ${r.failed} |`,
    `| Test cases skipped | ${r.skipped} |`,
    '',
    ...r.failures.map((f) => `- ${f}`),
    ...arns.map((a, i) => `- [Device Farm run ${i + 1}](${consoleLink(a)})`),
    ''
  ].join('\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = process.env
  const arns = JSON.parse(env.RUN_ARNS || '[]')
  if (!arns.length) throw new Error('no run ARNs to wait for')
  if (!arns.every((a) => /^arn:aws[\w-]*:devicefarm:[a-z0-9-]+:\d+:run:[\w-]+\/[\w-]+$/.test(a)))
    throw new Error('run-arns must be Device Farm run ARNs')
  if (!['true', 'false'].includes(env.ACCEPT_STOPPED))
    throw new Error(`accept-stopped '${env.ACCEPT_STOPPED}' is not true or false`)
  for (const [name, value] of [
    ['max-wait-seconds', env.MAX_WAIT],
    ['poll-seconds', env.POLL]
  ])
    if (!/^[1-9]\d*$/.test(value || ''))
      throw new Error(`${name} '${value}' is not a positive number`)
  const once = (args) =>
    JSON.parse(
      execFileSync('aws', ['devicefarm', ...args, '--output', 'json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      })
    )
  const sleep = (s) => new Promise((ok) => setTimeout(ok, s * 1000))
  const aws = async (args) => {
    for (let i = 1; ; i++) {
      try {
        return once(args)
      } catch (e) {
        if (i === 3) throw e
        await sleep(5)
      }
    }
  }
  await wait({
    arns,
    aws,
    sleep: () => sleep(Number(env.POLL)),
    maxWait: Number(env.MAX_WAIT),
    poll: Number(env.POLL)
  })
  const r = await report({
    arns,
    aws,
    specs: JSON.parse(env.SPECS || '[]'),
    acceptStopped: env.ACCEPT_STOPPED === 'true'
  })
  appendFileSync(
    env.GITHUB_OUTPUT,
    Object.entries({
      'test-result': r.result,
      'test-total': r.total,
      'test-passed': r.passed,
      'test-failed': r.failed,
      'test-skipped': r.skipped,
      'devices-passed': r.devicesPassed,
      'devices-failed': r.devicesFailed
    })
      .map(([k, v]) => `${k}=${v}\n`)
      .join('')
  )
  appendFileSync(env.GITHUB_STEP_SUMMARY, summary(r, arns))
  if (r.result !== 'PASSED') process.exit(1)
}
