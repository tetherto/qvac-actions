'use strict'

const Hyperbee = require('hyperbee')
const Hypercore = require('hypercore')
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const Hyperdrive = require('hyperdrive')
const getTmpDir = require('test-tmp')

async function main () {
  const tmpDir = await getTmpDir()
  const core = new Hypercore(tmpDir, Buffer.from('ffe2d68e4b08491ce66547562609b27170cdbf5d27d597435b055120470a8fe1', 'hex'))
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
    driveKeys.push({ key: value.key, version: value.driveVersion })
  }

  for (let i = 0; i < driveKeys.length; i++) {
    await checkHyperdrive(driveKeys[i].key, driveKeys[i].version)
    console.log(`checking next hyperdrive ${i + 1} of ${driveKeys.length}`)
  }
}

async function checkHyperdrive (driveKey, version) {
  const tmpDir = await getTmpDir()
  const store = new Corestore(tmpDir)
  const swarm = new Hyperswarm()
  swarm.on('connection', (conn) => {
    console.log('new connection')
    store.replicate(conn)
  })
  const client = new Hyperdrive(store, driveKey)
  await client.ready()
  swarm.join(client.discoveryKey, { client: true, server: false })

  const co = client.checkout(version)
  for await (const file of co.list('/', { recursive: true })) {
    console.log('list', file) // => { key, value }
  }
}

main().catch(console.error)
