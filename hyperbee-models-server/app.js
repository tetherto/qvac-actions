'use strict'

const fs = require('fs')
const path = require('path')
const { pipeline } = require('stream')
const util = require('util')
const Hyperdrive = require('hyperdrive')
const b4a = require('b4a')
const Localdrive = require('localdrive')
const debounce = require('debounceify')
const logger = require('./logger')

let bucketName, s3, models, configPath, localBasePath, store, db, swarm

const pipelineAsync = util.promisify(pipeline)

const drives = new Map()
const latestVersions = new Map()

async function listS3Folders (bucketName, basePath) {
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

async function getLatestModelFolder (modelBasePath) {
  const folders = await listS3Folders(bucketName, modelBasePath)
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

async function downloadLatestModel (model, modelBasePath) {
  const latestS3Folder = await getLatestModelFolder(modelBasePath)
  if (!latestS3Folder) {
    logger.warn(`No folders found in S3 for model ${model}`)
    return null
  }
  const latestVersion = path.basename(latestS3Folder.replace(/\/$/, ''))
  const localModelPath = path.join(localBasePath, model)
  const currentVersion = latestVersions.get(model)

  if (currentVersion === latestVersion) {
    logger.info(`Model ${model} already has the latest version ${latestVersion}`)
    return null
  }
  await fs.promises.rm(localModelPath, { recursive: true, force: true })
  logger.info(`Deleted existing folder for model ${model}`)
  await downloadS3Folder(bucketName, latestS3Folder, localModelPath)
  latestVersions.set(model, latestVersion)
  return localModelPath
}

async function listS3Objects (bucketName, folderPath) {
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

async function downloadS3File (bucketName, key, downloadPath) {
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

async function downloadS3Folder (bucketName, folderPath, localPath) {
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

async function loadDriveFolder (drive, folder) {
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

async function initDrive (model, folder, modelInfo) {
  const nsStore = store.namespace(model)
  const drive = new Hyperdrive(nsStore)
  await drive.ready()
  await loadDriveFolder(drive, folder)
  await new Promise(resolve => setTimeout(resolve, 1000))
  const driveVersion = drive.version
  logger.info(`Hyperdrive key for [${model}]: ${b4a.toString(drive.key, 'hex')} and version: ${driveVersion}`)

  const modelConfig = {
    key: b4a.toString(drive.key, 'hex'),
    tags: modelInfo.tags || [],
    driveVersion
  }
  await db.put(model, JSON.stringify(modelConfig))

  const discovery = swarm.join(drive.discoveryKey)
  await discovery.flushed()
  return drive
}

async function checkForUpdates () {
  logger.info('Checking for new model files...')

  const config = getConfig()
  models = config.models
  for (const [model, modelInfo] of Object.entries(models)) {
    try {
      const localModelPath = await downloadLatestModel(model, modelInfo.s3BasePath)
      if (localModelPath) {
        logger.info(`New model files downloaded for model ${model}. Updating Hyperdrive...`)
        const drive = drives.get(model)
        if (drive) {
          await loadDriveFolder(drive, path.join(localBasePath, model))
          await updateDriveVersion(drive, model)
        } else {
          logger.warn(`Drive for model ${model} not found`)
        }
      } else {
        logger.debug(`No new model files for model ${model}`)
      }
    } catch (error) {
      logger.error(`Error checking updates for model ${model}: ${error}`)
    }
  }
}

async function updateDriveVersion (drive, model) {
  const buffer = (await db.get(model)).value
  const modelJson = buffer.toString()
  const config = JSON.parse(modelJson)
  if (drive.version > config.driveVersion) {
    logger.debug(`new drive version: ${drive.version}`)
    config.driveVersion = drive.version
    await db.put(model, JSON.stringify(config))
  }
}

async function scheduleCheck () {
  await checkForUpdates()
  setTimeout(scheduleCheck, 5 * 60 * 1000)
}

async function main (cfgPath, s3Client, storeInstance, dbInstance, swarmInstance) {
  s3 = s3Client
  store = storeInstance
  db = dbInstance
  swarm = swarmInstance
  configPath = path.join(__dirname, cfgPath)

  const config = getConfig()
  bucketName = config.bucketName
  models = config.models
  localBasePath = config.localBasePath

  await db.ready()
  logger.info(`Hyperbee key: ${b4a.toString(db.key, 'hex')}`)
  swarm.on('connection', (conn) => {
    store.replicate(conn)
    logger.info(`New Connection: ${b4a.toString(conn.remotePublicKey, 'hex')}`)
  })
  const dbDiscovery = swarm.join(db.discoveryKey)
  await dbDiscovery.flushed()
  for (const [model, modelInfo] of Object.entries(models)) {
    fs.mkdirSync(path.join(localBasePath, model), { recursive: true })
    const drive = await initDrive(model, path.join(localBasePath, model), modelInfo)
    drives.set(model, drive)
    logger.info(`Drive initialized for model ${model} (no initial download).`)
  }
  await scheduleCheck()
  await printKeyDriveTable()
}

async function handleCleanUp (drives, db) {
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

async function printKeyDriveTable () {
  const tableData = [{
    type: 'bee',
    key: b4a.toString(db.key, 'hex'),
    model: 'hyperbee'
  }]

  for (const [model, drive] of drives.entries()) {
    tableData.push({
      type: 'drive',
      key: b4a.toString(drive.key, 'hex'),
      model
    })
  }

  logger.table(tableData, ['type', 'key', 'model'])
}

async function cleanUp (drives, db) {
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

function getConfig () {
  return JSON.parse(fs.readFileSync(configPath, 'utf8'))
}

module.exports = {
  main,
  cleanUp,
  handleCleanUp,
  drives
}
