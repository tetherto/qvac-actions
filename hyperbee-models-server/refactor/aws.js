'use strict'

const fs = require('fs')
const path = require('path')
const { pipeline } = require('stream')
const util = require('util')
const logger = require('../logger')

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
  const folders = await listS3Folders(s3, bucketName, modelBasePath)
  if (folders.length === 0) {
    logger.warn(`No folders found in S3 for path ${modelBasePath}`)
    return null
  }

  const datedFolders = folders.map(folder => {
    const dateStr = path.basename(folder)
    const dateObj = new Date(dateStr)
    return { folder, dateObj }
  })

  datedFolders.sort((a, b) => a.dateObj - b.dateObj)
  return datedFolders[datedFolders.length - 1].folder
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
    logger.info(`Downloaded: ${key}`)
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
 * Download a model from S3 to local storage
 * Similar to downloadHFModel but for S3 sources
 * @param {AWS.S3} s3 - AWS S3 client
 * @param {string} bucketName - S3 bucket name
 * @param {string} s3Path - S3 path (can be folder path or specific file)
 * @param {string} modelsRoot - Local directory to save the model
 * @param {string} modelKey - unique key to name the local model folder
 * @returns {Promise<string>} Local directory path containing the model
 */
async function downloadS3Model (s3, bucketName, s3Path, modelsRoot, modelKey) {
  try {
    const isFolder = s3Path.endsWith('/') || !path.extname(s3Path)

    if (isFolder) {
      const latestFolder = await getLatestModelFolder(s3, bucketName, s3Path)
      if (!latestFolder) {
        throw new Error(`No folders found for path: ${s3Path}`)
      }

      const destDir = path.join(modelsRoot, modelKey)

      try {
        await fs.promises.rm(destDir, { recursive: true, force: true })
      } catch (_) { }

      await downloadS3Folder(s3, bucketName, latestFolder, destDir)

      logger.info(`Downloaded S3 folder ${latestFolder} -> ${destDir}`)
      return destDir
    } else {
      const destDir = path.join(modelsRoot, modelKey)
      await fs.promises.mkdir(destDir, { recursive: true })

      const destFile = path.join(destDir, 'model' + path.extname(s3Path))

      try {
        await fs.promises.unlink(destFile)
      } catch (_) { }

      await downloadS3File(s3, bucketName, s3Path, destFile)

      logger.info(`Downloaded S3 file ${s3Path} -> ${destFile}`)
      return destDir
    }
  } catch (error) {
    logger.error(`Error downloading S3 model: ${error.message}`)
    throw error
  }
}

module.exports = {
  downloadS3Model
}
