#!/usr/bin/env node
// One Device Farm run per spec and device, each pinned to that device; never the whole pool.

import { appendFileSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const safe = (s) => s.replace(/[^A-Za-z0-9]/g, '_')

// Unique per attempt, so stopping runs by name can never touch another attempt's runs.
export function runNameBase(env, event, appArn) {
  const id = appArn.split('/').pop()
  if (!id) throw new Error('app ARN must end with an upload id')
  const lead = env.GITHUB_EVENT_NAME === 'workflow_dispatch' ? 'Manual' : 'PR'
  const num =
    env.GITHUB_EVENT_NAME === 'workflow_dispatch'
      ? env.GITHUB_RUN_NUMBER
      : event.pull_request?.number || env.GITHUB_RUN_NUMBER
  return `${lead}-${num}-${env.PLATFORM}-${env.GITHUB_RUN_ID}.${env.GITHUB_RUN_ATTEMPT}-${id}`
}

export function plan({ specs, models, operator, platform, base, maxDevices, maxRuns }) {
  if (!Array.isArray(specs) || !specs.length || !specs.every((s) => s.name && s.arn))
    throw new Error('specs must be a non-empty array with name and arn')
  if (!['EQUALS', 'CONTAINS'].includes(operator))
    throw new Error(`device-model-operator must be EQUALS or CONTAINS, got '${operator}'`)
  if (!models.length) throw new Error('no devices to schedule on')
  if (models.length > maxDevices)
    throw new Error(`${models.length} devices, the cap is ${maxDevices}`)
  if (specs.length * models.length > maxRuns)
    throw new Error(`${specs.length} specs x ${models.length} devices exceeds ${maxRuns} runs`)
  if (!['Android', 'iOS'].includes(platform))
    throw new Error(`platform must be Android or iOS, got '${platform}'`)
  const plat = platform === 'Android' ? 'ANDROID' : 'IOS'
  return specs.flatMap((s) =>
    models.map((m) => ({
      name: `${base}-${s.name}-${safe(m)}`,
      spec: s.arn,
      filter: {
        filters: [
          { attribute: 'PLATFORM', operator: 'EQUALS', values: [plat] },
          { attribute: 'MODEL', operator, values: [m] }
        ],
        maxDevices: 1
      }
    }))
  )
}

// A run created part way must be stopped, or it bills until its own timeout.
export function schedule({ runs, project, app, testType, testPackage, timeout, base, aws }) {
  const created = []
  try {
    for (const r of runs) {
      created.push(
        aws([
          'schedule-run',
          '--project-arn',
          project,
          '--app-arn',
          app,
          '--name',
          r.name,
          '--device-selection-configuration',
          JSON.stringify(r.filter),
          // JSON, not shorthand, so no value can add keys of its own.
          '--test',
          JSON.stringify({
            type: testType,
            testPackageArn: testPackage,
            testSpecArn: r.spec
          }),
          '--execution-configuration',
          JSON.stringify({ jobTimeoutMinutes: timeout })
        ]).run.arn
      )
      console.log(`${r.name} -> ${created.at(-1)}`)
    }
    return created
  } catch (e) {
    console.log(`::warning::Scheduling stopped part way; stopping ${created.length} created run(s)`)
    const stop = (arn) => {
      try {
        aws(['stop-run', '--arn', arn])
      } catch {
        console.log(`::warning::could not stop ${arn}`)
      }
    }
    created.forEach(stop)
    // A run created whose ARN never came back is only findable by name.
    try {
      aws(['list-runs', '--arn', project])
        .runs.filter(
          (r) =>
            r.name.startsWith(base) &&
            !['COMPLETED', 'STOPPING'].includes(r.status) &&
            !created.includes(r.arn)
        )
        .forEach((r) => stop(r.arn))
    } catch {}
    throw e
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = process.env
  const count = (name, value) => {
    if (!/^\d+$/.test(value || '')) throw new Error(`${name} '${value}' is not a number`)
    return Number(value)
  }
  if (!/^[A-Z_]+$/.test(env.TEST_TYPE))
    throw new Error(`test-type '${env.TEST_TYPE}' is not a Device Farm test type`)
  const event = env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')) : {}
  const base = runNameBase(env, event, env.APP_ARN)
  const models = [
    ...new Set(
      env.DEVICES.split(',')
        .map((m) => m.trim())
        .filter(Boolean)
    )
  ].sort()
  const runs = plan({
    specs: JSON.parse(env.SPECS),
    models,
    operator: env.OPERATOR || 'CONTAINS',
    platform: env.PLATFORM,
    base,
    maxDevices: count('max-devices', env.MAX_DEVICES),
    maxRuns: count('max-runs', env.MAX_RUNS)
  })
  const arns = schedule({
    runs,
    project: env.PROJECT_ARN,
    app: env.APP_ARN,
    testType: env.TEST_TYPE,
    testPackage: env.TEST_PACKAGE_ARN,
    timeout: count('job-timeout-minutes', env.TIMEOUT),
    base,
    aws: (args) =>
      JSON.parse(
        execFileSync('aws', ['devicefarm', ...args, '--output', 'json'], {
          encoding: 'utf8'
        })
      )
  })
  appendFileSync(env.GITHUB_OUTPUT, `run-arns=${JSON.stringify(arns)}\nrun-count=${arns.length}\n`)
}
