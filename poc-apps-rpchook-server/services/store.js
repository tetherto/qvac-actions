'use strict'

const Autobase = require('autobase')
const Corestore = require('corestore')
const SeedBee = require('seedbee')
const { corestoreDir } = require('../config')
const { runBackgroundSeeding, killPrcoess } = require('./pear')
const logger = require('../logger')

let autobaseInstance = null
let storeInstance = null

/**
 * Initializes and returns a singleton Corestore instance.
 * @returns {Promise<Corestore>} - The Corestore instance.
 */
async function getCorestoreInstance () {
  if (storeInstance && storeInstance.closed) {
    storeInstance = null
  }

  if (storeInstance) {
    await storeInstance.ready()
    return storeInstance
  }

  if (!corestoreDir) {
    throw new Error('corestoreDir is not set')
  }

  storeInstance = new Corestore(corestoreDir)
  await storeInstance.ready()
  return storeInstance
}

/**
 * Initializes and returns a singleton Autobase instance.
 * @returns {Promise<Autobase>} - The Autobase instance.
 */
async function getAutobaseInstance () {
  if (autobaseInstance && autobaseInstance.closed) {
    storeInstance = null
  }

  if (autobaseInstance) {
    await autobaseInstance.ready()
    return autobaseInstance
  }

  const store = await getCorestoreInstance()
  const linearizedCore = store.get({ name: 'linearized', valueEncoding: 'utf8' })
  // Initialize separate core for pear keys.
  store.get({ name: 'pearKeys', valueEncoding: 'utf8' })

  autobaseInstance = new Autobase(store, {
    valueEncoding: 'json',
    localOutput: linearizedCore,
    async apply (batch, view) {
      if (!this._state) {
        this._state = new Map()
        for (let i = 0; i < view.length; i++) {
          const entry = await view.get(i)
          if (entry) {
            try {
              const record = JSON.parse(entry.toString('utf8'))
              const key = `${record.poc}:${record.channel}`
              this._state.set(key, record)
            } catch (err) {
              logger.error(`Error parsing view entry: ${err.message}`)
            }
          }
        }
      }

      for (const node of batch) {
        if (node && node.value) {
          const record = node.value
          const key = `${record.poc}:${record.channel}`
          this._state.set(key, record)
        }
      }

      if (typeof view.truncate === 'function') {
        await view.truncate(0)
      } else {
        logger.warn('View does not support truncate')
      }

      const blocks = Array.from(this._state.values()).map(record =>
        JSON.stringify(record)
      )
      await view.append(blocks)
    },
    open (viewStore) {
      return linearizedCore
    }
  })

  await autobaseInstance.ready()

  logger.info(
    `Autobase instance initialized with public key: ${autobaseInstance.key.toString(
      'hex'
    )}`
  )
  return autobaseInstance
}

/**
 * Appends a record to the autobase linearized view and updates the pearKeys core.
 *
 * @param {object} record - The record to append. Expected fields: poc, channel, uiPearKey, workerPearKey.
 * @returns {Promise<string>} - The key of the poc seed bee core.
 */
async function updateAutobaseRecord (record) {
  if (!record || !record.poc || !record.channel || !record.uiPearKey || !record.workerPearKey) {
    throw new Error(
      'Missing required fields in record: poc, channel, uiPearKey, workerPearKey'
    )
  }

  try {
    const autobase = await getAutobaseInstance()
    await autobase.append(record)
    await autobase.update()
    logger.info(`Autobase updated with new record: ${JSON.stringify(record)}`)
    const pearKeysHb = await updatePearKeysStore(autobase)

    await autobase.store.close()
    await autobase.close()
    autobaseInstance = null
    storeInstance = null

    runBackgroundSeeding(pearKeysHb, record.uiPearKey, record.workerPearKey)
    return pearKeysHb
  } catch (err) {
    logger.error(`Error updating record: ${err.message}`)
    throw err
  }
}

/**
 * Updates the pearKeys core by creating a SeedBee list from the current Autobase records.
 * For each record in the linearized view that has a `pearKey`, the pear key string is added
 * as an entry in the SeedBee list.
 * @param {Autobase} autobase - The Autobase instance.
 * @returns {Promise<string>} - The key of the pearKeys core.
 */
async function updatePearKeysStore (autobase) {
  try {
    const pearCore = autobase.store.get({
      name: 'pearKeys',
      valueEncoding: 'utf8'
    })
    await pearCore.ready()

    if (typeof pearCore.truncate === 'function') {
      await pearCore.truncate(0)
    } else {
      logger.warn('pearKeys core does not support truncate')
    }

    const seedbee = new SeedBee(pearCore)
    await seedbee.ready()

    const view = autobase.view
    const pearKeys = []
    for (let i = 0; i < view.length; i++) {
      const entry = await view.get(i)
      if (entry) {
        try {
          const record = JSON.parse(entry.toString('utf8'))
          if (record) {
            pearKeys.push(record.uiPearKey)
            pearKeys.push(record.workerPearKey)
          }
        } catch (err) {
          logger.error(`Error parsing view entry: ${err.message}`)
        }
      }
    }

    for (let i = 0; i < pearKeys.length; i++) {
      await seedbee.put(pearKeys[i], { type: 'core' })
    }
    return pearCore.key.toString('hex')
  } catch (err) {
    logger.error(`Error updating pearKeys core: ${err.message}`)
    throw err
  }
}

/**
 * Retrieves the merged state from the linearized view.
 * Each key is of the form "poc:channel" with its associated record.
 *
 * @param {Autobase} autobase - The Autobase instance.
 * @returns {Promise<Map<string, object>>} - The merged state.
 */
async function getLinearizedView (autobase) {
  const view = autobase.view
  const state = new Map()
  for (let i = 0; i < autobase.view.length; i++) {
    const entry = await view.get(i)
    if (entry) {
      try {
        const record = JSON.parse(entry.toString('utf8'))
        state.set(`${record.poc}:${record.channel}`, record)
      } catch (err) {
        logger.error(`Error parsing view entry: ${err.message}`)
      }
    }
  }
  return state
}

/**
 * Retrieves the current state of pear keys from the pearKeys core.
 *
 * @param {Autobase} autobase - The Autobase instance.
 * @returns {Promise<string[]>} - Array of pear keys.
 */
async function getPearKeys (autobase) {
  const view = autobase.view
  const pearKeys = []
  for (let i = 0; i < view.length; i++) {
    const entry = await view.get(i)
    if (entry) {
      try {
        const record = JSON.parse(entry.toString('utf8'))
        if (record.uiPearKey) {
          pearKeys.push(record.uiPearKey)
        }
      } catch (err) {
        logger.error(`Error parsing view entry: ${err.message}`)
      }
    }
  }
  return pearKeys
}

/**
 * Retrieves the current state of the application from both the linearized view and the pearKeys core.
 * @returns {Promise<{ linearizedViewState: Object<string, object>, uiPearKeys: string[] }>}
 */
async function getOpenState () {
  await killPrcoess('simpleSeeder') // Kill the seeder process before reading the autobase
  const autobase = await getAutobaseInstance()
  await autobase.update()

  const [linearizedViewState, uiPearKeys] = await Promise.all([
    getLinearizedView(autobase),
    getPearKeys(autobase)
  ])

  const pearCore = autobase.store.get({
    name: 'pearKeys',
    valueEncoding: 'utf8'
  })
  await pearCore.ready()
  const pearKeysHb = pearCore.key.toString('hex')

  await autobase.store.close()
  await autobase.close()
  autobaseInstance = null
  storeInstance = null

  runBackgroundSeeding(pearKeysHb)

  return {
    linearizedViewState: Object.fromEntries(linearizedViewState),
    uiPearKeys
  }
}

/**
 * Retrieves the deployment keys for a given poc and channel from the autobase.
 *
 * @param {Autobase} autobase - The Autobase instance.
 * @param {string} app - The poc application name.
 * @param {string} channel - The channel name.
 * @returns {Promise<{ poc: string, channel: string, ui: string, worker: string, errors: string[] }>} - The deployment keys.
 */
async function getPocDeploymentKeys (app, channel) {
  await killPrcoess('simpleSeeder') // Kill the seeder process before reading the autobase
  const autobase = await getAutobaseInstance()
  await autobase.update()

  const view = autobase.view
  const deploymentKeys = {
    app,
    channel,
    ui: undefined,
    worker: undefined,
    errors: undefined
  }
  for (let i = 0; i < view.length; i++) {
    const entry = await view.get(i)
    if (entry) {
      try {
        const record = JSON.parse(entry.toString('utf8'))
        if (record.poc === app && record.channel === channel) {
          deploymentKeys.ui = record.uiPearKey
          deploymentKeys.worker = record.workerPearKey
        }
        break
      } catch (err) {
        logger.error(`Error parsing view entry: ${err.message}`)
      }
    }
  }

  if (!deploymentKeys.ui || !deploymentKeys.worker) {
    deploymentKeys.errors = ['No deployment keys found']
  }
  const pearCore = autobase.store.get({
    name: 'pearKeys',
    valueEncoding: 'utf8'
  })
  await pearCore.ready()
  const pearKeysHb = pearCore.key.toString('hex')

  await autobase.store.close()
  await autobase.close()
  autobaseInstance = null
  storeInstance = null

  runBackgroundSeeding(pearKeysHb)
  return deploymentKeys
}

module.exports = {
  updateAutobaseRecord,
  getOpenState,
  getAutobaseInstance,
  getCorestoreInstance,
  getPocDeploymentKeys
}
