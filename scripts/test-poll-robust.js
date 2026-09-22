// scripts/test-poll-robust.js
const fs = require('fs');

(async () => {
  const base = 'https://slskd.furroge.uk';
  const apiKey = 'slskdDownloadTest';
  const query = 'Radiohead In Rainbows';

  console.log(`Testing robust polling on "${query}"...`);
  const initRes = await fetch(base + '/api/v0/searches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ searchText: query })
  });
  const { id } = await initRes.json();
  console.log('Search ID:', id);

  const startTime = Date.now();
  const timeoutMs = 15000;
  let responses = [];

  while (Date.now() - startTime < timeoutMs) {
    await new Promise(r => setTimeout(r, 1500));
    try {
      const respRes = await fetch(base + '/api/v0/searches/' + id + '/responses', {
        headers: { 'X-API-Key': apiKey }
      });
      if (respRes.ok) {
        responses = await respRes.json();
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[T+${elapsed}s] /responses returned ${responses.length} peer responses`);
        if (responses.length >= 5 || (responses.length > 0 && Date.now() - startTime >= 4500)) {
          break;
        }
      }
    } catch (err) {
      console.warn('Poll error:', err.message);
    }
  }

  console.log(`Final responses count: ${responses.length}`);
  await fetch(base + '/api/v0/searches/' + id, { method: 'DELETE', headers: { 'X-API-Key': apiKey } });
})();
