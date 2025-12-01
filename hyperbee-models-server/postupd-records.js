const fs = require('fs');
const path = require('path');
const { calculateDirectoryChecksums } = require('./utils');

// Helper function to construct BeeKey from tags
function constructBeeKey(tags) {
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

// Helper function to parse BeeKey into tag components
function parseBeeKey(beeKey) {
  const parts = beeKey.split(':');
  if (parts.length !== 8) {
    return null;
  }
  
  return {
    function: parts[0],
    name: parts[1],
    type: parts[2],
    externalVersion: parts[3],
    params: parts[4],
    quantization: parts[5],
    internalVersion: parts[6],
    other: parts[7]
  };
}

// Helper function to compare tags
function tagsMatch(tags1, tags2) {
  return tags1.function === tags2.function &&
         tags1.name === tags2.name &&
         tags1.type === tags2.type &&
         tags1.externalVersion === tags2.externalVersion &&
         tags1.params === tags2.params &&
         tags1.quantization === tags2.quantization &&
         tags1.internalVersion === tags2.internalVersion &&
         tags1.other === tags2.other;
}

// Helper function to find driveMetadata in app.log for a specific driveKey
// Search by driveKey (more unique) rather than BeeKey to avoid false matches
function findDriveMetadataInLog(logContent, driveKey, beeKey) {
  const lines = logContent.split('\n');
  
  // First try to find by driveKey in JSON format (logged as "key" field)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Search for lines containing the driveKey in "key" field
    if (line.includes(`"key": "${driveKey}"`) || line.includes(driveKey)) {
      // Found the driveKey, now look for driveMetadata in the following lines
      let searchText = '';
      const searchRange = 30; // Look ahead up to 30 lines
      
      for (let j = i; j < Math.min(i + searchRange, lines.length); j++) {
        searchText += lines[j] + '\n';
      }
      
      // Try to extract driveMetadata array - look for the pattern in the accumulated text
      const metadataMatch = searchText.match(/"driveMetadata"\s*:\s*\[([\s\S]*?)\s*\]\s*\}/);
      if (metadataMatch) {
        try {
          // Reconstruct the full array
          const fullArray = '[' + metadataMatch[1] + ']';
          const metadata = JSON.parse(fullArray);
          return metadata;
        } catch (e) {
          // Try alternative parsing
          try {
            // Sometimes the metadata might span multiple lines differently
            const jsonMatch = searchText.match(/"driveMetadata"\s*:\s*(\[[\s\S]*?\])/);
            if (jsonMatch) {
              const metadata = JSON.parse(jsonMatch[1]);
              return metadata;
            }
          } catch (e2) {
            // Continue searching
          }
        }
      }
    }
  }
  
  // Fallback: try to find by BeeKey (less reliable, but may work for some cases)
  // Only use this if driveKey search failed
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Search for exact Model log line with beeKey
    if (line.includes(`Model ${beeKey}`) && line.includes('record')) {
      // Found the BeeKey in a model log line, now look for driveMetadata in following lines
      let searchText = '';
      const searchRange = 30;
      
      for (let j = i; j < Math.min(i + searchRange, lines.length); j++) {
        searchText += lines[j] + '\n';
      }
      
      // Try to extract driveMetadata array
      const metadataMatch = searchText.match(/"driveMetadata"\s*:\s*\[([\s\S]*?)\s*\]\s*\}/);
      if (metadataMatch) {
        try {
          const fullArray = '[' + metadataMatch[1] + ']';
          const metadata = JSON.parse(fullArray);
          return metadata;
        } catch (e) {
          try {
            const jsonMatch = searchText.match(/"driveMetadata"\s*:\s*(\[[\s\S]*?\])/);
            if (jsonMatch) {
              const metadata = JSON.parse(jsonMatch[1]);
              return metadata;
            }
          } catch (e2) {
            // Continue
          }
        }
      }
    }
  }
  
  return null;
}

// Helper function to find local model directory based on tags
// This uses the same directory structure as model-manager.js download functions
// which create directories based on modelKey pattern
function findModelDirectory(tags, config) {
  const { function: func, name, type, externalVersion, params, quantization, internalVersion, other } = tags;
  
  // Construct modelKey using the same pattern as generateModelKey in utils.js
  const modelKey = `${func}:${name}:${type}:${externalVersion}:${params}:${quantization}:${internalVersion}:${other}`;
  
  // Model directory follows the same pattern as downloadHFModel/downloadS3Model
  // which is: config.localBasePath/modelKey/
  const modelDir = path.join(config.localBasePath, modelKey);
  
  if (fs.existsSync(modelDir)) {
    return modelDir;
  }
  
  return null;
}

async function main() {
  const baseDir = __dirname;
  const keysFile = path.join(baseDir, 'keys.txt');
  const configFile = path.join(baseDir, 'prod.config.json');
  const logFile = path.join(baseDir, 'app.log');
  
  console.log('🚀 Starting update process...\n');
  
  // Read files
  console.log('📖 Reading files...');
  const keysContent = fs.readFileSync(keysFile, 'utf-8');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
  const logContent = fs.readFileSync(logFile, 'utf-8');
  
  // Parse keys.txt
  const lines = keysContent.trim().split('\n');
  const entries = [];
  
  // Skip first line (bee record)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts = line.split(' ');
    if (parts.length < 2) continue;
    
    const driveHash = parts.pop(); // Last part is the hash
    const beeKey = parts.join(' '); // Everything else is the BeeKey
    
    entries.push({ beeKey, driveHash });
  }
  
  console.log(`📊 Found ${entries.length} entries in keys.txt (skipped DB record)\n`);
  
  // Process each entry
  const stats = {
    total: entries.length,
    updated: 0,
    metadataUpdated: 0,
    metadataGenerated: 0,
    notFound: [],
    metadataNotFound: []
  };
  
  for (const { beeKey, driveHash } of entries) {
    const tags = parseBeeKey(beeKey);
    
    if (!tags) {
      console.log(`❌ Failed to parse BeeKey: ${beeKey}`);
      stats.notFound.push(beeKey);
      continue;
    }
    
    // Find matching entry in config
    let found = false;
    for (const drive of config.drives) {
      if (tagsMatch(drive.tags, tags)) {
        // Update driveKey
        drive.driveKey = driveHash;
        stats.updated++;
        found = true;
        
        console.log(`✅ Updated: ${beeKey}`);
        
        // Now try to find driveMetadata in app.log using the driveKey (more reliable)
        let metadata = findDriveMetadataInLog(logContent, driveHash, beeKey);
        if (metadata) {
          // Check if LICENSE is missing from log metadata
          const hasLicense = metadata.some(m => 
            m.filename === 'LICENSE' || 
            m.filename.startsWith('LICENSE-')
          );
          
          if (!hasLicense) {
            // LICENSE is missing, try to add it from local files
            console.log(`   📝 Metadata found in log (${metadata.length} file(s)) - checking LICENSE...`);
            try {
              const modelDir = findModelDirectory(tags, config);
              if (modelDir) {
                const fullMetadata = await calculateDirectoryChecksums(modelDir, ['inference.config.json', '.s3-fingerprint']);
                const licenseFiles = fullMetadata.filter(m => 
                  m.filename === 'LICENSE' || 
                  m.filename.startsWith('LICENSE-')
                );
                
                if (licenseFiles.length > 0) {
                  // Smart LICENSE handling
                  const hasGenericLicense = licenseFiles.some(m => m.filename === 'LICENSE');
                  const hasSpecificLicense = licenseFiles.some(m => m.filename.startsWith('LICENSE-') && m.filename.endsWith('.txt'));
                  
                  const licensesToAdd = (hasGenericLicense && hasSpecificLicense)
                    ? licenseFiles.filter(m => m.filename !== 'LICENSE')
                    : licenseFiles;
                  
                  metadata = [...licensesToAdd, ...metadata];
                  console.log(`   ✅ Added ${licensesToAdd.length} LICENSE file(s) to metadata`);
                }
              }
            } catch (err) {
              console.log(`   ⚠️  Could not add LICENSE: ${err.message}`);
            }
          }
          
          drive.driveMetadata = metadata;
          stats.metadataUpdated++;
        } else {
          // Try to generate metadata from local files
          console.log(`   ⚠️  Metadata not found in app.log, attempting to generate...`);
          try {
            const modelDir = findModelDirectory(tags, config);
            if (modelDir) {
              console.log(`   📂 Found local directory: ${path.relative(baseDir, modelDir)}`);
              // Use existing calculateDirectoryChecksums from utils.js
              metadata = await calculateDirectoryChecksums(modelDir, ['inference.config.json', '.s3-fingerprint']);
              
              // Smart LICENSE handling to avoid duplicates:
              // - If both "LICENSE" and "LICENSE-*.txt" exist, keep only LICENSE-*.txt
              // - If only "LICENSE" exists, keep it
              const hasGenericLicense = metadata.some(m => m.filename === 'LICENSE');
              const hasSpecificLicense = metadata.some(m => m.filename.startsWith('LICENSE-') && m.filename.endsWith('.txt'));
              
              if (hasGenericLicense && hasSpecificLicense) {
                // Remove generic LICENSE only if we have specific ones
                metadata = metadata.filter(m => m.filename !== 'LICENSE');
              }
              
              drive.driveMetadata = metadata;
              stats.metadataGenerated++;
              console.log(`   ✅ Metadata generated (${metadata.length} file(s))`);
            } else {
              stats.metadataNotFound.push(beeKey);
              console.log(`   ❌ Local model directory not found`);
            }
          } catch (err) {
            stats.metadataNotFound.push(beeKey);
            console.log(`   ❌ Error generating metadata: ${err.message}`);
          }
        }
        
        break;
      }
    }
    
    if (!found) {
      stats.notFound.push(beeKey);
      console.log(`❌ Not found in config: ${beeKey}`);
    }
  }
  
  // Save updated config
  console.log('\n💾 Saving updated prod.config.json...');
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total entries processed:     ${stats.total}`);
  console.log(`✅ DriveKeys updated:        ${stats.updated}`);
  console.log(`📝 Metadata from log:        ${stats.metadataUpdated}`);
  console.log(`🔧 Metadata generated:       ${stats.metadataGenerated}`);
  console.log(`📋 Total metadata complete:  ${stats.metadataUpdated + stats.metadataGenerated}`);
  console.log(`❌ Not found in config:      ${stats.notFound.length}`);
  console.log(`⚠️  Metadata missing:        ${stats.metadataNotFound.length}`);
  console.log('='.repeat(60));
  
  if (stats.notFound.length > 0) {
    console.log('\n❌ Entries not found in config:');
    stats.notFound.forEach(key => console.log(`   - ${key}`));
  }
  
  if (stats.metadataNotFound.length > 0) {
    console.log('\n⚠️  Entries with missing metadata (not in log or local):');
    stats.metadataNotFound.forEach(key => console.log(`   - ${key}`));
  }
  
  const metadataComplete = stats.metadataUpdated + stats.metadataGenerated;
  const metadataPercentage = ((metadataComplete / stats.total) * 100).toFixed(1);
  
  console.log(`\n✨ Done!`);
  console.log(`   Metadata completion: ${metadataComplete}/${stats.total} (${metadataPercentage}%)`);
  console.log(`\n💡 Tip: Run 'node bp-keet-req.js' to generate models-blind.txt for blind peers bot\n`);
}

main().catch(err => {
  console.error('💥 Error:', err);
  process.exit(1);
});

