'use strict'

const Corestore = require('corestore')
const Hyperswarm = require('hyperswarm')
const Hyperbee = require('hyperbee')
const Hyperdrive = require('hyperdrive')
const fs = require('fs')
const path = require('path')
const logger = require('../logger')
const b4a = require('b4a')

const keyFile = path.join(__dirname, 'keys.txt')

async function main () {
  try {
    const beeKey = fs.readFileSync(keyFile, 'utf8').split('\n')[0] // first line of keys.txt is the bee key

    const store = new Corestore('./storage')
    const beeCore = store.get(b4a.from(beeKey.split(' ')[1], 'hex'))
    const db = new Hyperbee(beeCore, { keyEncoding: 'utf-8', valueEncoding: 'binary' })
    await db.ready()

    const swarm = new Hyperswarm()
    swarm.on('connection', (conn) => {
      store.replicate(conn)
      logger.info(`New Connection: ${b4a.toString(conn.remotePublicKey, 'hex')}`)
    })

    const dbDiscovery = swarm.join(db.discoveryKey)
    await dbDiscovery.flushed()
    logger.info(`DB discovery broadcasted: ${db.discoveryKey.toString('hex')}`)

    const keys = fs.readFileSync(keyFile, 'utf8').split('\n').slice(1)
    for (const key of keys) {
      if (key.length > 1) {
        const [modelKey, driveKey] = key.split(' ')
        const drive = new Hyperdrive(store.namespace(modelKey), b4a.from(driveKey, 'hex'))
        await drive.ready()
        const driveDiscovery = swarm.join(drive.discoveryKey)
        await driveDiscovery.flushed()
        logger.info(`Drive ${modelKey} discovery broadcasted`)
      }
    }
  } catch (error) {
    logger.error(`Error in running replicator: ${error.stack}`)
  }
}

main()
