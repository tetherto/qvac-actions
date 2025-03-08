'use strict'

const Hyperbee = require('hyperbee')
const Hypercore = require('hypercore')
const RAM = require('random-access-memory')
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const Hyperdrive = require('hyperdrive')

async function main () {
  const core = new Hypercore(RAM, Buffer.from('611120d7cb0b5cd6ba42766ebfd642f50a837799785bfe9db19114cd00b1aece', 'hex'))
  const db = new Hyperbee(core, { keyEncoding: 'utf-8', valueEncoding: 'binary' })
  await db.ready()
  const swarm = new Hyperswarm()
  swarm.on('connection', (conn) => {
    console.log('new connection')
    db.replicate(conn)
  })

  const foundPeers = db.core.findingPeers()

  swarm.join(db.discoveryKey, { client: true, server: false })

  // Awaiting this promise is unnecessary and slow
  swarm.flush()

  foundPeers()

  await new Promise(resolve => setTimeout(resolve, 5000))
  // Read all entries
  const driveKeys = []
  for await (const entry of db.createReadStream()) {
    console.log(JSON.stringify(entry))
    const value = JSON.parse(entry.value.toString())
    console.log('value', value)
    driveKeys.push(value.key)
  }

  for (let i = 0; i < driveKeys.length; i++) {
    await checkHyperdrive(driveKeys[i])
    console.log(`checking next hyperdrive ${i + 1} of ${driveKeys.length}`)
  }
}

async function checkHyperdrive (driveKey) {
  const store = new Corestore(RAM)
  const swarm = new Hyperswarm()
  swarm.on('connection', (conn) => {
    console.log('new connection')
    store.replicate(conn)
  })
  const client = new Hyperdrive(store, driveKey)
  await client.ready()

  const foundPeers = store.findingPeers()

  swarm.join(client.discoveryKey, { client: true, server: false })

  // Awaiting this promise is unnecessary and slow
  swarm.flush()

  foundPeers()

  await new Promise(resolve => setTimeout(resolve, 5000))
  for await (const file of client.list('/', { recursive: true })) {
    console.log('list', file) // => { key, value }
  }
}

main().catch(console.error)
