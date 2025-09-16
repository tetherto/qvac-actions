'use strict'

const Hyperbee = require('hyperbee')
const Hypercore = require('hypercore')
const Hyperswarm = require('hyperswarm')
const getTmpDir = require('test-tmp')

async function checkHyperbeeKey (beeKey, keyToCheck, options = {}) {
  const {
    timeout = 10000,
    encoding = { keyEncoding: 'utf-8', valueEncoding: 'binary' }
  } = options

  console.log(`\n🔍 Checking Hyperbee key: ${keyToCheck}`)
  console.log(`   Bee Key: ${beeKey}`)
  console.log(`   Timeout: ${timeout}ms`)

  const tmpDir = await getTmpDir()
  const core = new Hypercore(tmpDir, Buffer.from(beeKey, 'hex'))
  const db = new Hyperbee(core, encoding)
  const swarm = new Hyperswarm()

  let connectionCount = 0
  let isReady = false

  try {
    // Set up connection handling
    swarm.on('connection', (conn) => {
      connectionCount++
      console.log(`📡 New connection (#${connectionCount})`)
      db.replicate(conn)
    })

    // Wait for database to be ready with timeout
    await Promise.race([
      db.ready(),
      new Promise((resolve, reject) =>
        setTimeout(() => reject(new Error('Timeout waiting for database to be ready')), timeout)
      )
    ])

    isReady = true
    console.log('✅ Database is ready')
    console.log(`   Discovery key: ${db.discoveryKey.toString('hex')}`)
    console.log(`   Core key: ${db.core.key.toString('hex')}`)
    console.log(`   Writable: ${db.writable}`)

    // Join swarm for peer discovery
    const foundPeers = db.core.findingPeers()
    swarm.join(db.discoveryKey, { client: true, server: false })
    swarm.flush()
    foundPeers()

    // Wait a bit for connections
    await new Promise(resolve => setTimeout(resolve, 2000))

    await db.get(0) // This ensures the database is ready

    console.log(`\n🔑 Looking up key: "${keyToCheck}"`)

    try {
      const entry = await db.get(keyToCheck)

      if (entry) {
        console.log('✅ Key found!')
        console.log(`   Key: ${entry.key}`)
        console.log(`   Seq: ${entry.seq}`)

        // Try to parse value as JSON, fallback to string representation
        let valueDisplay
        try {
          if (encoding.valueEncoding === 'binary') {
            const valueStr = entry.value.toString()
            try {
              const parsed = JSON.parse(valueStr)
              valueDisplay = JSON.stringify(parsed, null, 2)
            } catch {
              valueDisplay = valueStr
            }
          } else {
            valueDisplay = typeof entry.value === 'object'
              ? JSON.stringify(entry.value, null, 2)
              : String(entry.value)
          }
        } catch (error) {
          valueDisplay = `[Error displaying value: ${error.message}]`
        }

        console.log('   Value:')
        console.log(`${valueDisplay}`)

        return {
          success: true,
          beeKey,
          keyToCheck,
          found: true,
          entry: {
            key: entry.key,
            seq: entry.seq,
            value: entry.value
          },
          connectionCount,
          discoveryKey: db.discoveryKey.toString('hex')
        }
      } else {
        console.log('❌ Key not found')

        return {
          success: true,
          beeKey,
          keyToCheck,
          found: false,
          connectionCount,
          discoveryKey: db.discoveryKey.toString('hex')
        }
      }
    } catch (getError) {
      console.log(`❌ Error getting key: ${getError.message}`)
      return {
        success: false,
        error: `Failed to get key: ${getError.message}`,
        beeKey,
        keyToCheck,
        connectionCount
      }
    }
  } catch (error) {
    console.log(`❌ Error checking Hyperbee: ${error.message}`)
    return {
      success: false,
      error: error.message,
      beeKey,
      keyToCheck,
      connectionCount,
      isReady
    }
  } finally {
    // Cleanup
    await swarm.destroy()
    await db.close()
  }
}

async function checkMultipleKeys (beeKey, keys, options = {}) {
  console.log(`🚀 Checking ${keys.length} keys in Hyperbee...\n`)
  console.log(`   Bee Key: ${beeKey}`)

  const results = []

  for (let i = 0; i < keys.length; i++) {
    console.log(`\n[${i + 1}/${keys.length}] ==========================================`)

    const result = await checkHyperbeeKey(beeKey, keys[i], options)
    results.push(result)

    // Wait between checks to avoid overwhelming the network
    if (i < keys.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  // Print summary
  console.log('\n\n📋 FINAL SUMMARY')
  console.log('==========================================')
  const successful = results.filter(r => r.success)
  const failed = results.filter(r => !r.success)
  const found = results.filter(r => r.success && r.found)
  const notFound = results.filter(r => r.success && !r.found)

  console.log(`✅ Successful lookups: ${successful.length}`)
  console.log(`🔍 Keys found: ${found.length}`)
  console.log(`❓ Keys not found: ${notFound.length}`)
  console.log(`❌ Failed lookups: ${failed.length}`)

  if (found.length > 0) {
    console.log('\n✅ Found keys:')
    found.forEach((result, i) => {
      console.log(`   ${i + 1}. "${result.keyToCheck}"`)
    })
  }

  if (notFound.length > 0) {
    console.log('\n❓ Not found keys:')
    notFound.forEach((result, i) => {
      console.log(`   ${i + 1}. "${result.keyToCheck}"`)
    })
  }

  if (failed.length > 0) {
    console.log('\n❌ Failed lookups:')
    failed.forEach((result, i) => {
      console.log(`   ${i + 1}. "${result.keyToCheck}" - ${result.error}`)
    })
  }

  return results
}

async function listAllEntries (beeKey, options = {}) {
  const {
    timeout = 10000,
    encoding = { keyEncoding: 'utf-8', valueEncoding: 'binary' },
    maxEntries = 20
  } = options

  console.log('\n📋 Listing all entries in Hyperbee')
  console.log(`   Bee Key: ${beeKey}`)
  console.log(`   Max entries: ${maxEntries}`)

  const tmpDir = await getTmpDir()
  const core = new Hypercore(tmpDir, Buffer.from(beeKey, 'hex'))
  const db = new Hyperbee(core, encoding)
  const swarm = new Hyperswarm()

  let connectionCount = 0

  try {
    swarm.on('connection', (conn) => {
      connectionCount++
      console.log(`📡 New connection (#${connectionCount})`)
      db.replicate(conn)
    })

    await Promise.race([
      db.ready(),
      new Promise((resolve, reject) =>
        setTimeout(() => reject(new Error('Timeout waiting for database to be ready')), timeout)
      )
    ])

    console.log('✅ Database is ready')

    const foundPeers = db.core.findingPeers()
    swarm.join(db.discoveryKey, { client: true, server: false })
    swarm.flush()
    foundPeers()

    await new Promise(resolve => setTimeout(resolve, 3000))

    console.log('\n📄 Entries:')
    const entries = []
    let count = 0

    for await (const entry of db.createReadStream()) {
      count++
      entries.push(entry)

      if (count <= maxEntries) {
        let valuePreview
        try {
          if (encoding.valueEncoding === 'binary') {
            const valueStr = entry.value.toString()
            try {
              const parsed = JSON.parse(valueStr)
              valuePreview = JSON.stringify(parsed).substring(0, 100)
            } catch {
              valuePreview = valueStr.substring(0, 100)
            }
          } else {
            valuePreview = String(entry.value).substring(0, 100)
          }
          if (valuePreview.length === 100) valuePreview += '...'
        } catch {
          valuePreview = '[Error reading value]'
        }

        console.log(`   ${count}. "${entry.key}" = ${valuePreview}`)
      } else {
        console.log(`   🛑 Stopped after ${maxEntries} entries`)
        break
      }
    }

    console.log('\n📊 Summary:')
    console.log(`   Total entries: ${count}`)
    console.log(`   Connections: ${connectionCount}`)

    return {
      success: true,
      beeKey,
      entryCount: count,
      entries: entries.slice(0, 20),
      connectionCount
    }
  } catch (error) {
    console.log(`❌ Error listing entries: ${error.message}`)
    return {
      success: false,
      error: error.message,
      beeKey,
      connectionCount
    }
  } finally {
    await swarm.destroy()
    await db.close()
  }
}

// Main function for CLI usage
async function main () {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.log(`
🔍 Hyperbee Key Checker

Usage:
  node hyperbeeKeyChecker.js <beeKey> <key1> [key2] [key3] ...
  node hyperbeeKeyChecker.js <beeKey> --list-all
  node hyperbeeKeyChecker.js <beeKey> --key <keyToCheck>

Options:
  --list-all                 List all entries in the database
  --key <key>               Check a specific key
  --timeout <ms>            Connection timeout (default: 10000)
  --max-entries <number>    Maximum entries to list (default: 100)
  --key-encoding <encoding> Key encoding (default: utf-8)
  --value-encoding <enc>    Value encoding (default: binary)

Examples:
  node hyperbeeKeyChecker.js 7504626aaa534ac55d91b4b3067504774ae1457b03ddfbd86d817dd8cfbca8c8 "some-key"
  node hyperbeeKeyChecker.js 7504626aaa534ac55d91b4b3067504774ae1457b03ddfbd86d817dd8cfbca8c8 key1 key2 key3
  node hyperbeeKeyChecker.js 7504626aaa534ac55d91b4b3067504774ae1457b03ddfbd86d817dd8cfbca8c8 --list-all
  node hyperbeeKeyChecker.js 7504626aaa534ac55d91b4b3067504774ae1457b03ddfbd86d817dd8cfbca8c8 --key "specific-key"
    `)
    process.exit(1)
  }

  const beeKey = args[0]
  if (!beeKey || beeKey.startsWith('--')) {
    console.error('❌ First argument must be the Hyperbee key')
    process.exit(1)
  }

  // Parse arguments
  const keys = []
  const options = {
    timeout: 10000,
    maxEntries: 100,
    encoding: {
      keyEncoding: 'utf-8',
      valueEncoding: 'binary'
    }
  }

  let listAll = false

  for (let i = 1; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--list-all') {
      listAll = true
    } else if (arg === '--key') {
      keys.push(args[++i])
    } else if (arg === '--timeout') {
      options.timeout = parseInt(args[++i])
    } else if (arg === '--max-entries') {
      options.maxEntries = parseInt(args[++i])
    } else if (arg === '--key-encoding') {
      options.encoding.keyEncoding = args[++i]
    } else if (arg === '--value-encoding') {
      options.encoding.valueEncoding = args[++i]
    } else if (!arg.startsWith('--')) {
      keys.push(arg)
    }
  }

  if (listAll) {
    await listAllEntries(beeKey, options)
  } else if (keys.length === 0) {
    console.error('❌ No keys provided. Use --list-all to list all entries or provide keys to check.')
    process.exit(1)
  } else if (keys.length === 1) {
    await checkHyperbeeKey(beeKey, keys[0], options)
  } else {
    await checkMultipleKeys(beeKey, keys, options)
  }
}

// Export functions for use as module
module.exports = {
  checkHyperbeeKey,
  checkMultipleKeys,
  listAllEntries
}

// Run main if this script is executed directly
if (require.main === module) {
  main().catch(console.error)
}
