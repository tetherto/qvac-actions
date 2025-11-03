'use strict'

const Corestore = require('corestore')
const Hyperswarm = require('hyperswarm')
const Hyperbee = require('hyperbee')
const Hyperdrive = require('hyperdrive')
const fs = require('fs')
const path = require('path')
const logger = require('./logger')
const b4a = require('b4a')
const IdEnc = require('hypercore-id-encoding')
const goodbye = require('graceful-goodbye')
const process = require('bare-process')

const checkProgressInterval = 10_000

async function main () {
  try {
    // Get keys file from command line or use default
    const args = process.argv.slice(2)

    // Show usage if --help is provided
    if (args.includes('--help') || args.includes('-h')) {
      console.log(`
        Hyperdrive Seeder

        Usage:
          node seeder.js [keys-file]

        Arguments:
          keys-file    Path to keys file (default: ./keys.txt)

        Keys file format:
          - If first line starts with "bee ", it will be used as Hyperbee key
          - All other lines should be: modelKey driveKey
          - Empty lines are ignored

        Examples:
          node seeder.js                    # Use default keys.txt
          node seeder.js ./my-keys.txt      # Use custom keys file
          node seeder.js new-drive-keys.txt # Use recreated drive keys
      `)
      process.exit(0)
    }

    const keyFile = args[0] || path.join(__dirname, 'keys.txt')
    const blindPeersFile = path.join(__dirname, 'blind-peers.txt')

    if (!fs.existsSync(keyFile)) {
      logger.error(`Keys file not found: ${keyFile}`)
      process.exit(1)
    }

    logger.info(`Using keys file: ${keyFile}`)

    const fileContent = fs.readFileSync(keyFile, 'utf8')
    const lines = fileContent.split('\n').filter(line => line.trim().length > 0)

    const store = new Corestore('./storage')
    const swarm = new Hyperswarm()
    swarm.on('connection', (conn) => {
      store.replicate(conn)
      logger.info(`New Connection: ${b4a.toString(conn.remotePublicKey, 'hex')}`)
    })

    let db = null
    let startIndex = 0

    // Check if first line is a bee key
    if (lines.length > 0 && lines[0].startsWith('bee ')) {
      const beeKey = lines[0]
      const beeCore = store.get(b4a.from(beeKey.split(' ')[1], 'hex'))
      db = new Hyperbee(beeCore, { keyEncoding: 'utf-8', valueEncoding: 'binary' })
      await db.ready()

      const dbDiscovery = swarm.join(db.discoveryKey, { server: false, client: true })
      await dbDiscovery.flushed()
      logger.info(`DB discovery broadcasted: ${db.discoveryKey.toString('hex')}`)

      startIndex = 1 // Skip the bee line when processing drives
    } else {
      logger.info('No bee key found in file, proceeding with drives only')
    }

    const keys = lines.slice(startIndex)
    const drives = []
    for (const key of keys) {
      if (key.length > 1) {
        const [modelKey, driveKey] = key.split(' ')
        logger.info(`Seeding drive ${modelKey} with key ${driveKey}`)
        const drive = new Hyperdrive(store.namespace(modelKey), b4a.from(driveKey, 'hex'))
        await drive.ready()
        const driveDiscovery = swarm.join(drive.discoveryKey)
        await driveDiscovery.flushed()
        logger.info(`Seeding drive ${modelKey} with key ${driveKey}`)
        await drive.getBlobs() // ensure blobs loaded
        drives.push(drive)
      }
    }

    let blindPeers = null
    try {
      blindPeers = fs.readFileSync(blindPeersFile, 'utf-8').split('\n').filter(k => k.length > 1).map(k => IdEnc.normalize(k))
      logger.info(`Checking progress for blind peers:\n- ${blindPeers.join('\n- ')}`)
    } catch {
      logger.warn('Could not read blind-peers.txt, so cannot auto detect when the blind peers finished downloading the drives')
    }

    const intervalId = setInterval(() => {
      logger.info('Drives download progress overview')
      let nrDoneDrives = 0
      for (const drive of drives) {
        logger.info(`- ${IdEnc.normalize(drive.key)} overview`)
        let nrDoneDbBlindPeers = 0
        let nrDoneBlobsBlindPeers = 0

        logger.info('  - DB core:')
        for (const p of drive.db.core.replicator.peers) {
          const pubKey = IdEnc.normalize(p.remotePublicKey)
          if (!blindPeers || blindPeers.includes(pubKey)) { // If no blind peers specified: print overview of all peers
            const done = p.remoteLength > 0 && p.remoteContiguousLength === p.remoteLength
            if (blindPeers && done) nrDoneDbBlindPeers++
            logger.info('    -', IdEnc.normalize(p.remotePublicKey), done ? 'DONE' : 'DOWNLOADING', p.remoteContiguousLength, '/', p.remoteLength)
          }
        }

        logger.info('  - Blobs core:')
        for (const p of drive.blobs.core.replicator.peers) {
          const pubKey = IdEnc.normalize(p.remotePublicKey)
          if (!blindPeers || blindPeers.includes(pubKey)) { // If no blind peers specified: print overview of all peers
            const done = p.remoteLength > 0 && p.remoteContiguousLength === p.remoteLength
            if (blindPeers && done) nrDoneBlobsBlindPeers++
            logger.info('  -', IdEnc.normalize(p.remotePublicKey), done ? 'DONE' : 'DOWNLOADING', p.remoteContiguousLength, '/', p.remoteLength)
          }
        }
        if (blindPeers && nrDoneBlobsBlindPeers === blindPeers.length && nrDoneDbBlindPeers === blindPeers.length) nrDoneDrives++
      }

      if (blindPeers) {
        logger.info(`The blind peers have fully downloaded ${nrDoneDrives} of ${drives.length} drives`)
        if (nrDoneDrives === drives.length) {
          logger.info('The blind peers have fully downloaded all drives')
          goodbye.exit()
        }
      }
    }, checkProgressInterval)

    goodbye(async () => {
      logger.info('Shutting down...')
      clearInterval(intervalId)
      await swarm.destroy()
      await store.close()
    })

    logger.info(`Logging blind-peer download overview every ${checkProgressInterval / 1000} seconds.`)
    if (blindPeers) {
      logger.info('Will shut down when all drives are downloaded by all blind peers. Press ctrl-c to force shut down.')
    } else {
      logger.info('Will run indefinitely since no blind peers were specified. Press ctrl-c to exit.')
    }
  } catch (error) {
    logger.error(`Error in running replicator: ${error.stack}`)
  }
}

main()
