'use strict'

const Corestore = require('corestore')
const crypto = require('crypto')

const seed = process.env.CORESTORE_SEED || 'default-seed-for-development'
const primaryKey = crypto.createHash('sha256').update(seed).digest()

let storeInstance = null

/**
 * Initializes and returns a singleton Corestore instance.
 * @param {Corestore} [store] - An existing Corestore instance.
 * @returns {Promise<Corestore>} - The Corestore instance.
 */
async function getCorestoreInstance (store) {
  if (store) {
    storeInstance = store
  }

  if (storeInstance && storeInstance.closed) {
    storeInstance = null
  }

  if (storeInstance) {
    await storeInstance.ready()
    return storeInstance
  }

  storeInstance = new Corestore('./storage', { primaryKey })
  await storeInstance.ready()
  return storeInstance
}

module.exports = {
  getCorestoreInstance
}
