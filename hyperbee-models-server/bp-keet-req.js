const fs = require('fs');
const path = require('path');

/**
 * Generate blind peers request file from keys.txt
 * 
 * This script reads keys.txt and generates models-blind.txt
 * with "request drive" commands for the blind peers bot.
 */

async function main() {
  const baseDir = __dirname;
  const keysFile = path.join(baseDir, 'keys.txt');
  const outputFile = path.join(baseDir, 'models-blind.txt');
  
  console.log('🔧 Generating blind peers request file...\n');
  
  // Read keys.txt
  console.log('📖 Reading keys.txt...');
  const keysContent = fs.readFileSync(keysFile, 'utf-8');
  
  // Parse keys.txt
  const lines = keysContent.trim().split('\n');
  const blindEntries = [];
  
  // Skip first line (bee record)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts = line.split(' ');
    if (parts.length < 2) continue;
    
    const driveHash = parts.pop(); // Last part is the hash
    const beeKey = parts.join(' '); // Everything else is the BeeKey
    
    // Generate blind peers request format
    blindEntries.push(`request drive ${driveHash} ${beeKey}`);
  }
  
  console.log(`📊 Found ${blindEntries.length} entries in keys.txt (skipped DB record)\n`);
  
  // Create models-blind.txt
  console.log('💾 Creating models-blind.txt...');
  fs.writeFileSync(outputFile, blindEntries.join('\n') + '\n');
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total entries:               ${blindEntries.length}`);
  console.log(`Output file:                 ${path.basename(outputFile)}`);
  console.log('='.repeat(60));
  
  console.log(`\n✨ Done! Created ${outputFile}`);
  console.log(`   Contains ${blindEntries.length} "request drive" commands for blind peers bot\n`);
}

main().catch(err => {
  console.error('💥 Error:', err);
  process.exit(1);
});

