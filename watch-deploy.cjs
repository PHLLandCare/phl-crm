const chokidar = require('chokidar');
const { execSync } = require('child_process');

let timer = null;
let deploying = false;

console.log('👀 Watching for changes in src/ and public/...');
console.log('💡 Save any file to auto-deploy to GitHub Pages.\n');

chokidar.watch(['src', 'public'], {
  ignoreInitial: true,
  ignored: /node_modules/
}).on('all', (event, path) => {
  if (deploying) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    deploying = true;
    console.log(`\n📁 Change detected: ${path}`);
    console.log('🔨 Building and deploying...');
    try {
      execSync('git add .', { stdio: 'inherit' });
      execSync('git commit -m "auto-deploy: ' + new Date().toLocaleTimeString() + '"', { stdio: 'pipe' });
    } catch (e) {
      // nothing to commit, that's fine
    }
    try {
      execSync('npm run deploy', { stdio: 'inherit' });
      console.log('✅ Deployed! Live at https://phllandcare.github.io/phl-crm\n');
    } catch (e) {
      console.error('❌ Deploy failed:', e.message);
    }
    deploying = false;
  }, 2000); // waits 2 seconds after last save before deploying
});
