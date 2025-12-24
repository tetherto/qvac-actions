'use strict'

const Hyperdrive = require('hyperdrive')
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const getTmpDir = require('test-tmp')
const fs = require('fs')
const path = require('path')
const { calculateDirectoryChecksums } = require('../utils')

async function downloadAndCalculateChecksums (drive, driveKey, options = {}) {
  const { downloadPath = null } = options

  console.log('\n🔽 Downloading all files from drive...')

  // Create a subdirectory for this specific drive
  const baseDir = downloadPath || await getTmpDir()
  const driveSubdir = `drive-${driveKey.substring(0, 8)}`
  const tmpDir = path.join(baseDir, driveSubdir)

  console.log(`   Download directory: ${tmpDir}`)

  // Create directory if it doesn't exist
  await fs.promises.mkdir(tmpDir, { recursive: true })

  // Download all files from drive
  let downloadedCount = 0
  try {
    for await (const file of drive.list('/', { recursive: true })) {
      if (file.value) { // Only process files, not directories
        const filePath = file.key
        const fileName = filePath.startsWith('/') ? filePath.slice(1) : filePath
        const localPath = path.join(tmpDir, fileName)

        // Create subdirectories if needed
        const dir = path.dirname(localPath)
        await fs.promises.mkdir(dir, { recursive: true })

        // Download file
        console.log(`   Downloading: ${fileName}`)

        // Get file size from file.value
        const fileSize = file.value?.blob?.byteLength || file.value?.size || 0
        const MAX_BUFFER_SIZE = 4 * 1024 * 1024 * 1024 - 1 // 4GB - 1 byte

        if (fileSize > MAX_BUFFER_SIZE) {
          console.log(`   ⚠️  Large file detected (${(fileSize / 1024 / 1024 / 1024).toFixed(2)} GB), using streaming...`)

          // Use streaming for large files
          const writeStream = fs.createWriteStream(localPath)
          const readStream = drive.createReadStream(filePath)

          await new Promise((resolve, reject) => {
            readStream.pipe(writeStream)

            writeStream.on('finish', () => {
              console.log('   ✅ Streamed download complete')
              resolve()
            })

            writeStream.on('error', reject)
            readStream.on('error', reject)
          })
        } else {
          // Use buffer method for smaller files
          const fileBuffer = await drive.get(filePath)
          if (fileBuffer) {
            await fs.promises.writeFile(localPath, fileBuffer)
          }
        }

        downloadedCount++
      }
    }

    console.log(`   ✅ Downloaded ${downloadedCount} files`)

    // Calculate checksums for all downloaded files
    console.log('\n📊 Calculating checksums...')
    const checksums = await calculateDirectoryChecksums(tmpDir, ['inference.config.json', '.s3-fingerprint', '.s3-fingerprints.json'])

    console.log('\n📋 File Checksums:')
    checksums.forEach((file, index) => {
      console.log(`   ${index + 1}. ${file.filename}`)
      console.log(`      Checksum: ${file.checksum}`)
      console.log(`      Size: ${file.expectedSize} bytes`)
    })

    return {
      success: true,
      downloadPath: tmpDir,
      downloadedCount,
      checksums
    }
  } catch (error) {
    console.log(`   ❌ Error downloading files: ${error.message}`)
    return {
      success: false,
      error: error.message,
      downloadPath: tmpDir,
      downloadedCount
    }
  }
}

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

    swarm.flush()

    await new Promise(resolve => setTimeout(resolve, 3000))

    // Get the correct version to check
    const driveToCheck = version ? client.checkout(version) : client
    console.log(`   Drive checked out version: ${driveToCheck.version}`)

    // Check for config file using the helper function
    const inferenceConfig = await checkInferenceConfig(driveToCheck, options.configFile || '/inference.config.json')

    // Download and calculate checksums if requested
    let downloadResult = null
    if (options.download) {
      downloadResult = await downloadAndCalculateChecksums(driveToCheck, driveKey, {
        downloadPath: options.downloadPath
      })
    }

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
        inferenceConfig,
        downloadResult
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
  const checksumResults = []

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

    // If download was requested and successful, collect checksum data
    if (options.download && result.downloadResult && result.downloadResult.checksums) {
      checksumResults.push({
        driveKey: driveInfo.key,
        driveMetadata: result.downloadResult.checksums
      })
    }

    // Wait between checks to avoid overwhelming the network
    if (i < driveKeys.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  // Save checksums to JSON file if download was requested
  if (options.download && checksumResults.length > 0) {
    const outputPath = path.join(options.downloadPath || '.', 'drive-checksums.json')
    await fs.promises.writeFile(
      outputPath,
      JSON.stringify(checksumResults, null, 2)
    )
    console.log(`\n💾 Checksums saved to: ${outputPath}`)
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

  return { results, checksumResults }
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
  --download             Download all files and calculate checksums
  --download-path <path> Directory to download files to (uses temp dir if not specified)

Examples:
  node driveKeyChecker.js 7504626aaa534ac55d91b4b3067504774ae1457b03ddfbd86d817dd8cfbca8c8
  node driveKeyChecker.js key1 key2 key3
  node driveKeyChecker.js 7504626aaa534ac55d91b4b3067504774ae1457b03ddfbd86d817dd8cfbca8c8 --version 5
  node driveKeyChecker.js 7504626aaa534ac55d91b4b3067504774ae1457b03ddfbd86d817dd8cfbca8c8 --config-file /model.config.json
  node driveKeyChecker.js 7504626aaa534ac55d91b4b3067504774ae1457b03ddfbd86d817dd8cfbca8c8 --download
  node driveKeyChecker.js 7504626aaa534ac55d91b4b3067504774ae1457b03ddfbd86d817dd8cfbca8c8 --download --download-path ./downloads
    `)
    process.exit(1)
  }

  // Parse arguments
  const driveKeys = []
  const options = {
    timeout: 10000,
    maxFiles: 100,
    recursive: true,
    configFile: '/inference.config.json',
    download: false,
    downloadPath: null
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
    } else if (arg === '--download') {
      options.download = true
    } else if (arg === '--download-path') {
      options.downloadPath = args[++i]
    } else if (!arg.startsWith('--')) {
      driveKeys.push(arg)
    }
  }

  if (driveKeys.length === 1) {
    const result = await checkDriveKey(driveKeys[0], options)

    // Save checksums to JSON file if download was requested
    if (options.download && result.downloadResult && result.downloadResult.checksums) {
      const checksumResults = [{
        driveKey: driveKeys[0],
        driveMetadata: result.downloadResult.checksums
      }]
      const outputPath = path.join(options.downloadPath || '.', 'drive-checksums.json')
      await fs.promises.writeFile(
        outputPath,
        JSON.stringify(checksumResults, null, 2)
      )
      console.log(`\n💾 Checksums saved to: ${outputPath}`)
    }
  } else {
    await checkMultipleDriveKeys(driveKeys, options)
  }
}

// Export functions for use as module
module.exports = {
  checkDriveKey,
  checkMultipleDriveKeys,
  checkInferenceConfig,
  downloadAndCalculateChecksums
}

// Run main if this script is executed directly
if (require.main === module) {
  main().catch(console.error)
}
