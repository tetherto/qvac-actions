const fs = require('fs');
const path = require('path');

/**
 * Check for deprecated drives still present in prod.config.json
 * 
 * Compares entries in deprecated.drives.txt against prod.config.json
 * and reports which deprecated drives are still in the configuration
 */

// Helper function to generate BeeKey from tags
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

// Helper function to normalize BeeKey (remove suffix like "(with-license)")
function normalizeBeeKey(beeKey) {
  return beeKey.replace(/\s*\(with-license\)\s*/g, '').trim();
}

async function main() {
  const baseDir = __dirname;
  const deprecatedFile = path.join(baseDir, 'deprecated.drives.txt');
  const configFile = path.join(baseDir, 'prod.config.json');
  
  console.log('🔍 Checking for deprecated drives in prod.config.json\n');
  
  // Read deprecated.drives.txt
  console.log('📖 Reading deprecated.drives.txt...');
  const deprecatedContent = fs.readFileSync(deprecatedFile, 'utf-8');
  const deprecatedLines = deprecatedContent.trim().split('\n');
  
  const deprecatedDrives = new Set();
  
  for (const line of deprecatedLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    const parts = trimmed.split(' ');
    if (parts.length < 2) continue;
    
    const driveKey = parts[parts.length - 1]; // Get the driveKey hash
    deprecatedDrives.add(driveKey);
  }
  
  console.log(`   Found ${deprecatedDrives.size} deprecated entries\n`);
  
  // Read prod.config.json
  console.log('📖 Reading prod.config.json...');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
  console.log(`   Found ${config.drives.length} entries in config\n`);
  
  // Check which deprecated drives are still in config
  console.log('🔍 Searching for deprecated drives in config...\n');
  
  const stillPresent = [];
  
  for (let i = 0; i < config.drives.length; i++) {
    const drive = config.drives[i];
    const driveKey = drive.driveKey;
    
    if (driveKey && deprecatedDrives.has(driveKey)) {
      const beeKey = generateBeeKey(drive.tags);
      stillPresent.push({
        index: i,
        beeKey,
        driveKey: driveKey,
        addon: drive.addon,
        hasMetadata: !!(drive.driveMetadata && drive.driveMetadata.length > 0)
      });
    }
  }
  
  // Print results
  console.log('='.repeat(60));
  console.log('📊 RESULTS');
  console.log('='.repeat(60));
  console.log(`Total deprecated entries:        ${deprecatedDrives.size}`);
  console.log(`Still in prod.config.json:       ${stillPresent.length}`);
  console.log(`Properly removed:                ${deprecatedDrives.size - stillPresent.length}`);
  console.log('='.repeat(60));
  
  if (stillPresent.length === 0) {
    console.log('\n✅ All deprecated drives have been removed from config!\n');
  } else {
    console.log(`\n⚠️  Found ${stillPresent.length} deprecated drive(s) still in config:\n`);
    
    stillPresent.forEach((item, idx) => {
      console.log(`${idx + 1}. Index ${item.index}: ${item.beeKey}`);
      console.log(`   Addon: ${item.addon}`);
      console.log(`   DriveKey: ${item.driveKey}`);
      console.log(`   Metadata: ${item.hasMetadata ? 'Yes' : 'No'}`);
      console.log('');
    });
    
    console.log('💡 These entries should be removed from prod.config.json\n');
  }
  
  // Summary for automation
  if (stillPresent.length > 0) {
    console.log('📋 Indices to remove: ' + stillPresent.map(item => item.index).join(', '));
    console.log('');
  }
}

main().catch(err => {
  console.error('💥 Error:', err);
  process.exit(1);
});

