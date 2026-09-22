// scripts/test-queries.js
const fs = require('fs');

(async () => {
  const base = 'https://slskd.furroge.uk';
  const apiKey = 'slskdDownloadTest';

  async function testQuery(q) {
    const res = await fetch(base + '/api/v0/searches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({ searchText: q })
    });
    const { id } = await res.json();
    await new Promise(r => setTimeout(r, 3500));
    const p = await fetch(base + '/api/v0/searches/' + id, { headers: { 'X-API-Key': apiKey } });
    const pData = await p.json();
    console.log(`Query [${q}] -> fileCount: ${pData.fileCount}, responseCount: ${pData.responseCount}`);
    await fetch(base + '/api/v0/searches/' + id, { method: 'DELETE', headers: { 'X-API-Key': apiKey } });
  }

  await testQuery('Radiohead In Rainbows');
  await testQuery('Radiohead In Rainbows (2007)');
  await testQuery('Radiohead - In Rainbows');
  await testQuery('Radiohead');
})();
