'use strict'

const fs = require('fs')
const path = require('path')
const { pipeline } = require('stream')
const util = require('util')
const crypto = require('crypto')
const logger = require('./logger')

const pipelineAsync = util.promisify(pipeline)

/**
 * List S3 folders in a bucket with a given prefix
 * @param {AWS.S3} s3 - AWS S3 client
 * @param {string} bucketName - S3 bucket name
 * @param {string} basePath - Base path prefix to search
 * @returns {Promise<string[]>} Array of folder paths
 */
async function listS3Folders (s3, bucketName, basePath) {
  const params = {
    Bucket: bucketName,
    Prefix: basePath,
    Delimiter: '/'
  }
  let folders = []
  let isTruncated = true
  let continuationToken

  while (isTruncated) {
    if (continuationToken) params.ContinuationToken = continuationToken
    const data = await s3.listObjectsV2(params).promise()
    isTruncated = data.IsTruncated
    continuationToken = data.NextContinuationToken
    if (data.CommonPrefixes) {
      folders = folders.concat(data.CommonPrefixes.map((item) => item.Prefix))
    }
  }
  return folders
}

/**
 * Get the latest model folder from S3 (based on date)
 * @param {AWS.S3} s3 - AWS S3 client
 * @param {string} bucketName - S3 bucket name
 * @param {string} modelBasePath - Base path for the model
 * @returns {Promise<string|null>} Latest folder path or null if not found
 */
async function getLatestModelFolder (s3, bucketName, modelBasePath) {
  logger.info(`Searching for folders in: ${modelBasePath}`)

  const folders = await listS3Folders(s3, bucketName, modelBasePath)
  logger.info(`Found ${folders.length} folders: ${folders.join(', ')}`)

  if (folders.length === 0) {
    logger.warn(`No folders found in S3 for path ${modelBasePath}`)
    return null
  }

  logger.info('Processing date folders...')
  const datedFolders = folders.map(folder => {
    const dateStr = path.basename(folder)
    const dateObj = new Date(dateStr)
    return { folder, dateObj }
  })

  logger.info('Sorting folders by date...')
  datedFolders.sort((a, b) => a.dateObj - b.dateObj)
  const latestFolder = datedFolders[datedFolders.length - 1].folder
  logger.info(`Selected latest folder: ${latestFolder}`)

  return latestFolder
}

/**
 * List all objects in an S3 folder
 * @param {AWS.S3} s3 - AWS S3 client
 * @param {string} bucketName - S3 bucket name
 * @param {string} folderPath - Folder path in S3
 * @returns {Promise<string[]>} Array of object keys
 */
async function listS3Objects (s3, bucketName, folderPath) {
  const params = {
    Bucket: bucketName,
    Prefix: folderPath.endsWith('/') ? folderPath : folderPath + '/'
  }
  let objects = []
  let isTruncated = true
  let continuationToken

  while (isTruncated) {
    if (continuationToken) params.ContinuationToken = continuationToken
    const data = await s3.listObjectsV2(params).promise()
    isTruncated = data.IsTruncated
    continuationToken = data.NextContinuationToken
    objects = objects.concat(data.Contents.map((item) => item.Key))
  }
  return objects
}

/**
 * Download a single file from S3
 * @param {AWS.S3} s3 - AWS S3 client
 * @param {string} bucketName - S3 bucket name
 * @param {string} key - S3 object key
 * @param {string} downloadPath - Local path to save the file
 */
async function downloadS3File (s3, bucketName, key, downloadPath) {
  const params = { Bucket: bucketName, Key: key }
  const dir = path.dirname(downloadPath)
  fs.mkdirSync(dir, { recursive: true })

  try {
    const data = s3.getObject(params).createReadStream()
    await pipelineAsync(
      data,
      fs.createWriteStream(downloadPath)
    )
  } catch (error) {
    logger.error(`Error downloading ${key}: ${error.message}`)
    throw error
  }
}

/**
 * Download an entire folder from S3
 * @param {AWS.S3} s3 - AWS S3 client
 * @param {string} bucketName - S3 bucket name
 * @param {string} folderPath - S3 folder path
 * @param {string} localPath - Local path to save the folder
 */
async function downloadS3Folder (s3, bucketName, folderPath, localPath) {
  try {
    logger.info(`Downloading folder: ${folderPath} -> ${localPath}`)
    const files = await listS3Objects(s3, bucketName, folderPath)
    await Promise.all(files.map(async (fileKey) => {
      const relativePath = fileKey.replace(folderPath, '')
      const downloadPath = path.join(localPath, relativePath)
      await downloadS3File(s3, bucketName, fileKey, downloadPath)
    }))
    logger.info(`Folder ${folderPath} download complete.`)
  } catch (error) {
    logger.error(`Error downloading folder: ${error.message}`)
    throw error
  }
}

/**
 * Generate a fingerprint for an S3 model path
 * For AWS models, we use the date folder as the version fingerprint
 * @param {AWS.S3} s3 - AWS S3 client
 * @param {string} bucketName - S3 bucket name
 * @param {string} s3Path - S3 path
 * @returns {Promise<string>} Fingerprint string
 */
async function generateS3Fingerprint (s3, bucketName, s3Path) {
  const isFolder = s3Path.endsWith('/') || !path.extname(s3Path)

  if (isFolder) {
    const latestFolder = await getLatestModelFolder(s3, bucketName, s3Path)
    if (!latestFolder) {
      throw new Error(`No folders found for path: ${s3Path}`)
    }

    const dateStr = path.basename(latestFolder)
    logger.info(`Generated S3 fingerprint from date folder: ${dateStr}`)

    const hash = crypto.createHash('sha256')
    hash.update(`s3-${dateStr}`)
    return hash.digest('hex')
  } else {
    logger.info(`Generated S3 fingerprint from file path: ${s3Path}`)

    const hash = crypto.createHash('sha256')
    hash.update(`s3-file-${s3Path}`)
    return hash.digest('hex')
  }
}

/**
 * Check if S3 model needs to be downloaded based on fingerprint
 * @param {string} localPath - Local model path
 * @param {string} expectedFingerprint - Expected fingerprint
 * @returns {Promise<boolean>} True if download is needed
 */
async function needsS3Download (localPath, expectedFingerprint) {
  try {
    if (!fs.existsSync(localPath)) {
      logger.info(`Local path does not exist: ${localPath}`)
      return true
    }

    const fingerprintFile = path.join(localPath, '.s3-fingerprint')
    if (!fs.existsSync(fingerprintFile)) {
      logger.info(`Fingerprint file does not exist: ${fingerprintFile}`)
      return true
    }
    const storedFingerprint = await fs.promises.readFile(fingerprintFile, 'utf8')
    const needsDownload = storedFingerprint.trim() !== expectedFingerprint

    logger.info(`Fingerprint comparison: stored="${storedFingerprint.trim()}" vs expected="${expectedFingerprint}" -> needsDownload=${needsDownload}`)
    return needsDownload
  } catch (error) {
    logger.warn(`Error checking fingerprint, will download: ${error.message}`)
    return true
  }
}

/**
 * Store fingerprint for S3 model
 * @param {string} localPath - Local model path
 * @param {string} fingerprint - Fingerprint to store
 */
async function storeS3Fingerprint (localPath, fingerprint) {
  const fingerprintFile = path.join(localPath, '.s3-fingerprint')
  await fs.promises.writeFile(fingerprintFile, fingerprint)
  logger.info(`Stored S3 fingerprint: ${fingerprint}`)
}

/**
 * Download a model from S3 to local storage with fingerprint-based caching
 * @param {AWS.S3} s3 - AWS S3 client
 * @param {string} bucketName - S3 bucket name
 * @param {string} s3Path - S3 path (can be folder path or specific file)
 * @param {string} modelsRoot - Local directory to save the model
 * @param {string} modelKey - unique key to name the local model folder
 * @returns {Promise<string>} Local model folder path
 */
async function downloadS3Model (s3, bucketName, s3Path, modelsRoot, modelKey) {
  try {
    logger.info(`Starting download for path "${s3Path}"`)

    const isFolder = s3Path.endsWith('/') || !path.extname(s3Path)
    logger.info(`Path type: ${isFolder ? 'FOLDER' : 'FILE'} (endsWith('/')=${s3Path.endsWith('/')}, hasExtension=${!!path.extname(s3Path)})`)

    const s3Fingerprint = await generateS3Fingerprint(s3, bucketName, s3Path)
    const destDir = path.join(modelsRoot, modelKey)
    const needsDownload = await needsS3Download(destDir, s3Fingerprint)

    if (!needsDownload) {
      logger.info(`S3 model already up to date, skipping download. S3 Fingerprint: ${s3Fingerprint}`)
      return destDir
    }

    logger.info(`S3 model needs download. S3 Fingerprint: ${s3Fingerprint}`)

    if (isFolder) {
      logger.info('Treating as folder, will search for latest date subfolder...')
      const latestFolder = await getLatestModelFolder(s3, bucketName, s3Path)
      if (!latestFolder) {
        throw new Error(`No folders found for path: ${s3Path}`)
      }

      try {
        await fs.promises.rm(destDir, { recursive: true, force: true })
        logger.info(`Cleaned existing directory: ${destDir}`)
      } catch (_) { }

      await downloadS3Folder(s3, bucketName, latestFolder, destDir)

      await storeS3Fingerprint(destDir, s3Fingerprint)
      return destDir
    } else {
      await fs.promises.mkdir(destDir, { recursive: true })

      const destFile = path.join(destDir, 'model' + path.extname(s3Path))

      try {
        await fs.promises.unlink(destFile)
        logger.info(`Cleaned existing file: ${destFile}`)
      } catch (_) { }

      logger.info(`Downloading file: ${s3Path} -> ${destFile}`)
      await downloadS3File(s3, bucketName, s3Path, destFile)

      await storeS3Fingerprint(destDir, s3Fingerprint)

      logger.info(`Downloaded S3 file ${s3Path} -> ${destFile}`)
      return destDir
    }
  } catch (error) {
    logger.error(`Error downloading S3 model: ${error.message}`)
    throw error
  }
}

module.exports = {
  downloadS3Model,
  generateS3Fingerprint,
  needsS3Download
}
