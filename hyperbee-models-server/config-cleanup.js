const fs = require('fs');
const path = require('path');

/**
 * Clean up duplicate entries in prod.config.json
 * Duplicates are identified by generating the same BeeKey from tags
 * 
 * Usage:
 *   node config-cleanup.js           # Perform cleanup
 *   node config-cleanup.js --dry-run # Show what would be removed without making changes
 */

// Helper function to generate BeeKey from tags (same as used in keys.txt)
function generateBeeKey(tags) {
  const {
    function: func,
    name,
    type,
    externalVersion,
    params,
    quantization,
    internalVersion,
    other
  } = tags;
  
  return `${func}:${name}:${type}:${externalVersion}:${params}:${quantization}:${internalVersion}:${other}`;
}

// Helper function to score an entry (higher score = better to keep)
function scoreEntry(drive) {
  let score = 0;
  
  // Has driveKey
  if (drive.driveKey) score += 10;
  
  // Has driveMetadata
  if (drive.driveMetadata && drive.driveMetadata.length > 0) score += 10;
  
  // Has models
  if (drive.models && drive.models.length > 0) score += 5;
  
  // Has license
  if (drive.license && drive.license.length > 0) score += 3;
  
  // Metadata has LICENSE files
  if (drive.driveMetadata) {
    const hasLicense = drive.driveMetadata.some(m => 
      m.filename === 'LICENSE' || m.filename.startsWith('LICENSE-')
    );
    if (hasLicense) score += 5;
  }
  
  // More metadata entries
  if (drive.driveMetadata) {
    score += Math.min(drive.driveMetadata.length, 10);
  }
  
  return score;
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const baseDir = __dirname;
  const configFile = path.join(baseDir, 'prod.config.json');
  
  console.log('🧹 Config Cleanup Script');
  console.log('='.repeat(60));
  console.log(`Mode: ${isDryRun ? '🔍 DRY RUN (no changes)' : '✂️  CLEANUP (will modify)'}`);
  console.log('='.repeat(60));
  console.log('');
  
  // Read config
  console.log('📖 Reading prod.config.json...');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
  
  const totalEntries = config.drives.length;
  console.log(`   Total entries: ${totalEntries}\n`);
  
  // Group drives by BeeKey
  console.log('🔍 Finding duplicates...');
  const drivesByBeeKey = new Map();
  
  config.drives.forEach((drive, index) => {
    const beeKey = generateBeeKey(drive.tags);
    
    if (!drivesByBeeKey.has(beeKey)) {
      drivesByBeeKey.set(beeKey, []);
    }
    
    drivesByBeeKey.get(beeKey).push({ drive, index });
  });
  
  // Find duplicates
  const duplicates = [];
  for (const [beeKey, entries] of drivesByBeeKey) {
    if (entries.length > 1) {
      duplicates.push({ beeKey, entries });
    }
  }
  
  console.log(`   Found ${duplicates.length} BeeKeys with duplicates\n`);
  
  if (duplicates.length === 0) {
    console.log('✅ No duplicates found! Config is clean.\n');
    return;
  }
  
  // Process duplicates
  const stats = {
    duplicateGroups: duplicates.length,
    totalDuplicates: 0,
    toRemove: [],
    toKeep: []
  };
  
  console.log('📋 Duplicate entries:\n');
  
  for (const { beeKey, entries } of duplicates) {
    console.log(`BeeKey: ${beeKey}`);
    console.log(`   Found ${entries.length} copies:\n`);
    
    // Score each entry
    const scored = entries.map(({ drive, index }) => ({
      drive,
      index,
      score: scoreEntry(drive)
    }));
    
    // Sort by score (highest first)
    scored.sort((a, b) => b.score - a.score);
    
    // Keep the first (highest score), remove the rest
    const toKeep = scored[0];
    const toRemove = scored.slice(1);
    
    stats.toKeep.push({ beeKey, index: toKeep.index, score: toKeep.score });
    stats.totalDuplicates += toRemove.length;
    
    console.log(`   ✅ KEEP (score: ${toKeep.score}):`);
    console.log(`      Index: ${toKeep.index}`);
    console.log(`      DriveKey: ${toKeep.drive.driveKey || '(none)'}`);
    console.log(`      Metadata: ${toKeep.drive.driveMetadata ? toKeep.drive.driveMetadata.length + ' file(s)' : '(none)'}`);
    console.log(`      Addon: ${toKeep.drive.addon}`);
    
    for (const entry of toRemove) {
      stats.toRemove.push({ beeKey, index: entry.index, score: entry.score });
      console.log('');
      console.log(`   ❌ REMOVE (score: ${entry.score}):`);
      console.log(`      Index: ${entry.index}`);
      console.log(`      DriveKey: ${entry.drive.driveKey || '(none)'}`);
      console.log(`      Metadata: ${entry.drive.driveMetadata ? entry.drive.driveMetadata.length + ' file(s)' : '(none)'}`);
      console.log(`      Addon: ${entry.drive.addon}`);
    }
    
    console.log('');
  }
  
  // Remove duplicates (in reverse order to preserve indices)
  if (!isDryRun) {
    console.log('\n🗑️  Removing duplicates...');
    
    // Sort removal indices in descending order to preserve array indices
    const indicesToRemove = stats.toRemove.map(r => r.index).sort((a, b) => b - a);
    
    for (const index of indicesToRemove) {
      config.drives.splice(index, 1);
    }
    
    // Save updated config
    console.log('💾 Saving cleaned prod.config.json...');
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    console.log('   ✅ Config saved\n');
  } else {
    console.log('\n🔍 DRY RUN - No changes made\n');
  }
  
  // Print summary
  console.log('='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total entries in config:     ${totalEntries}`);
  console.log(`Duplicate BeeKeys found:     ${stats.duplicateGroups}`);
  console.log(`Total duplicate entries:     ${stats.totalDuplicates}`);
  console.log(`Entries to keep:             ${totalEntries - stats.totalDuplicates}`);
  console.log(`Entries to remove:           ${stats.totalDuplicates}`);
  console.log('='.repeat(60));
  
  if (stats.toRemove.length > 0) {
    console.log('\n📝 Detailed removal list:');
    stats.toRemove.forEach((item, idx) => {
      console.log(`   ${idx + 1}. Index ${item.index}: ${item.beeKey} (score: ${item.score})`);
    });
  }
  
  if (isDryRun && stats.totalDuplicates > 0) {
    console.log('\n💡 Run without --dry-run to perform cleanup:\n   node config-cleanup.js\n');
  } else if (!isDryRun && stats.totalDuplicates > 0) {
    console.log(`\n✨ Cleanup complete! Removed ${stats.totalDuplicates} duplicate entries.`);
    console.log(`   Config reduced from ${totalEntries} to ${totalEntries - stats.totalDuplicates} entries.\n`);
  }
}

main().catch(err => {
  console.error('💥 Error:', err);
  process.exit(1);
});

