'use strict'

const RPC = require('@hyperswarm/rpc')
const Hyperbee = require('hyperbee')
const crypto = require('crypto')
const goodbye = require('graceful-goodbye')
const { getCorestoreInstance } = require('./src/services/store')
const { triggerDeploy, getState } = require('./src/methods')

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
      console.log('triggerDeploy called with params:', params)
      const result = await triggerDeploy(params)
      return Buffer.from(JSON.stringify(result))
    } catch (error) {
      console.error('Error in RPC triggerDeploy:', error)
      return Buffer.from(JSON.stringify({ error: error.message }))
    }
  })

  rpcServer.respond('getState', async () => {
    try {
      console.log('getState called')
      const state = await getState()
      return Buffer.from(JSON.stringify(state))
    } catch (error) {
      console.error('Error in RPC getState:', error)
      return Buffer.from(JSON.stringify({ error: error.message }))
    }
  })

  console.log(
    'RPC server listening on public key:',
    rpcServer.publicKey.toString('hex')
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
  console.error('RPC server error:', err)
  process.exit(1)
})
