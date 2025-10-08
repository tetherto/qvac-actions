'use strict'

const fs = require('fs')
const Hyperdrive = require('hyperdrive')
const Localdrive = require('localdrive')
const path = require('path')
const debounce = require('debounceify')
const logger = require('./logger')
const Hyperswarm = require('hyperswarm')
const { getCorestoreInstance } = require('./store')

/**
 * Copy license files to the model directory
 * @param {string[]} licenses - Array of license names
 * @param {string} modelDirectory - Target model directory
 */
async function copyLicenseFiles (licenses, modelDirectory) {
  if (!licenses || licenses.length === 0) {
    throw new Error('At least one license must be specified for the model')
  }

  for (const license of licenses) {
    const licenseFile = path.join(__dirname, 'license', license, 'LICENSE.txt')
    const destFile = path.join(modelDirectory, `LICENSE-${license}.txt`)

    try {
      await fs.promises.copyFile(licenseFile, destFile)
      logger.info(`Copied license file: ${license} -> ${destFile}`)
    } catch (error) {
      logger.error(`Failed to copy license file ${license}: ${error.message}`)
      throw error
    }
  }
}

/**
 * Get the version of a Hyperdrive without downloading its contents.
 * @param {string} modelKey - Model key for namespacing
 * @param {string} driveKey - The hex-encoded drive key
 * @returns {Promise<number>} The drive version
 */
async function getDriveVersion (modelKey, driveKey) {
  const store = await getCorestoreInstance()
  const nsStore = store.namespace(modelKey)
  const drive = new Hyperdrive(nsStore, Buffer.from(driveKey, 'hex'))
  await drive.ready()

  const swarm = new Hyperswarm()
  swarm.on('connection', (connection) => {
    console.log('🤝 Connected to peer for hyperdrive')
    nsStore.replicate(connection)
  })
  swarm.join(drive.discoveryKey, { server: false, client: true })
  await swarm.flush()
  nsStore.findingPeers()

  try {
    const version = drive.version
    logger.info(`Model ${modelKey} drive version: ${version}`)
    return version
  } finally {
    await drive.close()
    await swarm.destroy()
    await nsStore.close()
  }
}

/**
 * Syncs a Hyperdrive for a model. If the drive already exists, it will be updated. If the drive does not exist, it will be created.
 * @param {Corestore} store - Corestore instance
 * @param {string} modelKey - Model key
 * @param {string} modelPath - Path to the model folder
 * @returns {Promise<Hyperdrive>} Hyperdrive instance
 */
async function syncDrive (store, modelKey, modelPath) {
  const nsStore = store.namespace(modelKey)
  const drive = new Hyperdrive(nsStore)
  await drive.ready()

  await loadDriveFolder(drive, modelPath)
  await new Promise(resolve => setTimeout(resolve, 1000))
  return drive
}

/**
 * Load local folder contents into Hyperdrive
 * @param {Object} drive - Hyperdrive instance
 * @param {string} folderPath - Path to the local folder
 */
async function loadDriveFolder (drive, folderPath) {
  const absoluteFolderPath = path.resolve(folderPath)
  fs.mkdirSync(absoluteFolderPath, { recursive: true })
  const local = new Localdrive(absoluteFolderPath)

  const mirrorDrive = debounce(async () => {
    const mirror = local.mirror(drive)
    await mirror.done()
    logger.info(`Drive sync complete, mirrored local files: ${JSON.stringify(mirror.count)}`)
  })
  await mirrorDrive()
}

module.exports = {
  syncDrive,
  getDriveVersion,
  copyLicenseFiles
}
