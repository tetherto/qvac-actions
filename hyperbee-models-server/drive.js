'use strict'

const fs = require('fs')
const Hyperdrive = require('hyperdrive')
const Localdrive = require('localdrive')
const path = require('path')
const debounce = require('debounceify')
const logger = require('./logger')

/**
 * Syncs a Hyperdrive for a model. If the drive already exists, it will be updated. If the drive does not exist, it will be created.
 * @param {Corestore} store - Corestore instance
 * @param {string} modelKey - Model key
 * @param {string} modelPath - Path to the model folder
 * @param {Object} modelTags - Model tags
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
  syncDrive
}
