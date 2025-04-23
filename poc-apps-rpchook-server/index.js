'use strict'

const RPC = require('@hyperswarm/rpc')
const Hyperbee = require('hyperbee')
const crypto = require('crypto')
const goodbye = require('graceful-goodbye')
const { getCorestoreInstance } = require('./services/store')
const { triggerDeploy, getState } = require('./methods')
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

  logger.info(
    `RPC server listening on public key: ${rpcServer.publicKey.toString('hex')}`
  )

  goodbye(() => {
    if (rpcServer && typeof rpcServer.close === 'function') {
      rpcServer.close()
    }
    if (store && typeof store.close === 'function') {
      store.close()
    }
    console.log('Graceful shutdown complete')
  })
}

main().catch((err) => {
  logger.error(`RPC server error: ${err.message}`)
  process.exit(1)
})
