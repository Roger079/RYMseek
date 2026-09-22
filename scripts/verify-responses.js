// scripts/verify-responses.js
const fs = require('fs');

(async () => {
  const base = 'https://slskd.furroge.uk';
  const apiKey = 'slskdDownloadTest';

  console.log('Initiating search...');
  const initRes = await fetch(base + '/api/v0/searches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ searchText: 'Radiohead In Rainbows' })
  });
  const { id } = await initRes.json();
  console.log('Search ID:', id);

  let fileCount = 0;
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const p = await fetch(base + '/api/v0/searches/' + id, { headers: { 'X-API-Key': apiKey } });
    const pData = await p.json();
    console.log(`Poll ${i+1}: fileCount=${pData.fileCount}, responseCount=${pData.responseCount}, isComplete=${pData.isComplete}`);
    if (pData.fileCount > 0 || pData.isComplete) {
      fileCount = pData.fileCount;
      if (pData.responseCount >= 5 || pData.isComplete) {
        break;
      }
    }
  }

  // Fetch responses from /api/v0/searches/{id}/responses
  const rRes = await fetch(base + '/api/v0/searches/' + id + '/responses', {
    headers: { 'X-API-Key': apiKey }
  });
  const responses = await rRes.json();
  console.log('Fetched responses count:', responses.length);
  if (responses.length > 0) {
    const r = responses.find(x => x.files && x.files.length >= 8) || responses[0];
    console.log('Peer:', r.username, 'uploadSpeed:', r.uploadSpeed, 'queue:', r.queueLength, 'files:', r.files.length);
    console.log('Sample file:', r.files[0]);
  }

  await fetch(base + '/api/v0/searches/' + id, { method: 'DELETE', headers: { 'X-API-Key': apiKey } });
})();
