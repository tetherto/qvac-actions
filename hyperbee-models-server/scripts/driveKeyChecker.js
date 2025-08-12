'use strict'

const Hyperdrive = require('hyperdrive')
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const getTmpDir = require('test-tmp')

async function checkInferenceConfig (drive, configPath = '/inference.config.json') {
  console.log(`\n🔍 Checking for ${configPath}...`)

  try {
    const configBuffer = await drive.get(configPath)
    if (configBuffer) {
      console.log(`✅ Found ${configPath}:`)
      console.log(`   Size: ${configBuffer.length} bytes`)

      try {
        const configContent = JSON.parse(configBuffer.toString())
        console.log('   Content:')
        console.log(`${JSON.stringify(configContent, null, 2)}`)
        return {
          found: true,
          path: configPath,
          size: configBuffer.length,
          content: configContent,
          isValidJson: true
        }
      } catch (parseError) {
        console.log('   Raw content (not valid JSON):')
        console.log(`${configBuffer.toString()}`)
        return {
          found: true,
          path: configPath,
          size: configBuffer.length,
          content: configBuffer.toString(),
          isValidJson: false
        }
      }
    } else {
      console.log(`❌ ${configPath} not found`)
      return { found: false, path: configPath }
    }
  } catch (error) {
    console.log(`❌ Error reading ${configPath}: ${error.message}`)
    return {
      found: false,
      path: configPath,
      error: error.message
    }
  }
}

async function checkDriveKey (driveKey, options = {}) {
  const {
    version = null,
    timeout = 10000,
    recursive = true,
    maxFiles = 100
  } = options

  console.log(`\n🔍 Checking drive key: ${driveKey}`)
  console.log(`   Version: ${version || 'latest'}`)
  console.log(`   Timeout: ${timeout}ms`)

  const tmpDir = await getTmpDir()
  const store = new Corestore(tmpDir)
  const swarm = new Hyperswarm()

  let connectionCount = 0
  let isReady = false

  try {
    // Set up connection handling
    swarm.on('connection', (conn) => {
      connectionCount++
      console.log(`📡 New connection (#${connectionCount})`)
      store.replicate(conn)
    })

    // Create hyperdrive client
    const client = new Hyperdrive(store, Buffer.from(driveKey, 'hex'))

    // Wait for ready with timeout
    await Promise.race([
      client.ready(),
      new Promise((resolve, reject) =>
        setTimeout(() => reject(new Error('Timeout waiting for drive to be ready')), timeout)
      )
    ])

    isReady = true
    console.log('✅ Drive is ready')
    console.log(`   Discovery key: ${client.discoveryKey.toString('hex')}`)
    console.log(`   Key: ${client.key.toString('hex')}`)
    console.log(`   Writable: ${client.writable}`)

    // Join swarm
    swarm.join(client.discoveryKey, { client: true, server: false })

    // Wait a bit for connections
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Get the correct version to check
    const driveToCheck = version ? client.checkout(version) : client

    // Check for config file using the helper function
    const inferenceConfig = await checkInferenceConfig(driveToCheck, options.configFile || '/inference.config.json')

    console.log('\n📁 Listing files from drive...')

    let fileCount = 0
    const files = []
    let inferenceConfigFound = false

    try {
      for await (const file of driveToCheck.list('/', { recursive })) {
        files.push(file)
        fileCount++

        // Track if we found inference.config.json in the listing
        if (file.key === '/inference.config.json') {
          inferenceConfigFound = true
        }

        if (fileCount <= 10) {
          const sizeInfo = file.value?.blob?.byteLength || file.value?.size || 'unknown'
          console.log(`   📄 ${file.key} (${sizeInfo} bytes)`)
        } else if (fileCount === 11) {
          console.log('   ... (showing first 10 files)')
        }

        if (fileCount >= maxFiles) {
          console.log(`   🛑 Stopped listing after ${maxFiles} files`)
          break
        }
      }

      console.log('\n📊 Summary:')
      console.log(`   Total files found: ${fileCount}`)
      console.log(`   Connections established: ${connectionCount}`)
      console.log(`   inference.config.json found: ${inferenceConfigFound ? 'Yes' : 'No'}`)

      return {
        success: true,
        driveKey,
        version,
        fileCount,
        connectionCount,
        files: files.slice(0, 10), // Return first 10 files
        discoveryKey: client.discoveryKey.toString('hex'),
        writable: client.writable,
        inferenceConfigFound,
        inferenceConfig
      }
    } catch (listError) {
      console.log(`❌ Error listing files: ${listError.message}`)
      return {
        success: false,
        error: `Failed to list files: ${listError.message}`,
        driveKey,
        version,
        connectionCount
      }
    }
  } catch (error) {
    console.log(`❌ Error checking drive: ${error.message}`)
    return {
      success: false,
      error: error.message,
      driveKey,
      version,
      connectionCount,
      isReady
    }
  } finally {
    // Cleanup
    await swarm.destroy()
    await store.close()
  }
}

async function checkMultipleDriveKeys (driveKeys, options = {}) {
  console.log(`🚀 Checking ${driveKeys.length} drive keys...\n`)

  const results = []

  for (let i = 0; i < driveKeys.length; i++) {
    const driveInfo = typeof driveKeys[i] === 'string'
      ? { key: driveKeys[i] }
      : driveKeys[i]

    console.log(`\n[${i + 1}/${driveKeys.length}] ==========================================`)

    const result = await checkDriveKey(driveInfo.key, {
      ...options,
      version: driveInfo.version || options.version
    })

    results.push(result)

    // Wait between checks to avoid overwhelming the network
    if (i < driveKeys.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  // Print summary
  console.log('\n\n📋 FINAL SUMMARY')
  console.log('==========================================')
  const successful = results.filter(r => r.success)
  const failed = results.filter(r => !r.success)

  console.log(`✅ Successful: ${successful.length}`)
  console.log(`❌ Failed: ${failed.length}`)

  if (failed.length > 0) {
    console.log('\n❌ Failed drives:')
    failed.forEach((result, i) => {
      console.log(`   ${i + 1}. ${result.driveKey.substring(0, 16)}... - ${result.error}`)
    })
  }

  return results
}

// Main function for CLI usage
async function main () {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.log(`
🔍 Drive Key Checker

Usage:
  node driveKeyChecker.js <driveKey1> [driveKey2] [driveKey3] ...
  node driveKeyChecker.js <driveKey> --version <version>

Options:
  --version <version>    Check specific version
  --timeout <ms>         Connection timeout (default: 10000)
  --max-files <number>   Maximum files to list (default: 100)
  --no-recursive         Don't list files recursively
  --config-file <path>   Check for specific config file (default: /inference.config.json)

Examples:
  node driveKeyChecker.js 7504626aaa534ac55d91b4b3067504774ae1457b03ddfbd86d817dd8cfbca8c8
  node driveKeyChecker.js key1 key2 key3
  node driveKeyChecker.js 7504626aaa534ac55d91b4b3067504774ae1457b03ddfbd86d817dd8cfbca8c8 --version 5
  node driveKeyChecker.js 7504626aaa534ac55d91b4b3067504774ae1457b03ddfbd86d817dd8cfbca8c8 --config-file /model.config.json
    `)
    process.exit(1)
  }

  // Parse arguments
  const driveKeys = []
  const options = {
    timeout: 10000,
    maxFiles: 100,
    recursive: true,
    configFile: '/inference.config.json'
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--version') {
      options.version = parseInt(args[++i])
    } else if (arg === '--timeout') {
      options.timeout = parseInt(args[++i])
    } else if (arg === '--max-files') {
      options.maxFiles = parseInt(args[++i])
    } else if (arg === '--no-recursive') {
      options.recursive = false
    } else if (arg === '--config-file') {
      options.configFile = args[++i]
    } else if (!arg.startsWith('--')) {
      driveKeys.push(arg)
    }
  }

  if (driveKeys.length === 1) {
    await checkDriveKey(driveKeys[0], options)
  } else {
    await checkMultipleDriveKeys(driveKeys, options)
  }
}

// Export functions for use as module
module.exports = {
  checkDriveKey,
  checkMultipleDriveKeys,
  checkInferenceConfig
}

// Run main if this script is executed directly
if (require.main === module) {
  main().catch(console.error)
}
