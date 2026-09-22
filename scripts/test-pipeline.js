// scripts/test-pipeline.js
const fs = require('fs');

const AUDIO_EXTENSIONS = new Set([
  '.flac', '.mp3', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.ape', '.wv', '.aiff'
]);

function getDirectoryName(filepath) {
  if (!filepath) return '';
  const lastSlash = Math.max(filepath.lastIndexOf('/'), filepath.lastIndexOf('\\'));
  return lastSlash !== -1 ? filepath.substring(0, lastSlash) : '';
}

function getExtension(filepath) {
  if (!filepath) return '';
  const dotIndex = filepath.lastIndexOf('.');
  return dotIndex !== -1 ? filepath.substring(dotIndex).toLowerCase() : '';
}

(async () => {
  const base = 'https://slskd.furroge.uk';
  const apiKey = 'slskdDownloadTest';
  const query = 'Radiohead In Rainbows';
  const trackCount = 10;
  const preferredFormat = 'flac';

  console.log(`Starting search for "${query}"...`);
  const initRes = await fetch(base + '/api/v0/searches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ searchText: query })
  });
  const { id } = await initRes.json();
  console.log('Search ID:', id);

  // Poll
  let searchMeta = null;
  for (let i = 0; i < 7; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const p = await fetch(base + '/api/v0/searches/' + id, { headers: { 'X-API-Key': apiKey } });
    searchMeta = await p.json();
    console.log(`Poll ${i+1}: fileCount=${searchMeta.fileCount}, responseCount=${searchMeta.responseCount}, isComplete=${searchMeta.isComplete}`);
    if (searchMeta.fileCount > 0 || searchMeta.isComplete) {
      if (searchMeta.responseCount >= 5 || searchMeta.isComplete) {
        break;
      }
    }
  }

  // Fetch responses from /responses endpoint
  const rRes = await fetch(base + '/api/v0/searches/' + id + '/responses', {
    headers: { 'X-API-Key': apiKey }
  });
  const responses = await rRes.json();
  console.log('Fetched responses:', responses.length);

  const candidateDirectories = [];
  const minTracksRequired = trackCount ? Math.max(2, Math.floor(trackCount * 0.6)) : 3;

  for (const userResp of responses) {
    const username = userResp.username;
    const uploadSpeed = userResp.uploadSpeed || 0;
    const queueLength = userResp.queueLength || 0;
    const hasFreeSlot = Boolean(userResp.hasFreeUploadSlot);
    const userLocked = Boolean(userResp.locked);

    if (userLocked || queueLength > 50) continue;

    const files = userResp.files || [];
    const dirMap = new Map();
    for (const file of files) {
      const dir = getDirectoryName(file.filename);
      if (!dirMap.has(dir)) dirMap.set(dir, []);
      dirMap.get(dir).push(file);
    }

    for (const [dirPath, dirFiles] of dirMap.entries()) {
      if (dirFiles.some(f => f.isLocked || f.locked)) continue;

      const audioFiles = dirFiles.filter(f => AUDIO_EXTENSIONS.has(getExtension(f.filename)));
      if (audioFiles.length < minTracksRequired) continue;

      let flacCount = 0;
      let mp3Count = 0;
      for (const af of audioFiles) {
        const ext = getExtension(af.filename);
        if (ext === '.flac') flacCount++;
        if (ext === '.mp3') mp3Count++;
      }

      const isFlac = flacCount >= (audioFiles.length / 2);
      let score = 0;
      if (preferredFormat === 'flac') {
        score += isFlac ? 1500 : 400;
      } else {
        score += isFlac ? 800 : 1500;
      }

      if (hasFreeSlot) score += 350;
      score += Math.min(300, Math.floor(uploadSpeed / 25000));
      score -= (queueLength * 12);
      score -= (Math.abs(audioFiles.length - trackCount) * 35);

      candidateDirectories.push({
        username,
        directory: dirPath,
        files: dirFiles,
        audioCount: audioFiles.length,
        format: isFlac ? 'FLAC' : 'MP3',
        speed: uploadSpeed,
        queue: queueLength,
        hasFreeSlot,
        score
      });
    }
  }

  console.log('Qualifying candidate directories found:', candidateDirectories.length);
  candidateDirectories.sort((a, b) => b.score - a.score);

  if (candidateDirectories.length > 0) {
    console.log('Top 3 candidates:');
    candidateDirectories.slice(0, 3).forEach((c, idx) => {
      console.log(` #${idx+1}: [${c.format}] ${c.username} | score: ${c.score} | tracks: ${c.audioCount} | queue: ${c.queue} | freeSlot: ${c.hasFreeSlot}`);
      console.log(`     path: ${c.directory}`);
    });
  }

  await fetch(base + '/api/v0/searches/' + id, { method: 'DELETE', headers: { 'X-API-Key': apiKey } });
})();
