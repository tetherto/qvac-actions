'use strict'

const Hyperbee = require('hyperbee')
const Hyperswarm = require('hyperswarm')
const b4a = require('b4a')
const path = require('path')
const fs = require('fs')
const { getCorestoreInstance } = require('../store')

async function deleteBeeRecord (beeKey, recordKey, options = {}) {
  const { dryRun = false } = options

  console.log('🗑️  HYPERBEE RECORD DELETION TOOL')
  console.log('==========================================')
  console.log(`📋 Bee Key: ${beeKey}`)
  console.log(`🔑 Record Key: ${recordKey}`)
  console.log(`🔧 Mode: ${dryRun ? 'DRY RUN' : 'LIVE DELETION'}`)
  console.log('==========================================\n')

  let store = null
  let db = null
  let swarm = null

  try {
    // Initialize corestore
    store = await getCorestoreInstance()
    const core = store.get(b4a.from(beeKey, 'hex'))

    // Create Hyperbee instance
    db = new Hyperbee(core, { keyEncoding: 'utf-8', valueEncoding: 'binary' })
    await db.ready()

    // Check if we have write access
    if (!db.writable) {
      console.log('❌ ERROR: No write access to this Hyperbee')
      console.log('   This is a read-only replication.')
      console.log('   You can only delete records from a Hyperbee you created/own.')
      console.log(`   Writable: ${db.writable}`)
      return {
        success: false,
        error: 'No write access - this is a read-only replication',
        key: recordKey,
        writable: false
      }
    }

    console.log('✅ Write access confirmed')

    // Set up swarm for replication
    swarm = new Hyperswarm()
    swarm.on('connection', (conn) => {
      store.replicate(conn)
    })

    const discovery = swarm.join(db.discoveryKey, { server: false, client: true })
    await discovery.flushed()

    console.log('🔍 Checking if record exists...')

    // First, check if the record exists
    const existingRecord = await db.get(recordKey)

    if (!existingRecord) {
      console.log('❌ Record not found in database')
      return {
        success: false,
        error: 'Record does not exist',
        key: recordKey
      }
    }

    // Parse and display the record
    let recordData
    try {
      const valueStr = existingRecord.value.toString()
      recordData = JSON.parse(valueStr)
    } catch (parseError) {
      console.log('⚠️  Warning: Could not parse record as JSON')
      recordData = existingRecord.value
    }

    console.log('\n📊 EXISTING RECORD:')
    console.log('------------------')
    console.log(`   Sequence: ${existingRecord.seq}`)
    console.log(`   Key: ${existingRecord.key}`)

    if (typeof recordData === 'object' && recordData !== null) {
      console.log('   Data:')
      Object.entries(recordData).forEach(([key, value]) => {
        if (key === 'driveMetadata' && Array.isArray(value)) {
          console.log(`     ${key}: [${value.length} entries]`)
        } else if (typeof value === 'object') {
          console.log(`     ${key}: ${JSON.stringify(value, null, 2).split('\n').join('\n     ')}`)
        } else {
          console.log(`     ${key}: ${value}`)
        }
      })
    } else {
      console.log(`   Value: ${recordData}`)
    }

    if (dryRun) {
      console.log('\n✅ DRY RUN: Record would be deleted')
      return {
        success: true,
        dryRun: true,
        key: recordKey,
        record: recordData
      }
    }

    // Perform the deletion
    console.log('\n🗑️  Deleting record...')
    await db.del(recordKey)

    // Verify deletion
    console.log('🔍 Verifying deletion...')
    const checkDeleted = await db.get(recordKey)

    if (checkDeleted === null) {
      console.log('✅ Record successfully deleted!')

      // Save a backup of the deleted record
      const backupDir = path.join(__dirname, '..', 'deleted-backups')
      await fs.promises.mkdir(backupDir, { recursive: true })

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupFile = path.join(backupDir, `${recordKey.replace(/[:/]/g, '_')}_${timestamp}.json`)

      await fs.promises.writeFile(backupFile, JSON.stringify({
        deletedAt: new Date().toISOString(),
        key: recordKey,
        seq: existingRecord.seq,
        data: recordData
      }, null, 2))

      console.log(`📁 Backup saved to: ${backupFile}`)

      return {
        success: true,
        key: recordKey,
        backupFile,
        deletedRecord: recordData
      }
    } else {
      console.log('❌ Failed to delete record - it still exists!')
      return {
        success: false,
        error: 'Deletion failed - record still exists',
        key: recordKey
      }
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`)
    return {
      success: false,
      error: error.message,
      key: recordKey
    }
  } finally {
    // Cleanup
    if (swarm) await swarm.destroy()
    if (db) await db.close()
    if (store) await store.close()
  }
}

async function deleteMultipleRecords (beeKey, recordKeys, options = {}) {
  console.log('🚀 BATCH RECORD DELETION')
  console.log('==========================================')
  console.log(`🔍 Deleting ${recordKeys.length} records...`)
  console.log(`🗄️  Bee Key: ${beeKey}`)
  console.log('==========================================\n')

  const results = []

  for (let i = 0; i < recordKeys.length; i++) {
    console.log(`\n[${i + 1}/${recordKeys.length}] ==========================================`)
    console.log(`🔍 Processing: ${recordKeys[i]}`)
    console.log('==========================================')

    const result = await deleteBeeRecord(beeKey, recordKeys[i], options)
    results.push(result)

    // Wait between deletions to avoid overwhelming the system
    if (i < recordKeys.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  // Summary
  console.log('\n\n📊 DELETION SUMMARY')
  console.log('==========================================')
  const successful = results.filter(r => r.success)
  const failed = results.filter(r => !r.success)

  console.log(`✅ Successful deletions: ${successful.length}`)
  console.log(`❌ Failed deletions: ${failed.length}`)

  if (successful.length > 0 && !options.dryRun) {
    console.log('\n✅ DELETED RECORDS:')
    successful.forEach((result, i) => {
      console.log(`   ${i + 1}. ${result.key}`)
    })
  }

  if (failed.length > 0) {
    console.log('\n❌ FAILED RECORDS:')
    failed.forEach((result, i) => {
      console.log(`   ${i + 1}. ${result.key} - ${result.error}`)
    })
  }

  return results
}

// Main function for CLI usage
async function main () {
  const args = process.argv.slice(2)

  if (args.length < 2) {
    console.log(`
🗑️  HYPERBEE RECORD DELETION TOOL

This tool allows you to delete records from a Hyperbee database.

Usage:
  node deleteBeeRecord.js <beeKey> <recordKey> [options]
  node deleteBeeRecord.js <beeKey> <recordKey1> <recordKey2> ... [options]

Options:
  --dry-run             Show what would be deleted without actually deleting
  --no-backup           Don't create backup files of deleted records

Examples:
  # Delete a single record
  node deleteBeeRecord.js 7504626aaa534ac55d91b4b3067504774ae1457b03ddfbd86d817dd8cfbca8c8 "translation:marian:opus-ggml:::q0f32:1.0.0:en-it"
  
  # Dry run to see what would be deleted
  node deleteBeeRecord.js 7504626aaa534ac55d91b4b3067504774ae1457b03ddfbd86d817dd8cfbca8c8 "generation:llama:instruct:3.2:1B:q4:1.0.0:" --dry-run
  
  # Delete multiple records
  node deleteBeeRecord.js beeKey record1 record2 record3

⚠️  WARNING: Deletion is permanent! Always use --dry-run first to verify.
⚠️  Backups are saved to the deleted-backups directory by default.
    `)
    process.exit(1)
  }

  const beeKey = args[0]
  const recordKeys = []
  const options = {
    dryRun: false,
    createBackup: true
  }

  // Parse arguments
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--no-backup') {
      options.createBackup = false
    } else if (!arg.startsWith('--')) {
      recordKeys.push(arg)
    }
  }

  if (recordKeys.length === 0) {
    console.error('❌ No record keys provided')
    process.exit(1)
  }

  try {
    if (recordKeys.length === 1) {
      await deleteBeeRecord(beeKey, recordKeys[0], options)
    } else {
      await deleteMultipleRecords(beeKey, recordKeys, options)
    }
  } catch (error) {
    console.error('❌ Fatal error:', error.message)
    process.exit(1)
  }
}

// Export functions for use as module
module.exports = {
  deleteBeeRecord,
  deleteMultipleRecords
}

// Run main if this script is executed directly
if (require.main === module) {
  main().catch(console.error)
}
