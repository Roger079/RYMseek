// popup.js - Quick status popup logic for RYMseek

import { getConfig } from './config.js';

const valSlskdUrl = document.getElementById('val-slskd-url');
const valFormat = document.getElementById('val-format');
const badgeStatus = document.getElementById('badge-status');
const textStatus = document.getElementById('text-status');
const btnQuickTest = document.getElementById('btn-quick-test');
const btnOpenOptions = document.getElementById('btn-open-options');
const linkOpenNavidrome = document.getElementById('link-open-navidrome');
const testFeedback = document.getElementById('test-feedback');

function setStatusBadge(status, label) {
  badgeStatus.className = `badge-status ${status}`;
  textStatus.textContent = label;
}

async function testConnection(config) {
  setStatusBadge('', 'Testing...');
  testFeedback.className = 'test-feedback';
  try {
    const res = await chrome.runtime.sendMessage({
      action: 'TEST_CONNECTION',
      config
    });

    if (res && res.success) {
      setStatusBadge('connected', 'Online');
      const ver = typeof res.version === 'object' ? (res.version.current || 'v0.x') : res.version;
      testFeedback.textContent = `Connected (${ver})`;
      testFeedback.className = 'test-feedback ok';
    } else {
      setStatusBadge('error', 'Auth / Offline');
      testFeedback.textContent = res?.error || 'Connection failed';
      testFeedback.className = 'test-feedback err';
    }
  } catch (err) {
    setStatusBadge('error', 'Offline');
    testFeedback.textContent = err.message || 'Worker unreachable';
    testFeedback.className = 'test-feedback err';
  }
}

async function initPopup() {
  const config = await getConfig();

  // Populate UI
  valSlskdUrl.textContent = config.slskd_url ? config.slskd_url.replace(/^https?:\/\//, '') : 'Not set';
  valSlskdUrl.title = config.slskd_url;

  const formatLabels = {
    flac: 'FLAC Lossless',
    mp3_320: 'MP3 320k',
    any: 'Any format'
  };
  valFormat.textContent = formatLabels[config.preferred_format] || config.preferred_format;

  if (config.navidrome_url) {
    linkOpenNavidrome.href = config.navidrome_url;
  } else {
    linkOpenNavidrome.style.display = 'none';
  }

  // Quick test connection
  await testConnection(config);
}

btnQuickTest.addEventListener('click', async () => {
  const config = await getConfig();
  await testConnection(config);
});

btnOpenOptions.addEventListener('click', () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('options.html'));
  }
});

document.addEventListener('DOMContentLoaded', initPopup);
