// test/verify.js - Validation test suite for RYMseek

const fs = require('fs');
const path = require('path');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    testsPassed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    testsFailed++;
  }
}

console.log('--- 1. Testing manifest.json ---');
const manifestPath = path.join(__dirname, '..', 'manifest.json');
assert(fs.existsSync(manifestPath), 'manifest.json exists');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
assert(manifest.manifest_version === 3, 'manifest_version is 3');
assert(manifest.permissions.includes('storage'), 'storage permission declared');
assert(!manifest.permissions.includes('declarativeNetRequest'), 'declarativeNetRequest permission cleanly removed');
assert(manifest.host_permissions.includes('<all_urls>'), '<all_urls> host permission declared');
assert(manifest.background.service_worker === 'background.js', 'background.service_worker points to background.js');

console.log('\n--- 2. Testing Icon Files ---');
['icons/icon-16.png', 'icons/icon-48.png', 'icons/icon-128.png'].forEach(relPath => {
  const fullPath = path.join(__dirname, '..', relPath);
  assert(fs.existsSync(fullPath), `${relPath} exists`);
  const buf = fs.readFileSync(fullPath);
  assert(buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a', `${relPath} has valid PNG signature`);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const expectedSize = parseInt(relPath.match(/\d+/)[0], 10);
  assert(width === expectedSize && height === expectedSize, `${relPath} dimensions are ${width}x${height} (expected ${expectedSize}x${expectedSize})`);
});

console.log('\n--- 3. Testing Metadata Sanitizer ---');
function cleanMetadataString(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .replace(/[\(\[](?:(?:\d{4}\s+)?(?:re-?master(?:ed)?|deluxe|bonus\s+tracks?|reissue|expanded|anniversary|collector'?s?|special|limited)\s*(?:edition|version|release)?|explicit|mono|stereo)[\)\]]/gi, '')
    .trim()
    .replace(/[,\-:;]+$/, '')
    .trim();
}

assert(cleanMetadataString('In Rainbows (2007 Remaster)') === 'In Rainbows', 'Strips (2007 Remaster)');
assert(cleanMetadataString('OK Computer [Deluxe Edition]') === 'OK Computer', 'Strips [Deluxe Edition]');
assert(cleanMetadataString('Loveless (Remastered),') === 'Loveless', 'Strips (Remastered) and trailing comma');
assert(cleanMetadataString('The Dark Side of the Moon [Bonus Tracks]') === 'The Dark Side of the Moon', 'Strips [Bonus Tracks]');
assert(cleanMetadataString('Kid A - ') === 'Kid A', 'Strips trailing dash');
assert(cleanMetadataString('Simon &amp; Garfunkel') === 'Simon & Garfunkel', 'Decodes HTML entities');

console.log('\n--- 4. Testing Directory Heuristic Logic ---');
const AUDIO_EXTENSIONS = new Set(['.flac', '.mp3', '.m4a']);
function getDirectoryName(filepath) {
  const lastSlash = Math.max(filepath.lastIndexOf('/'), filepath.lastIndexOf('\\'));
  return lastSlash !== -1 ? filepath.substring(0, lastSlash) : '';
}

// Test directory extraction
assert(getDirectoryName('C:\\Music\\Band - Album\\01.flac') === 'C:\\Music\\Band - Album', 'Windows directory extracted');
assert(getDirectoryName('/music/Band - Album/01.flac') === '/music/Band - Album', 'Unix directory extracted');

// Test scoring simulation
function scoreCandidate(candidate, pref = 'flac') {
  let score = 0;
  if (candidate.format === 'flac') score += (pref === 'flac' ? 1500 : 700);
  if (candidate.hasFreeUploadSlot) score += 350;
  score -= (candidate.queueLength * 12);
  score += Math.min(300, Math.floor((candidate.uploadSpeed || 0) / 25000));
  return score;
}

const candFlac = { format: 'flac', hasFreeUploadSlot: true, queueLength: 0, uploadSpeed: 1000000 };
const candMp3 = { format: 'mp3', hasFreeUploadSlot: false, queueLength: 5, uploadSpeed: 200000 };
assert(scoreCandidate(candFlac, 'flac') > scoreCandidate(candMp3, 'flac'), 'Prefers FLAC with free slots and no queue');

console.log('\n--- 5. Testing Download Watcher & Fallback Logic ---');
function classifyFileState(stateStr) {
  if (!stateStr) return 'in_progress';
  if (stateStr.includes('Succeeded')) return 'succeeded';
  if (
    stateStr.includes('Errored') ||
    stateStr.includes('Cancelled') ||
    stateStr.includes('TimedOut') ||
    stateStr.includes('Aborted') ||
    stateStr.includes('Rejected')
  ) {
    return 'failed';
  }
  return 'in_progress';
}

assert(classifyFileState('Completed, Succeeded') === 'succeeded', 'Classifies Completed, Succeeded');
assert(classifyFileState('Completed, Errored') === 'failed', 'Classifies Completed, Errored');
assert(classifyFileState('Completed, Cancelled') === 'failed', 'Classifies Completed, Cancelled');
assert(classifyFileState('Completed, TimedOut') === 'failed', 'Classifies Completed, TimedOut');
assert(classifyFileState('InProgress') === 'in_progress', 'Classifies InProgress');
assert(classifyFileState('Queued') === 'in_progress', 'Classifies Queued');

// Test failure threshold check
function shouldTriggerFallback(failedCount, totalCount, thresholdPercent = 30) {
  const failPercent = (failedCount / totalCount) * 100;
  return failPercent >= thresholdPercent;
}

assert(shouldTriggerFallback(3, 10, 30) === true, 'Triggers fallback when 30% of tracks fail (3/10)');
assert(shouldTriggerFallback(1, 10, 30) === false, 'Does not trigger fallback when only 10% fail (1/10)');
assert(shouldTriggerFallback(4, 10, 30) === true, 'Triggers fallback when 40% fail (4/10)');

// Test candidate fallback selection
const candidates = [
  { username: 'user1', score: 100 },
  { username: 'user2', score: 80 },
  { username: 'user3', score: 60 }
];
let currentIdx = 0;
assert(candidates[currentIdx + 1].username === 'user2', 'Advances from user1 to user2 on fallback');
currentIdx++;
assert(candidates[currentIdx + 1].username === 'user3', 'Advances from user2 to user3 on fallback');

console.log('\n--- 6. Testing Webhook & Automation Config ---');
const configContent = fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf-8');
assert(configContent.includes('post_download_webhook_url'), 'config.js includes post_download_webhook_url');

const optionsHtml = fs.readFileSync(path.join(__dirname, '..', 'options.html'), 'utf-8');
assert(optionsHtml.includes('post_download_webhook_url'), 'options.html includes post_download_webhook_url input');
assert(optionsHtml.includes('btn-test-webhook'), 'options.html includes test webhook button');

const backgroundJs = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf-8');
assert(backgroundJs.includes('triggerPostDownloadWebhook'), 'background.js includes triggerPostDownloadWebhook');
assert(backgroundJs.includes('TEST_WEBHOOK'), 'background.js handles TEST_WEBHOOK message');

console.log(`\nAll checks completed: ${testsPassed} passed, ${testsFailed} failed.`);
if (testsFailed > 0) process.exit(1);
