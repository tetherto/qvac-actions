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
  try {
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
    console.log(`Sidecar process started (PID: ${sidecarProcess.pid})`)

    const client = new IPC.Client({
      socketPath
    })
    await client.ready()

    let workerPearKey = null
    await execAsync(
      `cd ${directory}/worker && export NPM_TOKEN=${npmToken} && npm i`
    )
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
    console.log(`Staged worker successfully: ${workerPearKey}`)

    initialWorkerSeederProcess = spawn('pear', ['seed', channel, `${directory}/worker`], {
      detached: true
      // stdio: 'ignore'
    })
    initialWorkerSeederProcess.unref()
    console.log(`Initial worker seeder process started (PID: ${initialWorkerSeederProcess.pid})`)

    initialWorkerSeederProcess.stdout.on('data', (data) => {
      console.log(`Initial worker seeder stdout: ${data}`)
      const announced = /announced/i.test(data)
      if (announced) {
        console.log('Seeded worker successfully, setting initialWorkerSeedActive to true')
        initialWorkerSeedActive = true
      }
    })
    initialWorkerSeederProcess.stderr.on('data', (data) => {
      console.error(`Initial wroker seeder stderr: ${data}`)
    })
    initialWorkerSeederProcess.on('error', (err) => {
      console.error('Initial worker seeder error:', err)
    })

    const packageJsonPath = path.join(directory, 'ui', 'package.json')
    const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8')
    const packageJson = JSON.parse(packageJsonContent)

    if (!packageJson.pear || !packageJson.pear.links) {
      throw new Error('Missing pear or pear.links object in package.json')
    }
    packageJson.pear.links.worker = workerPearKey

    await fs.writeFile(
      packageJsonPath,
      JSON.stringify(packageJson, null, 2),
      'utf8'
    )
    console.log('Updated UI package.json with worker key')

    let uiPearKey = null
    await execAsync(
      `cd ${directory}/ui && export NPM_TOKEN=${npmToken} && npm i`
    )
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
    console.log(`Staged UI successfully: ${uiPearKey}`)

    initialUISeederProcess = spawn('pear', ['seed', channel, `${directory}/ui`], {
      detached: true
      // stdio: 'ignore'
    })
    initialUISeederProcess.unref()
    console.log(`Initial UI seeder process started (PID: ${initialUISeederProcess.pid})`)

    initialUISeederProcess.stdout.on('data', (data) => {
      console.log(`Initial UI seeder stdout: ${data}`)
      const announced = /announced/i.test(data)
      if (announced) {
        console.log('Seeded UI successfully, setting initialUISeedActive to true')
        initialUISeedActive = true
      }
    })
    initialUISeederProcess.stderr.on('data', (data) => {
      console.error(`Initial UI seeder stderr: ${data}`)
    })
    initialUISeederProcess.on('error', (err) => {
      console.error('Initial UI seeder error:', err)
    })
    return {
      uiPearKey,
      workerPearKey
    }
  } catch (error) {
    console.error('Error in stageAndSeed:', error)
    throw error
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
      console.log('Waiting for initial seeders to finish before starting simple-seeder')
      let waited = 0
      const timeout = 60000
      const interval = 500
      while (((uiPearKey && !initialUISeedActive) || (workerPearKey && !initialWorkerSeedActive)) && waited < timeout) {
        await new Promise(resolve => setTimeout(resolve, interval))
        waited += interval
      }
    }

    await killPrcoess('simpleSeeder')
    console.log('Starting simple-seeder to seed pear keys in autobase')
    simpleSeederProcess = spawn('simple-seeder', ['--storage', corestoreDir, pearKeysHb], {
      detached: true
      // stdio: 'ignore'
    })
    simpleSeederProcess.unref()

    simpleSeederProcess.stdout.on('data', (data) => {
      console.log(`Simple-Seeder stdout: ${data}`)
    })
    simpleSeederProcess.stderr.on('data', (data) => {
      console.error(`Simple-Seeder stderr: ${data}`)
    })
    simpleSeederProcess.on('error', (err) => {
      console.error('Simple-Seeder error:', err)
    })
    simpleSeederProcess.on('exit', (code) => {
      console.log(`Simple-Seeder process exited with code ${code}`)
    })

    console.log(`Simple-Seeder process started (PID: ${simpleSeederProcess.pid})`)
  } catch (err) {
    console.error('Background seeding error:', err)
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
      console.log(`Invalid process kill requested: ${processName}`)
      return
  }

  if (processInstance && processInstance.pid) {
    try {
      process.kill(processInstance.pid, 0)
      console.log(`Killing ${processName} process (PID: ${processInstance.pid})`)
      processInstance.kill()

      await new Promise((resolve) => {
        processInstance.on('exit', resolve)
        processInstance.on('close', resolve)
      })
    } catch (err) {
      if (err.code === 'ESRCH') {
        console.log(`${processName} process is already dead`)
      } else {
        console.error(`Error trying to kill ${processName} process:`, err)
      }
      processInstance = null
    }
  }
}

module.exports = { stageApp, runBackgroundSeeding, killPrcoess }
