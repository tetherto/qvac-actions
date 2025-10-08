'use strict'

const fs = require('fs')
const path = require('path')
const Hyperdrive = require('hyperdrive')
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const { getCorestoreInstance } = require('../store')
const { syncDrive, copyLicenseFiles } = require('../drive')
const { generateModelKey } = require('../utils')
const logger = require('../logger')

async function downloadDrive (driveKey, targetDir) {
  console.log(`\n📥 Downloading drive ${driveKey.substring(0, 16)}...`)

  const store = new Corestore(await require('test-tmp')())
  const swarm = new Hyperswarm()

  try {
    swarm.on('connection', (conn) => {
      store.replicate(conn)
    })

    const drive = new Hyperdrive(store, Buffer.from(driveKey, 'hex'))
    await drive.ready()

    swarm.join(drive.discoveryKey, { client: true, server: false })
    await swarm.flush()

    // Wait for initial connections
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Create target directory
    await fs.promises.mkdir(targetDir, { recursive: true })

    // Download all files
    let downloadedCount = 0
    const downloadedFiles = []

    for await (const file of drive.list('/', { recursive: true })) {
      if (file.value) {
        const filePath = file.key
        const fileName = filePath.startsWith('/') ? filePath.slice(1) : filePath
        const localPath = path.join(targetDir, fileName)

        // Create subdirectories if needed
        const dir = path.dirname(localPath)
        await fs.promises.mkdir(dir, { recursive: true })

        console.log(`   📄 Downloading: ${fileName}`)

        const fileBuffer = await drive.get(filePath)
        if (fileBuffer) {
          await fs.promises.writeFile(localPath, fileBuffer)
          downloadedCount++
          downloadedFiles.push({ fileName, localPath })
        }
      }
    }

    console.log(`   ✅ Downloaded ${downloadedCount} files`)

    // Delete old LICENSE files
    console.log('\n🗑️  Removing old license files...')
    let deletedCount = 0
    for (const { fileName, localPath } of downloadedFiles) {
      if (fileName.startsWith('LICENSE-') && fileName.endsWith('.txt')) {
        try {
          await fs.promises.unlink(localPath)
          console.log(`   ❌ Deleted: ${fileName}`)
          deletedCount++
        } catch (error) {
          console.error(`   ⚠️  Failed to delete ${fileName}: ${error.message}`)
        }
      }
    }
    if (deletedCount > 0) {
      console.log(`   ✅ Removed ${deletedCount} old license files`)
    } else {
      console.log('   ℹ️  No old license files found')
    }

    return downloadedCount
  } finally {
    await swarm.destroy()
    await store.close()
  }
}

async function recreateDriveWithLicense (driveConfig, outputDir) {
  const { driveKey, license, addon, tags } = driveConfig

  if (!driveKey) {
    throw new Error('Drive config must have a driveKey')
  }

  if (!license || license.length === 0) {
    throw new Error('Drive config must have at least one license')
  }

  if (!addon) {
    throw new Error('Drive config must have an addon')
  }

  if (!tags) {
    throw new Error('Drive config must have tags')
  }

  // Generate proper model key using the same format as the system
  const modelKey = generateModelKey(tags)
  const modelDir = path.join(outputDir, modelKey)

  console.log(`\n🔄 Processing drive: ${modelKey}`)
  console.log(`   Source drive: ${driveKey}`)
  console.log(`   Addon: ${addon}`)
  console.log(`   Licenses: ${license.join(', ')}`)

  // Step 1: Download drive contents
  await downloadDrive(driveKey, modelDir)

  // Step 2: Add license files
  console.log('\n📜 Adding license files...')
  await copyLicenseFiles(license, modelDir)

  // Step 3: Create new drive
  console.log('\n🚀 Creating new drive...')
  const store = await getCorestoreInstance()
  const newDrive = await syncDrive(store, modelKey, modelDir)

  const newDriveKey = newDrive.key.toString('hex')
  console.log(`   ✅ New drive created: ${newDriveKey}`)

  await store.close()

  return {
    originalDriveKey: driveKey,
    newDriveKey,
    modelKey,
    modelDir,
    license,
    addon
  }
}

async function main () {
  const args = process.argv.slice(2)

  if (args.length < 1) {
    console.log(`
🔄 RECREATE DRIVES WITH LICENSE

This tool downloads existing drives, adds license files, and creates new drives.

Usage:
  node recreateDrivesWithLicense.js <config.json> [options]

Options:
  --output <dir>     Output directory for downloaded models (default: ./recreated-drives)
  --keys-file <file> File to save new drive keys (default: ./new-drive-keys.txt)

Config format:
{
  "drives": [
    {
      "driveKey": "existing-drive-key",
      "addon": "@qvac/addon-name",
      "license": ["MIT"],
      "tags": {
        "function": "generation",
        "type": "instruct",
        "name": "model-name",
        "externalVersion": "1.0.0",
        "params": "2B",
        "quantization": "q8",
        "internalVersion": "1.0.0",
        "other": ""
      }
    }
  ]
}

Example:
  node recreateDrivesWithLicense.js config.json --output ./new-drives
    `)
    process.exit(1)
  }

  // Parse arguments
  const configPath = args[0]
  let outputDir = './recreated-drives'
  let keysFile = './new-drive-keys.txt'

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
      outputDir = args[++i]
    } else if (args[i] === '--keys-file' && args[i + 1]) {
      keysFile = args[++i]
    }
  }

  // Load config
  const config = JSON.parse(await fs.promises.readFile(configPath, 'utf8'))

  if (!config.drives || !Array.isArray(config.drives)) {
    console.error('❌ Config must have a "drives" array')
    process.exit(1)
  }

  console.log('🚀 STARTING DRIVE RECREATION')
  console.log('==========================================')
  console.log(`📁 Output directory: ${outputDir}`)
  console.log(`📄 Keys file: ${keysFile}`)
  console.log(`🔢 Drives to process: ${config.drives.length}`)
  console.log('==========================================')

  // Create output directory
  await fs.promises.mkdir(outputDir, { recursive: true })

  // Clear keys file
  await fs.promises.writeFile(keysFile, '')

  const results = []

  for (let i = 0; i < config.drives.length; i++) {
    const driveConfig = config.drives[i]

    console.log(`\n[${i + 1}/${config.drives.length}] ==========================================`)

    try {
      const result = await recreateDriveWithLicense(driveConfig, outputDir)
      results.push(result)

      // Append to keys file
      await fs.promises.appendFile(
        keysFile,
        `${result.modelKey} ${result.newDriveKey}\n`
      )

      console.log('✅ Drive recreation successful!')
    } catch (error) {
      console.error(`❌ Error processing drive: ${error.message}`)
      results.push({
        originalDriveKey: driveConfig.driveKey,
        error: error.message
      })
    }

    // Small delay between drives
    if (i < config.drives.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  // Summary
  console.log('\n\n📊 SUMMARY')
  console.log('==========================================')
  const successful = results.filter(r => !r.error)
  const failed = results.filter(r => r.error)

  console.log(`✅ Successful: ${successful.length}`)
  console.log(`❌ Failed: ${failed.length}`)

  if (successful.length > 0) {
    console.log('\n✅ NEW DRIVE KEYS:')
    successful.forEach((result, i) => {
      console.log(`   ${i + 1}. ${result.modelKey}`)
      console.log(`      Original: ${result.originalDriveKey}`)
      console.log(`      New:      ${result.newDriveKey}`)
      console.log(`      Addon:    ${result.addon}`)
      console.log(`      Licenses: ${result.license.join(', ')}`)
    })
  }

  if (failed.length > 0) {
    console.log('\n❌ FAILED DRIVES:')
    failed.forEach((result, i) => {
      console.log(`   ${i + 1}. ${result.originalDriveKey}`)
      console.log(`      Error: ${result.error}`)
    })
  }

  console.log(`\n💾 New drive keys saved to: ${keysFile}`)
  console.log('🎉 Done! You can now seed these drives using the seeder.')
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}

module.exports = {
  recreateDriveWithLicense,
  downloadDrive
}
