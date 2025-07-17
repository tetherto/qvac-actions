const crypto = require('crypto')
const Corestore = require('corestore')
const Hyperbee = require('hyperbee')
const fs = require('fs')
const logger = require('../logger')
const path = require('path')

const { downloadHFModel } = require('./hf')
const { generateModelKey, createAddonModelKeysMap, buildInferenceConfig, generateFingerprint } = require('./utils')
const { ConfigSchema } = require('./validation')
const { syncDrive } = require('./drive')
let config = require('./config.json')

const seed = process.env.CORESTORE_SEED

const primaryKey = crypto.createHash('sha256')
  .update(seed)
  .digest()

const store = new Corestore('./storage', { primaryKey })
const core = store.get({ name: 'hyperbee' })
const db = new Hyperbee(core, { keyEncoding: 'utf-8', valueEncoding: 'utf-8' })

const drives = {}
const keyFile = path.join(__dirname, 'keys.txt')

async function main () {
  try {
    await db.ready()
    logger.info(`Hyperbee initialized with key: ${db.key.toString('hex')} and discovery key: ${db.discoveryKey.toString('hex')}`)

    config = ConfigSchema.parse(config)
    logger.info('Config parsed successfully')

    const addonModelKeysMap = createAddonModelKeysMap(config.addons)
    logger.info('Addon model keys map created successfully')

    // clear key file
    await fs.promises.writeFile(keyFile, '')
    await fs.promises.appendFile(keyFile, `bee ${db.key.toString('hex')}\n`)

    for (const model of config.models) {
      const modelKey = generateModelKey(model.tags)
      const addonKeySet = addonModelKeysMap.get(model.addon)
      if (!addonKeySet) {
        throw new Error(`Addon ${model.addon} not found. Please check the config.json file and add it to the 'addons' array if it is a valid addon.`)
      }
      if (addonKeySet.has(modelKey)) {
        throw new Error(`Model ${modelKey} already exists for addon ${model.addon}. Please check the config.json file for duplicate models.`)
      }
      addonKeySet.add(modelKey)

      const dbRecord = await db.get(modelKey)
      let existingModelRecord = null
      if (dbRecord && dbRecord.value) {
        existingModelRecord = JSON.parse(dbRecord.value.toString())
      }

      let localPath
      if (model.source === 'hf') {
        localPath = await downloadHFModel(model.path, config.localBasePath)
      } else {
        throw new Error(`Source '${model.source}' not supported. Supported sources are 'hf' and 'aws'. Please check the config.json file for valid sources.`)
      }

      await buildInferenceConfig(model.addon, model.tags, localPath)

      const fingerprint = await generateFingerprint(localPath)
      let existingDriveVersion = -1
      if (existingModelRecord) {
        existingDriveVersion = existingModelRecord.driveVersion
        if (existingModelRecord.fingerprint === fingerprint) {
          await fs.promises.appendFile(keyFile, `${modelKey} ${existingModelRecord.key}\n`)
          drives[modelKey] = existingModelRecord.key
          logger.info(`Model ${modelKey} already exists locally and on drive with the same fingerprint: ${fingerprint}. Skipping...`)
          continue
        } else {
          logger.info(`Model ${modelKey} has a new fingerprint, local path fingerprint: ${fingerprint}, existing drive fingerprint: ${existingModelRecord.fingerprint}. Updating drive...`)
        }
      } else {
        logger.info(`Model ${modelKey} does not exist. Initializing drive...`)
      }

      const drive = await syncDrive(store, modelKey, localPath)
      if (drive.version > existingDriveVersion) {
        logger.info(`Model ${modelKey} has a new drive version, previous drive version: ${existingDriveVersion}, new drive version: ${drive.version}`)
      }
      drives[modelKey] = drive.key

      const modelRecord = {
        key: drive.key.toString('hex'),
        tags: model.tags,
        driveVersion: drive.version,
        fingerprint
      }
      await db.put(modelKey, JSON.stringify(modelRecord))
      await fs.promises.appendFile(keyFile, `${modelKey} ${drive.key.toString('hex')}\n`)
      logger.info(`Model ${modelKey} record updated successfully with record: ${JSON.stringify(modelRecord)}`)
    }

    logger.info('=== Drives Map ===')
    for (const [modelKey, driveKey] of Object.entries(drives)) {
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
  }
}

main()
