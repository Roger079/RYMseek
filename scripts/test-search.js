// scripts/test-search.js
const fs = require('fs');

(async () => {
  const base = 'https://slskd.furroge.uk';
  const apiKey = 'slskdDownloadTest';

  console.log('Initiating search for "Radiohead In Rainbows"...');
  const initRes = await fetch(base + '/api/v0/searches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ searchText: 'Radiohead In Rainbows' })
  });
  const initData = await initRes.json();
  const searchId = initData.id;
  console.log('Search ID:', searchId);

  // Poll over 10 seconds to see how responses arrive
  for (let i = 1; i <= 6; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const pollRes = await fetch(base + '/api/v0/searches/' + searchId, {
      headers: { 'X-API-Key': apiKey }
    });
    const data = await pollRes.json();
    console.log(`[T+${i * 2}s] isComplete: ${data.isComplete}, fileCount: ${data.fileCount}, responseCount: ${data.responseCount}, responses: ${data.responses ? data.responses.length : 'undefined'}`);

    if (data.responses && data.responses.length > 0) {
      console.log('Sample user:', data.responses[0].username, 'files:', data.responses[0].files?.length, 'locked:', data.responses[0].locked);
      if (data.responses[0].files && data.responses[0].files[0]) {
        console.log('Sample file:', data.responses[0].files[0]);
      }
      break;
    }
  }

  // Also check if /api/v0/searches/{id}/responses exists
  const subRes = await fetch(base + '/api/v0/searches/' + searchId + '/responses', {
    headers: { 'X-API-Key': apiKey }
  });
  console.log('GET /api/v0/searches/{id}/responses status:', subRes.status);
  if (subRes.ok) {
    const subData = await subRes.json();
    console.log('Sub responses length:', subData.length);
  }

  // Clean up
  await fetch(base + '/api/v0/searches/' + searchId, {
    method: 'DELETE',
    headers: { 'X-API-Key': apiKey }
  });
})();
