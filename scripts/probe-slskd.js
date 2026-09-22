// scripts/probe-slskd.js
const fs = require('fs');

(async () => {
  const base = 'https://slskd.furroge.uk';
  const endpoints = [
    '/',
    '/api/v0/application',
    '/api/v0/session',
    '/api/v0/options',
    '/api/v0/version',
    '/api/v0/transfers',
    '/api/v0/searches',
    '/api/v0/server',
    '/swagger/v1/swagger.json',
    '/swagger/index.html',
    '/api/v0/users'
  ];

  console.log('Probing:', base);
  for (const ep of endpoints) {
    try {
      const res = await fetch(base + ep, {
        headers: { 'Accept': 'application/json, text/plain, */*' }
      });
      const ct = res.headers.get('content-type') || '';
      let text = await res.text();
      text = text.replace(/\r?\n/g, ' ').substring(0, 150);
      console.log(`${ep.padEnd(28)} -> ${res.status} [${ct}] ${text}`);
    } catch (err) {
      console.log(`${ep.padEnd(28)} -> Error: ${err.message}`);
    }
  }
})();
