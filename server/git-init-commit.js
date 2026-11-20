const git = require('isomorphic-git');
const http = require('isomorphic-git/http/node');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

async function main() {
  console.log('Initializing Git repository in:', rootDir);
  await git.init({ fs, dir: rootDir, defaultBranch: 'main' });
  console.log('✓ Git repository initialized');

  // Helper to recursively collect files (respecting ignores)
  function getFiles(dir, baseDir = dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let files = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

      // Ignore patterns
      if (relPath === '.git' || relPath.startsWith('.git/')) continue;
      if (relPath === 'node_modules' || relPath.startsWith('node_modules/')) continue;
      if (relPath === 'server/node_modules' || relPath.startsWith('server/node_modules/')) continue;
      if (relPath.endsWith('.tmp.json')) continue;

      if (entry.isDirectory()) {
        files = files.concat(getFiles(fullPath, baseDir));
      } else {
        files.push(relPath);
      }
    }
    return files;
  }

  const allFiles = getFiles(rootDir);
  console.log(`Found ${allFiles.length} files to track:`);
  for (const f of allFiles) {
    console.log('  +', f);
    await git.add({ fs, dir: rootDir, filepath: f });
  }

  // Create initial commit
  const sha = await git.commit({
    fs,
    dir: rootDir,
    message: 'feat: Unified Expense Tracker from Friends Outings to Corporate Travel\n\n- Adaptive Mode Engine (Social, Hybrid, Corporate)\n- Live Debt Simplification Algorithm\n- Corporate Travel Policy & Compliance Engine\n- All Expenses Master Ledger & End-of-Trip Summary Tab\n- Clean local JSON Database Engine\n- Sleek Cream & Light-Red UI Theme',
    author: {
      name: 'mattasaiswaroop5641-byte',
      email: 'mattasaiswaroop@gmail.com'
    }
  });

  console.log('✓ Committed:', sha);

  // Set branch to main
  await git.branch({ fs, dir: rootDir, ref: 'main', checkout: true });

  // Add remote origin
  const remoteUrl = 'https://github.com/mattasaiswaroop5641-byte/Expence_Tracker.git';
  try {
    await git.addRemote({
      fs,
      dir: rootDir,
      remote: 'origin',
      url: remoteUrl,
      force: true
    });
  } catch (err) {
    // If remote already exists, that's fine
  }

  console.log('✓ Remote origin set to:', remoteUrl);
  console.log('\nRepository successfully initialized and committed locally!');
}

main().catch(err => {
  console.error('Git error:', err);
  process.exit(1);
});
