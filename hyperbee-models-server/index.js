'use strict'

const AWS = require('aws-sdk')
const fs = require('fs')
const path = require('path')
const { pipeline } = require('stream')
const util = require('util')
const Hyperswarm = require('hyperswarm')
const Hyperdrive = require('hyperdrive')
const Corestore = require('corestore')
const b4a = require('b4a')
const Hyperbee = require('hyperbee')
const Localdrive = require('localdrive')
const debounce = require('debounceify')
const config = require('./config.json')
const logger = require('./logger')

const bucketName = config.bucketName
const awsRegion = config.awsRegion
AWS.config.update({ region: awsRegion })
const s3 = new AWS.S3()

const pipelineAsync = util.promisify(pipeline)

const pairFolders = config.pairFolders
const localBasePath = config.localBasePath

const store = new Corestore('./.storage')
const core = store.get({ name: 'hyperbee' })
const db = new Hyperbee(core, { keyEncoding: 'utf-8', valueEncoding: 'binary' })

const swarm = new Hyperswarm()
const drives = new Map()
const latestVersions = new Map()

async function listS3Folders(bucketName, basePath) {
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

async function getLatestModelFolder(pairBasePath) {
  const folders = await listS3Folders(bucketName, pairBasePath)
  if (folders.length === 0) {
    logger.warn(`No folders found in S3 for path ${pairBasePath}`)
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

async function downloadLatestModel(pair, pairBasePath) {
  const latestS3Folder = await getLatestModelFolder(pairBasePath)
  if (!latestS3Folder) {
    logger.warn(`No folders found in S3 for pair ${pair}`)
    return null
  }
  const latestVersion = path.basename(latestS3Folder.replace(/\/$/, ''))
  const localModelPath = path.join(localBasePath, pair)
  const currentVersion = latestVersions.get(pair)
  if (currentVersion === latestVersion) {
    logger.info(`Pair ${pair} already has the latest version ${latestVersion}`)
    return null
  }
  await downloadS3Folder(bucketName, latestS3Folder, localModelPath)
  latestVersions.set(pair, latestVersion)
  return localModelPath
}

async function listS3Objects(bucketName, folderPath) {
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

async function downloadS3File(bucketName, key, downloadPath) {
  const params = { Bucket: bucketName, Key: key }
  const dir = path.dirname(downloadPath)
  fs.mkdirSync(dir, { recursive: true })
  try {
    await pipelineAsync(
      s3.getObject(params).createReadStream(),
      fs.createWriteStream(downloadPath)
    )
    logger.info(`Downloaded: ${key}`)
  } catch (error) {
    logger.error(`Error downloading ${key}: ${error.message}`)
    throw error
  }
}

async function downloadS3Folder(bucketName, folderPath, localPath) {
  try {
    const files = await listS3Objects(bucketName, folderPath)
    await Promise.all(files.map(async (fileKey) => {
      const relativePath = fileKey.replace(folderPath, '')
      const downloadPath = path.join(localPath, relativePath)
      await downloadS3File(bucketName, fileKey, downloadPath)
    }))
    logger.info(`Folder ${folderPath} download complete.`)
  } catch (error) {
    logger.error(`Error downloading folder: ${error.message}`)
  }
}

async function loadDriveFolder(drive, folder) {
  const absoluteFolderPath = path.resolve(folder)
  fs.mkdirSync(absoluteFolderPath, { recursive: true })
  const local = new Localdrive(absoluteFolderPath)
  const mirrorDrive = debounce(async () => {
    const mirror = local.mirror(drive)
    await mirror.done()
    logger.debug(`Mirrored local files: ${JSON.stringify(mirror.count)}`)
  })
  await mirrorDrive()
}

async function initDrive(pair, folder) {
  const nsStore = store.namespace(pair)
  const drive = new Hyperdrive(nsStore)
  await drive.ready()
  await loadDriveFolder(drive, folder)
  log(`Hyperdrive key for [${pair}]: ${b4a.toString(drive.key, 'hex')}`)
  await db.put(pair, drive.key)
  const discovery = swarm.join(drive.discoveryKey)
  await discovery.flushed()
  return drive
}

async function checkForUpdates() {
  logger.info('Checking for new model files...')
  for (const [pair, s3BasePath] of Object.entries(pairFolders)) {
    try {
      const localModelPath = await downloadLatestModel(pair, s3BasePath)
      if (localModelPath) {
        logger.info(`New model files downloaded for pair ${pair}. Updating Hyperdrive...`)
        const drive = drives.get(pair)
        if (drive) {
          await loadDriveFolder(drive, path.join(localBasePath, pair))
        } else {
          logger.warn(`Drive for pair ${pair} not found`)
        }
      } else {
        logger.debug(`No new model files for pair ${pair}`)
      }
    } catch (error) {
      logger.error(`Error checking updates for pair ${pair}: ${error}`)
    }
  }
}

async function scheduleCheck() {
  await checkForUpdates()
  setTimeout(scheduleCheck, 60 * 60 * 1000)
}

async function main() {
  await db.ready()
  logger.info(`Hyperbee key: ${b4a.toString(db.key, 'hex')}`)
  swarm.on('connection', (conn) => {
    store.replicate(conn)
    logger.info(`New Connection: ${b4a.toString(conn.remotePublicKey, 'hex')}`)
  })
  const dbDiscovery = swarm.join(db.discoveryKey)
  await dbDiscovery.flushed()
  for (const [pair] of Object.entries(pairFolders)) {
    fs.mkdirSync(path.join(localBasePath, pair), { recursive: true })
    const drive = await initDrive(pair, path.join(localBasePath, pair))
    drives.set(pair, drive)
    logger.info(`Drive initialized for pair ${pair} (no initial download).`)
  }
  await scheduleCheck()
}

async function handleCleanUp(drives, db) {
  const handleExit = async (signal) => {
    logger.info(`Received signal: ${signal}`)
    await cleanUp(drives, db)
  }
  process.on('uncaughtException', async (err) => {
    logger.error(`Uncaught exception: ${err.stack || err}`)
    await cleanUp(drives, db)
  })
  process.on('SIGINT', handleExit)
  process.on('SIGTERM', handleExit)
}

async function cleanUp(drives, db) {
  try {
    await Promise.all([...drives.values()].map((dr) => dr.close()))
    await db.close()
    await swarm.destroy()
    logger.info('Cleanup complete.')
  } catch (err) {
    logger.error(`Error during cleanup: ${err}`)
  } finally {
    process.exit(0)
  }
}

main().then(() => {
  handleCleanUp(drives, db)
}).catch(async (err) => {
  logger.error(`Error in main function: ${err.stack || err}`)
  await cleanUp(drives, db)
})
