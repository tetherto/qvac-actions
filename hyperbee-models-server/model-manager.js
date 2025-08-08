'use strict'

const crypto = require('crypto')
const Corestore = require('corestore')
const Hyperbee = require('hyperbee')
const fs = require('fs')
const path = require('path')
const AWS = require('aws-sdk')

const logger = require('./logger')
const { downloadHFModel } = require('./hf')
const { downloadS3Model } = require('./aws')
const {
  generateModelKey,
  createAddonModelKeysMap,
  buildInferenceConfig,
  generateFingerprint
} = require('./utils')
const { ConfigSchema } = require('./validation')
const { syncDrive } = require('./drive')
let config = require('./config.json')

const seed = process.env.CORESTORE_SEED || 'default-seed-for-development'

const primaryKey = crypto.createHash('sha256').update(seed).digest()

let s3 = null
if (config.awsRegion && config.bucketName) {
  s3 = new AWS.S3({ region: config.awsRegion })
  logger.info(`AWS S3 client initialized for region: ${config.awsRegion}`)
}
let store = new Corestore('./storage', { primaryKey })
const core = store.get({ name: 'hyperbee' })
let db = new Hyperbee(core, { keyEncoding: 'utf-8', valueEncoding: 'binary' })

const driveKeys = {}
const driveInstances = new Map()
const keyFile = path.join(__dirname, 'keys.txt')

async function main () {
  try {
    await db.ready()
    logger.info(
      `Hyperbee initialized with key: ${db.key.toString(
        'hex'
      )} and discovery key: ${db.discoveryKey.toString('hex')}`
    )

    config = ConfigSchema.parse(config)
    logger.info('Config parsed successfully')

    const addonModelKeysMap = createAddonModelKeysMap(config.addons)
    logger.info('Addon model keys map created successfully')

    // clear key file
    await fs.promises.writeFile(keyFile, '')
    await fs.promises.appendFile(keyFile, `bee ${db.key.toString('hex')}\n`)

    for (const driveConfig of config.drives) {
      for (const model of driveConfig.models) {
        try {
          const modelKey = generateModelKey(driveConfig.tags)
          const addonKeySet = addonModelKeysMap.get(driveConfig.addon)
          if (!addonKeySet) {
            logger.error(
              `Addon ${driveConfig.addon} not found. Please check the config.json file and add it to the 'addons' array if it is a valid addon.`
            )
            continue
          }
          if (addonKeySet.has(modelKey)) {
            logger.error(
              `Model ${modelKey} already exists for addon ${driveConfig.addon}. Please check the config.json file for duplicate models.`
            )
            continue
          }
          addonKeySet.add(modelKey)

          const dbRecord = await db.get(modelKey)
          let existingModelRecord = null
          if (dbRecord && dbRecord.value) {
            existingModelRecord = JSON.parse(dbRecord.value.toString())
          }

          // Check if driveKey is provided - if so, skip download and use provided key
          if (driveConfig.driveKey) {
            logger.info(
              `Model ${modelKey} has driveKey provided, skipping download and using existing drive: ${driveConfig.driveKey}`
            )

            const defaultFingerprint =
              '0000000000000000000000000000000000000000000000000000000000000000'

            const modelRecord = {
              key: driveConfig.driveKey,
              tags: driveConfig.tags,
              driveVersion: null,
              fingerprint: defaultFingerprint
            }

            await db.put(modelKey, JSON.stringify(modelRecord))
            driveKeys[modelKey] = driveConfig.driveKey
            logger.info(
              `Model ${modelKey} record created with provided driveKey: ${JSON.stringify(
                modelRecord
              )}`
            )
            continue
          }

          let localPath
          if (model.source === 'hf') {
            localPath = await downloadHFModel(
              model.path,
              config.localBasePath,
              modelKey
            )
          } else if (model.source === 'aws') {
            if (!s3) {
              logger.error(
                `AWS S3 client not initialized for model ${modelKey}. Please provide awsRegion and bucketName in config.json`
              )
              continue
            }
            localPath = await downloadS3Model(
              s3,
              config.bucketName,
              model.path,
              config.localBasePath,
              modelKey
            )
          } else {
            logger.error(
              `Source '${model.source}' not supported for model ${modelKey}. Supported sources are 'hf' and 'aws'. Please check the config.json file for valid sources.`
            )
            continue
          }

          await buildInferenceConfig(
            driveConfig.addon,
            driveConfig.tags,
            localPath
          )
          const fingerprint = await generateFingerprint(localPath)
          let existingDriveVersion = -1
          if (existingModelRecord) {
            existingDriveVersion = existingModelRecord.driveVersion
            if (existingModelRecord.fingerprint === fingerprint) {
              await fs.promises.appendFile(
                keyFile,
                `${modelKey} ${existingModelRecord.key}\n`
              )
              driveKeys[modelKey] = existingModelRecord.key
              logger.info(
                `Model ${modelKey} already exists locally and on drive with the same fingerprint: ${fingerprint}. Skipping...`
              )
              continue
            } else {
              logger.info(
                `Model ${modelKey} has a new fingerprint, local path fingerprint: ${fingerprint}, existing drive fingerprint: ${existingModelRecord.fingerprint}. Updating drive...`
              )
            }
          } else {
            logger.info(
              `Model ${modelKey} does not exist. Initializing drive...`
            )
          }

          const drive = await syncDrive(store, modelKey, localPath)
          if (drive.version > existingDriveVersion) {
            logger.info(
              `Model ${modelKey} has a new drive version, previous drive version: ${existingDriveVersion}, new drive version: ${drive.version}`
            )
          }
          driveKeys[modelKey] = drive.key
          driveInstances.set(modelKey, drive)

          const modelRecord = {
            key: drive.key.toString('hex'),
            tags: driveConfig.tags,
            driveVersion: drive.version,
            fingerprint
          }
          await db.put(modelKey, JSON.stringify(modelRecord))
          await fs.promises.appendFile(
            keyFile,
            `${modelKey} ${drive.key.toString('hex')}\n`
          )
          logger.info(
            `Model ${modelKey} record updated successfully with record: ${JSON.stringify(
              modelRecord
            )}`
          )
        } catch (error) {
          logger.error(
            `Error processing model ${model.path || 'unknown'}: ${
              error.message
            }`
          )
          logger.error(`Stack trace: ${error.stack}`)
          continue
        }
      }
    }

    logger.info('=== Drives Map ===')
    for (const [modelKey, driveKey] of Object.entries(driveKeys)) {
      logger.info(`${modelKey} -> ${driveKey.toString('hex')}`)
    }
    logger.info('==================')

    logger.info('=== Addon Model Keys Map ===')
    for (const [addon, modelKeys] of addonModelKeysMap.entries()) {
      logger.info(`${addon}:`)
      if (modelKeys.size === 0) {
        logger.info('  (no models)')
      } else {
        for (const modelKey of modelKeys) {
          logger.info(`  - ${modelKey}`)
        }
      }
    }
    logger.info('===========================')
  } catch (error) {
    logger.error(`Error in main function: ${error.stack}`)
  } finally {
    await cleanup()
  }
}

/**
 * Cleanup function to close all drives, database, and store connections
 */
async function cleanup () {
  logger.info('Starting cleanup...')

  try {
    logger.info(`Closing ${driveInstances.size} drive instances...`)
    for (const [modelKey, drive] of driveInstances.entries()) {
      try {
        await drive.close()
        logger.info(`Closed drive for model: ${modelKey}`)
      } catch (error) {
        logger.error(
          `Error closing drive for model ${modelKey}: ${error.message}`
        )
      }
    }
    driveInstances.clear()

    if (db) {
      try {
        await db.close()
        logger.info('Database closed successfully')
      } catch (error) {
        logger.error(`Error closing database: ${error.message}`)
      }
    }

    if (store) {
      try {
        await store.close()
        logger.info('Store closed successfully')
      } catch (error) {
        logger.error(`Error closing store: ${error.message}`)
      }
    }

    logger.info('Cleanup completed successfully')
  } catch (error) {
    logger.error(`Error during cleanup: ${error.message}`)
  }
}

/**
 * Setup signal handlers for graceful shutdown
 */
function setupSignalHandlers () {
  const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT']

  signals.forEach(signal => {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, starting graceful shutdown...`)
      await cleanup()
      process.exit(0)
    })
  })

  process.on('uncaughtException', async error => {
    logger.error(`Uncaught Exception: ${error.message}`)
    logger.error(error.stack)
    await cleanup()
    process.exit(1)
  })

  process.on('unhandledRejection', async (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
    await cleanup()
    process.exit(1)
  })
}

async function mainForTesting (configPath, s3Client, storeInstance, dbInstance) {
  // Override the global variables for testing
  s3 = s3Client
  store = storeInstance
  db = dbInstance

  const resolvedConfigPath = path.resolve(configPath)
  config = require(resolvedConfigPath)

  await main()
}

if (require.main === module) {
  setupSignalHandlers()
  main()
}

module.exports = {
  main: mainForTesting
}
