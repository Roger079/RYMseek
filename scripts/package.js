// scripts/package.js - Builds and packages RYMseek for Chrome and Firefox Nightly Android
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const ffDir = path.join(distDir, 'firefox');
const chromeDir = path.join(distDir, 'chrome');

// Ensure dist directories
fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(ffDir, { recursive: true });
fs.mkdirSync(chromeDir, { recursive: true });

console.log('📦 Building RYMseek packages...');

// Common assets
const commonFiles = [
  'content.js',
  'content.css',
  'options.html',
  'options.js',
  'popup.html',
  'popup.js',
  'config.js'
];

// Helper to copy directory
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 1. Prepare Chrome distribution
console.log('  -> Preparing Chrome build...');
for (const file of commonFiles) {
  fs.copyFileSync(path.join(rootDir, file), path.join(chromeDir, file));
}
fs.copyFileSync(path.join(rootDir, 'background.js'), path.join(chromeDir, 'background.js'));
fs.copyFileSync(path.join(rootDir, 'manifest.json'), path.join(chromeDir, 'manifest.json'));
copyDir(path.join(rootDir, 'icons'), path.join(chromeDir, 'icons'));

// 2. Prepare Firefox Nightly distribution
console.log('  -> Preparing Firefox Nightly build...');
for (const file of commonFiles) {
  fs.copyFileSync(path.join(rootDir, file), path.join(ffDir, file));
}
copyDir(path.join(rootDir, 'icons'), path.join(ffDir, 'icons'));

// Bundle config.js directly into background.js for Firefox (avoids ES module issues in Firefox event pages)
const configContent = fs.readFileSync(path.join(rootDir, 'config.js'), 'utf-8')
  .replace(/export\s+/g, ''); // strip export keywords

const bgContent = fs.readFileSync(path.join(rootDir, 'background.js'), 'utf-8')
  .replace(/import\s*\{[^}]*\}\s*from\s*['"][^'"]*['"];?/g, ''); // strip import statement

const ffBackground = `// Firefox bundled background script\n${configContent}\n\n${bgContent}`;
fs.writeFileSync(path.join(ffDir, 'background.js'), ffBackground, 'utf-8');

// Firefox manifest
const chromeManifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf-8'));
const ffManifest = {
  manifest_version: 3,
  name: chromeManifest.name,
  version: chromeManifest.version,
  description: chromeManifest.description,
  browser_specific_settings: {
    gecko: {
      id: "rymseek@furroge.uk",
      strict_min_version: "109.0"
    }
  },
  icons: chromeManifest.icons,
  permissions: chromeManifest.permissions,
  host_permissions: chromeManifest.host_permissions,
  background: {
    scripts: ["background.js"]
  },
  content_scripts: chromeManifest.content_scripts,
  action: chromeManifest.action,
  options_ui: {
    page: "options.html",
    open_in_tab: true
  }
};
fs.writeFileSync(path.join(ffDir, 'manifest.json'), JSON.stringify(ffManifest, null, 2), 'utf-8');

// 3. Zip files
const chromeZip = path.join(rootDir, 'RYMseek-chrome.zip');
const ffZip = path.join(rootDir, 'RYMseek-firefox.zip');
const ffXpi = path.join(rootDir, 'RYMseek-firefox.xpi');

// Delete existing zips
if (fs.existsSync(chromeZip)) fs.unlinkSync(chromeZip);
if (fs.existsSync(ffZip)) fs.unlinkSync(ffZip);
if (fs.existsSync(ffXpi)) fs.unlinkSync(ffXpi);

console.log('  -> Compressing archives...');
execSync(`powershell -Command "Compress-Archive -Path '${chromeDir}\\*' -DestinationPath '${chromeZip}' -Force"`);
execSync(`powershell -Command "Compress-Archive -Path '${ffDir}\\*' -DestinationPath '${ffZip}' -Force"`);
fs.copyFileSync(ffZip, ffXpi);

console.log(`\n✅ Build complete!`);
console.log(`  Firefox Nightly ZIP: ${chromeZip}`);
console.log(`  Firefox Nightly ZIP: ${ffZip}`);
console.log(`  Firefox Nightly XPI: ${ffXpi}`);
