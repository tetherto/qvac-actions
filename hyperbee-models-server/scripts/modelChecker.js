'use strict'

const { checkHyperbeeKey } = require('./hyperbeeKeyChecker')
const { checkDriveKey } = require('./driveKeyChecker')

async function checkModel (beeKey, modelKey, options = {}) {
  const {
    timeout = 15000,
    showFiles = true,
    maxFiles = 20,
    configFile = '/inference.config.json'
  } = options

  console.log('🔍 COMPREHENSIVE MODEL CHECKER')
  console.log('==========================================')
  console.log(`📋 Model Key: ${modelKey}`)
  console.log(`🗄️  Bee Key: ${beeKey}`)
  console.log(`⏱️  Timeout: ${timeout}ms`)
  console.log('==========================================\n')

  // Step 1: Check Hyperbee database for model metadata
  console.log('🔸 STEP 1: Checking Hyperbee database for model metadata...')

  const beeResult = await checkHyperbeeKey(beeKey, modelKey, {
    timeout,
    encoding: { keyEncoding: 'utf-8', valueEncoding: 'binary' }
  })

  if (!beeResult.success) {
    console.log('❌ Failed to check Hyperbee database')
    return {
      success: false,
      error: beeResult.error,
      modelKey,
      beeKey,
      step: 'hyperbee'
    }
  }

  if (!beeResult.found) {
    console.log('❌ Model not found in Hyperbee database')
    return {
      success: false,
      error: 'Model key not found in database',
      modelKey,
      beeKey,
      step: 'hyperbee'
    }
  }

  // Parse the model record
  let modelRecord
  try {
    const valueStr = beeResult.entry.value.toString()
    modelRecord = JSON.parse(valueStr)
  } catch (parseError) {
    console.log('❌ Failed to parse model record from database')
    return {
      success: false,
      error: `Failed to parse model record: ${parseError.message}`,
      modelKey,
      beeKey,
      step: 'parse'
    }
  }

  console.log('✅ Model metadata found in database!')
  console.log('\n📊 MODEL METADATA:')
  console.log('------------------')
  console.log(`   Drive Key: ${modelRecord.key}`)
  console.log(`   Drive Version: ${modelRecord.driveVersion}`)
  console.log(`   Fingerprint: ${modelRecord.fingerprint}`)
  console.log('   Tags:')
  Object.entries(modelRecord.tags).forEach(([key, value]) => {
    if (value) {
      console.log(`     ${key}: ${value}`)
    }
  })

  // Step 2: Check Hyperdrive contents
  console.log('\n🔸 STEP 2: Checking Hyperdrive contents...')

  const driveResult = await checkDriveKey(modelRecord.key, {
    timeout,
    maxFiles,
    recursive: true,
    configFile
  })

  if (!driveResult.success) {
    console.log('❌ Failed to check Hyperdrive')
    return {
      success: false,
      error: driveResult.error,
      modelKey,
      beeKey,
      driveKey: modelRecord.key,
      modelRecord,
      step: 'hyperdrive'
    }
  }

  // Compile comprehensive results
  const result = {
    success: true,
    modelKey,
    beeKey,
    modelRecord: {
      driveKey: modelRecord.key,
      driveVersion: modelRecord.driveVersion,
      fingerprint: modelRecord.fingerprint,
      tags: modelRecord.tags
    },
    drive: {
      discoveryKey: driveResult.discoveryKey,
      writable: driveResult.writable,
      fileCount: driveResult.fileCount,
      connectionCount: driveResult.connectionCount,
      files: driveResult.files,
      inferenceConfigFound: driveResult.inferenceConfigFound,
      inferenceConfig: driveResult.inferenceConfig
    }
  }

  // Step 3: Summary and analysis
  console.log('\n🔸 STEP 3: Analysis and summary...')
  console.log('\n📋 COMPREHENSIVE SUMMARY:')
  console.log('==========================================')
  console.log('✅ Model Status: VERIFIED')
  console.log(`📁 Files in drive: ${result.drive.fileCount}`)
  console.log(`🔗 Network connections: ${result.drive.connectionCount}`)
  console.log(`⚙️  Inference config: ${result.drive.inferenceConfigFound ? 'FOUND' : 'MISSING'}`)

  if (result.drive.inferenceConfig && result.drive.inferenceConfig.found) {
    console.log(`📄 Config file size: ${result.drive.inferenceConfig.size} bytes`)
    console.log(`✓ Valid JSON: ${result.drive.inferenceConfig.isValidJson ? 'Yes' : 'No'}`)
  }

  // Show file listing if requested
  if (showFiles && result.drive.files.length > 0) {
    console.log('\n📂 DRIVE FILES (sample):')
    console.log('------------------------')
    result.drive.files.slice(0, 10).forEach((file, i) => {
      const size = file.value?.blob?.byteLength || file.value?.size || 'unknown'
      console.log(`   ${i + 1}. ${file.key} (${size} bytes)`)
    })
    if (result.drive.fileCount > 10) {
      console.log(`   ... and ${result.drive.fileCount - 10} more files`)
    }
  }

  // Validation checks
  console.log('\n🔍 VALIDATION CHECKS:')
  console.log('--------------------')
  console.log('✓ Model exists in database: YES')
  console.log('✓ Drive is accessible: YES')
  console.log(`✓ Drive has files: ${result.drive.fileCount > 0 ? 'YES' : 'NO'}`)
  console.log(`✓ Inference config present: ${result.drive.inferenceConfigFound ? 'YES' : 'NO'}`)
  console.log(`✓ Network connectivity: ${result.drive.connectionCount > 0 ? 'YES' : 'NO'}`)

  return result
}

async function checkMultipleModels (beeKey, modelKeys, options = {}) {
  console.log('🚀 BATCH MODEL CHECKER')
  console.log('==========================================')
  console.log(`🔍 Checking ${modelKeys.length} models...`)
  console.log(`🗄️  Bee Key: ${beeKey}`)
  console.log('==========================================\n')

  const results = []

  for (let i = 0; i < modelKeys.length; i++) {
    console.log(`\n[${i + 1}/${modelKeys.length}] ==========================================`)
    console.log(`🔍 Checking model: ${modelKeys[i]}`)
    console.log('==========================================')

    const result = await checkModel(beeKey, modelKeys[i], {
      ...options,
      showFiles: false // Disable file listing for batch mode
    })

    results.push(result)

    // Wait between checks to avoid overwhelming the network
    if (i < modelKeys.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      console.log('\n⏳ Waiting before next check...\n')
    }
  }

  // Batch summary
  console.log('\n\n📊 BATCH SUMMARY')
  console.log('==========================================')
  const successful = results.filter(r => r.success)
  const failed = results.filter(r => !r.success)
  const withInferenceConfig = successful.filter(r => r.drive?.inferenceConfigFound)

  console.log(`✅ Successful checks: ${successful.length}`)
  console.log(`❌ Failed checks: ${failed.length}`)
  console.log(`⚙️  Models with inference config: ${withInferenceConfig.length}`)

  if (successful.length > 0) {
    console.log('\n✅ SUCCESSFUL MODELS:')
    successful.forEach((result, i) => {
      const files = result.drive?.fileCount || 0
      const config = result.drive?.inferenceConfigFound ? '✓' : '✗'
      console.log(`   ${i + 1}. ${result.modelKey} (${files} files, config: ${config})`)
    })
  }

  if (failed.length > 0) {
    console.log('\n❌ FAILED MODELS:')
    failed.forEach((result, i) => {
      console.log(`   ${i + 1}. ${result.modelKey} - ${result.error} (step: ${result.step})`)
    })
  }

  return results
}

// Main function for CLI usage
async function main () {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.log(`
🔍 COMPREHENSIVE MODEL CHECKER

This tool combines Hyperbee database lookup with Hyperdrive content verification
to provide complete model validation and analysis.

Usage:
  node modelChecker.js <beeKey> <modelKey1> [modelKey2] [modelKey3] ...
  node modelChecker.js <beeKey> <modelKey> [options]

Options:
  --timeout <ms>            Connection timeout (default: 15000)
  --max-files <number>      Maximum files to list (default: 20)
  --no-files                Don't show file listings
  --config-file <path>      Check for specific config file (default: /inference.config.json)

Examples:
  # Check single model
  node modelChecker.js 7504626aaa534ac55d91b4b3067504774ae1457b03ddfbd86d817dd8cfbca8c8 "translation:marian:opus-ggml:::q0f32:1.0.0:en-it"
  
  # Check multiple models
  node modelChecker.js 7504626aaa534ac55d91b4b3067504774ae1457b03ddfbd86d817dd8cfbca8c8 model1 model2 model3
  
  # Check with custom config file
  node modelChecker.js beeKey modelKey --config-file /model.config.json
  
  # Quick check without file listings
  node modelChecker.js beeKey modelKey --no-files

What this tool does:
  1. 🔍 Looks up model metadata in Hyperbee database
  2. 📁 Verifies Hyperdrive accessibility and contents
  3. ⚙️  Checks for inference configuration files
  4. 📊 Provides comprehensive validation report
  5. 🔗 Tests network connectivity and replication
    `)
    process.exit(1)
  }

  const beeKey = args[0]
  if (!beeKey || beeKey.startsWith('--')) {
    console.error('❌ First argument must be the Hyperbee key')
    process.exit(1)
  }

  // Parse arguments
  const modelKeys = []
  const options = {
    timeout: 15000,
    maxFiles: 20,
    showFiles: true,
    configFile: '/inference.config.json'
  }

  for (let i = 1; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--timeout') {
      options.timeout = parseInt(args[++i])
    } else if (arg === '--max-files') {
      options.maxFiles = parseInt(args[++i])
    } else if (arg === '--no-files') {
      options.showFiles = false
    } else if (arg === '--config-file') {
      options.configFile = args[++i]
    } else if (!arg.startsWith('--')) {
      modelKeys.push(arg)
    }
  }

  if (modelKeys.length === 0) {
    console.error('❌ No model keys provided')
    process.exit(1)
  } else if (modelKeys.length === 1) {
    await checkModel(beeKey, modelKeys[0], options)
  } else {
    await checkMultipleModels(beeKey, modelKeys, options)
  }
}

// Export functions for use as module
module.exports = {
  checkModel,
  checkMultipleModels
}

// Run main if this script is executed directly
if (require.main === module) {
  main().catch(console.error)
}
