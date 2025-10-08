'use strict'

const fs = require('fs')
const path = require('path')
const logger = require('./logger')
const crypto = require('crypto')

/**
 * @typedef {Object} ModelTags
 * @property {string} function - Function of the model
 * @property {string} type - Type of the model
 * @property {string} name - Name of the model
 * @property {string} externalVersion - External version of the model
 * @property {string} params - Parameters of the model
 * @property {string} quantization - Quantization of the model
 * @property {string} internalVersion - Internal version of the model
 * @property {string} other - Other information about the model
 */

/**
 * Build an inference configuration file for a model
 * @param {string} modelAddon - Addon name
 * @param {ModelTags} modelTags - Model tags
 * @param {string} modelPath - Path to the model directory
 * @returns {Promise<string>} Path to the generated inference.config.json file
 */
async function buildInferenceConfig (modelAddon, modelTags, modelPath) {
  logger.info('Building inference config for model...')

  if (!fs.existsSync(modelPath)) {
    throw new Error(`Model path does not exist: ${modelPath}`)
  }

  const files = await getModelFiles(modelPath, ['inference.config.json', '.s3-fingerprint'])
  const filteredFiles = files.filter(f => !(f.startsWith('LICENSE-') && f.endsWith('.txt')))
  const inferenceConfig = {
    addon: modelAddon,
    ...modelTags,
    files: filteredFiles
  }

  const configPath = path.join(modelPath, 'inference.config.json')
  await fs.promises.writeFile(
    configPath,
    JSON.stringify(inferenceConfig, null, 2)
  )
  return configPath
}

/**
 * Get all files in a model directory recursively
 * @param {string} modelPath - Path to the model directory
 * @param {string[]} excludeFiles - Array of file names to exclude
 * @returns {Promise<string[]>} Array of file names
 */
async function getModelFiles (modelPath, excludeFiles = []) {
  const files = []

  async function scanDirectory (dirPath, relativePath = '') {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      const relativeFilePath = path.join(relativePath, entry.name)

      if (entry.isDirectory()) {
        await scanDirectory(fullPath, relativeFilePath)
      } else {
        if (excludeFiles.includes(entry.name)) {
          continue
        }
        files.push(relativeFilePath)
      }
    }
  }

  await scanDirectory(modelPath)
  return files.sort()
}

/**
 * Generate a SHA-256 fingerprint for a model directory.
 * @param {string} modelPath - Path to the model directory
 * @returns {Promise<string>} Hexadecimal hash of all model files
 */
async function generateFingerprint (modelPath) {
  const files = await getModelFiles(modelPath)

  const hash = crypto.createHash('sha256')
  for (const relPath of files) {
    hash.update(relPath)

    const absPath = path.join(modelPath, relPath)
    await new Promise((resolve, reject) => {
      const rs = fs.createReadStream(absPath)
      rs.on('data', chunk => hash.update(chunk))
      rs.on('error', reject)
      rs.on('end', resolve)
    })
  }

  return hash.digest('hex')
}

/**
 * Generate a model key from tags in format
 * @param {ModelTags} tags - Model tags object
 * @returns {string} Model key string
 */
function generateModelKey (tags) {
  const { function: func, type, name, externalVersion, params, quantization, internalVersion, other } = tags
  const baseKey = `${func}:${name}:${type}:${externalVersion}:${params}:${quantization}:${internalVersion}`
  return other ? `${baseKey}:${other}` : baseKey
}

/**
 * Create a map of addons to empty sets for storing model keys.
 * @param {string[]} addons - Array of addon names
 * @returns {Map<string, Set>} Map with addon names as keys and empty sets as values
 */
function createAddonModelKeysMap (addons) {
  const addonModelKeysMap = new Map()
  for (const addon of addons) {
    addonModelKeysMap.set(addon, new Set())
  }
  return addonModelKeysMap
}

/**
 * Calculate checksums for all files in a directory (including subdirectories)
 * @param {string} dirPath - Path to the directory
 * @param {string[]} excludeFiles - Array of file names to exclude (optional)
 * @returns {Promise<Array<{filename: string, checksum: string, expectedSize: number}>>} Array of file info with checksums
 */
async function calculateDirectoryChecksums (dirPath, excludeFiles = []) {
  logger.info(`Calculating checksums for directory: ${dirPath}`)

  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory does not exist: ${dirPath}`)
  }

  // Get all files using the existing getModelFiles function
  const files = await getModelFiles(dirPath, excludeFiles)
  const fileChecksums = []

  // Process each file
  for (const relativeFilePath of files) {
    if (relativeFilePath.startsWith('LICENSE-') && relativeFilePath.endsWith('.txt')) {
      continue
    }
    const filePath = path.join(dirPath, relativeFilePath)

    // Get file stats for size
    const stats = await fs.promises.stat(filePath)

    // Calculate checksum using streaming
    const checksum = await new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256')
      const stream = fs.createReadStream(filePath)

      stream.on('data', chunk => {
        hash.update(chunk)
      })

      stream.on('end', () => {
        resolve(hash.digest('hex'))
      })

      stream.on('error', error => {
        reject(new Error(`Error reading file ${relativeFilePath}: ${error.message}`))
      })
    })

    fileChecksums.push({
      filename: relativeFilePath,
      checksum,
      expectedSize: stats.size
    })
  }

  logger.info(`Calculated checksums for ${fileChecksums.length} files`)
  return fileChecksums
}

module.exports = {
  buildInferenceConfig,
  generateFingerprint,
  generateModelKey,
  createAddonModelKeysMap,
  calculateDirectoryChecksums
}
