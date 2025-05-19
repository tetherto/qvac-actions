'use strict'

const IPC = require('pear-ipc')
const fs = require('fs/promises')
const path = require('path')
const { exec } = require('child_process')
const util = require('util')
const execAsync = util.promisify(exec)
const mutexify = require('mutexify/promise')
const { spawn } = require('child_process')
const { npmToken, corestoreDir, socketPath } = require('../config')
const logger = require('../logger')

const deployLock = mutexify()
let simpleSeederProcess = null
let sidecarProcess = null
let initialUISeederProcess = null
let initialWorkerSeederProcess = null
let initialUISeedActive = false
let initialWorkerSeedActive = false

/**
 * Stages and seeds the application by connecting to the Pear sidecar.
 *
 * @param {string} directory - The directory containing the app code.
 * @param {string} channel - The channel name (e.g., "main" for production or a branch name).
 * @returns {Promise<{uiPearKey: string, workerPearKey: string}>} - The pear keys for the UI and worker.
 */
async function stageApp (directory, channel) {
  await killPrcoess('sidecar')
  await killPrcoess('simpleSeeder')

  if (initialUISeedActive) {
    killPrcoess('initialUISeeder')
    initialUISeedActive = false
  }

  if (initialWorkerSeedActive) {
    killPrcoess('initialWorkerSeeder')
    initialWorkerSeedActive = false
  }

  sidecarProcess = spawn('pear', ['sidecar'], {
    detached: true,
    stdio: 'ignore'
  })
  sidecarProcess.unref()
  logger.info(`Sidecar process started (PID: ${sidecarProcess.pid})`)

  const client = new IPC.Client({
    socketPath
  })
  await client.ready()

  let workerPearKey = null
  try {
    await execAsync(
      `cd ${directory}/worker && export NPM_TOKEN=${npmToken} && npm i`
    )
  } catch (err) {
    const sanitizedError = err.message.replace(new RegExp(npmToken, 'g'), '[REDACTED]')
    throw new Error(sanitizedError)
  }
  const workerResponse = await client.stage({
    dir: `${directory}/worker`,
    channel
  })
  for await (const chunk of workerResponse) {
    if (chunk.tag === 'addendum') {
      workerPearKey = chunk.data.key
    }
  }
  if (!workerPearKey) {
    throw new Error('Pear key not found during worker staging')
  }
  logger.info(`Staged worker successfully: ${workerPearKey}`)

  initialWorkerSeederProcess = spawn('pear', ['seed', channel, `${directory}/worker`], {
    detached: true
    // stdio: 'ignore'
  })
  initialWorkerSeederProcess.unref()
  logger.info(`Initial worker seeder process started (PID: ${initialWorkerSeederProcess.pid})`)

  initialWorkerSeederProcess.stdout.on('data', (data) => {
    // logger.info(`Initial worker seeder stdout: ${data}`)
    const announced = /announced/i.test(data)
    if (announced) {
      // logger.info('Seeded worker successfully, setting initialWorkerSeedActive to true')
      initialWorkerSeedActive = true
    }
  })
  initialWorkerSeederProcess.stderr.on('data', (data) => {
    logger.error(`Initial wroker seeder stderr: ${data}`)
  })
  initialWorkerSeederProcess.on('error', (err) => {
    logger.error('Initial worker seeder error:', err)
  })

  const packageJsonPath = path.join(directory, 'ui', 'package.json')
  const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8')
  const packageJson = JSON.parse(packageJsonContent)

  if (!packageJson.pear || !packageJson.pear.links) {
    throw new Error('Missing pear or pear.links object in package.json')
  }
  packageJson.pear.links.worker = `pear://${workerPearKey}`

  await fs.writeFile(
    packageJsonPath,
    JSON.stringify(packageJson, null, 2),
    'utf8'
  )
  // logger.info('Updated UI package.json with worker key')

  let uiPearKey = null
  try {
    await execAsync(
      `cd ${directory}/ui && export NPM_TOKEN=${npmToken} && npm i`
    )
  } catch (err) {
    const sanitizedError = err.message.replace(new RegExp(npmToken, 'g'), '[REDACTED]')
    throw new Error(sanitizedError)
  }
  const uiResponse = await client.stage({
    dir: `${directory}/ui`,
    channel
  })
  for await (const chunk of uiResponse) {
    if (chunk.tag === 'addendum') {
      uiPearKey = chunk.data.key
    }
  }
  if (!uiPearKey) {
    throw new Error('Pear key not found in UI stage output')
  }
  logger.info(`Staged UI successfully: ${uiPearKey}`)

  initialUISeederProcess = spawn('pear', ['seed', channel, `${directory}/ui`], {
    detached: true
    // stdio: 'ignore'
  })
  initialUISeederProcess.unref()
  logger.info(`Initial UI seeder process started (PID: ${initialUISeederProcess.pid})`)

  initialUISeederProcess.stdout.on('data', (data) => {
    // logger.info(`Initial UI seeder stdout: ${data}`)
    const announced = /announced/i.test(data)
    if (announced) {
      // logger.info('Seeded UI successfully, setting initialUISeedActive to true')
      initialUISeedActive = true
    }
  })
  initialUISeederProcess.stderr.on('data', (data) => {
    logger.error(`Initial UI seeder stderr: ${data}`)
  })
  initialUISeederProcess.on('error', (err) => {
    logger.error('Initial UI seeder error:', err)
  })
  return {
    uiPearKey,
    workerPearKey
  }
}

/**
 * Seeds the pear keys in the autobase using the simple-seeder.
 * @param {string} pearKeysHb - The Hyperbee key for the pear keys.
 * @param {string | undefined} uiPearKey - The pear key for the UI.
 * @param {string | undefined} workerPearKey - The pear key for the worker.
 */
async function runBackgroundSeeding (pearKeysHb, uiPearKey, workerPearKey) {
  const release = await deployLock()
  try {
    if (uiPearKey || workerPearKey) {
      logger.info('Waiting for initial seeders to complete before starting simple-seeder')
      let waited = 0
      const timeout = 60000
      const interval = 500
      while (((uiPearKey && !initialUISeedActive) || (workerPearKey && !initialWorkerSeedActive)) && waited < timeout) {
        await new Promise(resolve => setTimeout(resolve, interval))
        waited += interval
      }
    }

    await killPrcoess('simpleSeeder')
    logger.info('Starting simple-seeder to seed pear keys in autobase')
    simpleSeederProcess = spawn('simple-seeder', ['--storage', corestoreDir, pearKeysHb], {
      detached: true
      // stdio: 'ignore'
    })
    simpleSeederProcess.unref()

    simpleSeederProcess.stdout.on('data', (data) => {
      logger.info(`Simple-Seeder stdout: ${data}`)
    })
    simpleSeederProcess.stderr.on('data', (data) => {
      logger.error(`Simple-Seeder stderr: ${data}`)
    })
    simpleSeederProcess.on('error', (err) => {
      logger.error('Simple-Seeder error:', err)
    })
    simpleSeederProcess.on('exit', (code) => {
      logger.info(`Simple-Seeder process exited with code ${code}`)
    })

    logger.info(`Simple-Seeder process started (PID: ${simpleSeederProcess.pid})`)
  } catch (err) {
    logger.error('Background seeding error:', err)
  } finally {
    release()
  }
}

/**
 * Kills the simple-seeder process if it is running.
 */
async function killPrcoess (processName) {
  let processInstance = null
  switch (processName) {
    case 'simpleSeeder':
      processInstance = simpleSeederProcess
      break
    case 'sidecar':
      processInstance = sidecarProcess
      break
    case 'initialUISeeder':
      processInstance = initialUISeederProcess
      break
    case 'initialWorkerSeeder':
      processInstance = initialWorkerSeederProcess
      break
    default:
      logger.info(`Invalid process kill requested: ${processName}`)
      return
  }

  if (processInstance && processInstance.pid) {
    try {
      process.kill(processInstance.pid, 0)
      logger.info(`Killing ${processName} process (PID: ${processInstance.pid})`)
      processInstance.kill()

      await new Promise((resolve) => {
        processInstance.on('exit', resolve)
        processInstance.on('close', resolve)
      })
    } catch (err) {
      if (err.code === 'ESRCH') {
        logger.info(`${processName} process is already dead`)
      } else {
        logger.error(`Error trying to kill ${processName} process:`, err)
      }
      processInstance = null
    }
  }
}

module.exports = { stageApp, runBackgroundSeeding, killPrcoess }
