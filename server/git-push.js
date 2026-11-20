const git = require('isomorphic-git');
const http = require('isomorphic-git/http/node');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const token = process.argv[2] || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

async function push() {
  if (!token) {
    console.error('Missing GitHub Personal Access Token.');
    console.log('Usage: node git-push.js <YOUR_GITHUB_TOKEN>');
    console.log('Or set $env:GITHUB_TOKEN = "your_token"');
    process.exit(1);
  }

  console.log('Pushing main branch to https://github.com/mattasaiswaroop5641-byte/Expence_Tracker.git ...');
  try {
    const pushResult = await git.push({
      fs,
      http,
      dir: rootDir,
      remote: 'origin',
      ref: 'main',
      force: true,
      onAuth: () => ({ username: token })
    });
    console.log('✓ Successfully pushed to GitHub!');
    console.log('Repo URL: https://github.com/mattasaiswaroop5641-byte/Expence_Tracker');
  } catch (err) {
    console.error('Push failed:', err.message);
    if (err.data) console.error('Error details:', err.data);
  }
}

push();
