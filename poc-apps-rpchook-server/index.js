'use strict'

const RPC = require('@hyperswarm/rpc')
const Hyperbee = require('hyperbee')
const crypto = require('crypto')
const { getCorestoreInstance } = require('./services/store')
const { triggerDeploy, getState, getDeploymentKeys } = require('./methods')
const logger = require('./logger')

async function main () {
  const store = await getCorestoreInstance()
  const hcore = store.get({ name: 'rpc', valueEncoding: 'binary' })
  await hcore.ready()
  const hbee = new Hyperbee(hcore, { keyEncoding: 'utf-8', valueEncoding: 'binary' })
  await hbee.ready()

  const rpcSeedEntry = await hbee.get('rpc-seed')
  let rpcSeed = rpcSeedEntry ? rpcSeedEntry.value : null
  if (!rpcSeed) {
    rpcSeed = crypto.randomBytes(32)
    await hbee.put('rpc-seed', rpcSeed)
  }

  const rpc = new RPC({ seed: rpcSeed })
  const rpcServer = rpc.createServer()
  await rpcServer.listen()

  rpcServer.respond('triggerDeploy', async (data) => {
    try {
      const params = JSON.parse(data.toString())
      logger.info(`triggerDeploy called with params: ${JSON.stringify(params)}`)
      const result = await triggerDeploy(params)
      return Buffer.from(JSON.stringify(result))
    } catch (error) {
      logger.error(`Error in RPC triggerDeploy: ${error.message}`)
      return Buffer.from(JSON.stringify({ error: error.message }))
    }
  })

  rpcServer.respond('getState', async () => {
    try {
      const state = await getState()
      return Buffer.from(JSON.stringify(state))
    } catch (error) {
      logger.error(`Error in RPC getState: ${error.message}`)
      return Buffer.from(JSON.stringify({ error: error.message }))
    }
  })

  rpcServer.respond('getDeploymentKeys', async (data) => {
    try {
      const params = JSON.parse(data.toString())
      const result = await getDeploymentKeys(params)
      return Buffer.from(JSON.stringify(result))
    } catch (error) {
      logger.error(`Error in RPC getDeploymentKeys: ${error.message}`)
      return Buffer.from(JSON.stringify({ error: error.message }))
    }
  })

  logger.info(
    `RPC server listening on public key: ${rpcServer.publicKey.toString('hex')}`
  )

  function handleCleanUp (signal) {
    return async () => {
      logger.info(`Shutdown requested (${signal})`)
      if (rpcServer && typeof rpcServer.close === 'function') {
        try {
          await rpcServer.close()
        } catch (err) {
          logger.error(`Error closing RPC server: ${err.message}`)
        }
      }
      if (store && typeof store.close === 'function') {
        try {
          await store.close()
        } catch (err) {
          logger.error(`Error closing store: ${err.message}`)
        }
      }
      logger.info('Cleanup complete, exiting now')
      process.exit(0)
    }
  }

  process.on('SIGINT', handleCleanUp('SIGINT'))
  process.on('SIGTERM', handleCleanUp('SIGTERM'))
  process.on('uncaughtException', handleCleanUp('uncaughtException'))
}

main().catch((err) => {
  logger.error(`RPC server error: ${err.message}`)
  process.exit(1)
})
