// options.js - Settings logic for RYMseek

import { DEFAULT_CONFIG, getConfig, saveConfig } from './config.js';

const form = document.getElementById('settings-form');
const slskdUrlInput = document.getElementById('slskd_url');
const slskdUsernameInput = document.getElementById('slskd_username');
const slskdPasswordInput = document.getElementById('slskd_password');
const slskdApiKeyInput = document.getElementById('slskd_api_key');
const navidromeUrlInput = document.getElementById('navidrome_url');
const preferredFormatInput = document.getElementById('preferred_format');
const minUploadSpeedInput = document.getElementById('min_upload_speed_kbps');
const maxUserQueueInput = document.getElementById('max_user_queue');
const searchTimeoutInput = document.getElementById('search_timeout_seconds');
const watchDownloadsInput = document.getElementById('watch_downloads');
const maxFallbackAttemptsInput = document.getElementById('max_fallback_attempts');
const failThresholdPercentInput = document.getElementById('fail_threshold_percent');
const postDownloadWebhookInput = document.getElementById('post_download_webhook_url');
const btnTest = document.getElementById('btn-test');
const btnTestWebhook = document.getElementById('btn-test-webhook');
const statusMsg = document.getElementById('status-msg');
const linkNavidrome = document.getElementById('link-navidrome');
const linkSlskd = document.getElementById('link-slskd');

function showStatus(text, type = 'success') {
  statusMsg.textContent = text;
  statusMsg.className = `status-msg ${type}`;
  if (type === 'success') {
    setTimeout(() => {
      statusMsg.className = 'status-msg';
    }, 4500);
  }
}

function updateHeaderLinks(slskdUrl, navidromeUrl) {
  if (linkSlskd && slskdUrl) {
    linkSlskd.href = slskdUrl;
  }
  if (linkNavidrome && navidromeUrl) {
    linkNavidrome.href = navidromeUrl;
  }
}

function getFormValues() {
  return {
    slskd_url: slskdUrlInput.value.trim(),
    slskd_username: slskdUsernameInput.value.trim(),
    slskd_password: slskdPasswordInput.value,
    slskd_api_key: slskdApiKeyInput.value.trim(),
    navidrome_url: navidromeUrlInput.value.trim(),
    preferred_format: preferredFormatInput.value,
    min_upload_speed_kbps: parseInt(minUploadSpeedInput.value, 10) || 0,
    max_user_queue: parseInt(maxUserQueueInput.value, 10) || 50,
    search_timeout_seconds: parseInt(searchTimeoutInput.value, 10) || 15,
    watch_downloads: watchDownloadsInput ? watchDownloadsInput.checked : true,
    max_fallback_attempts: parseInt(maxFallbackAttemptsInput.value, 10) || 3,
    fail_threshold_percent: parseInt(failThresholdPercentInput.value, 10) || 30,
    post_download_webhook_url: postDownloadWebhookInput ? postDownloadWebhookInput.value.trim() : ''
  };
}

async function loadSettings() {
  const config = await getConfig();
  slskdUrlInput.value = config.slskd_url || DEFAULT_CONFIG.slskd_url;
  slskdUsernameInput.value = config.slskd_username || '';
  slskdPasswordInput.value = config.slskd_password || '';
  slskdApiKeyInput.value = config.slskd_api_key || DEFAULT_CONFIG.slskd_api_key;
  navidromeUrlInput.value = config.navidrome_url || DEFAULT_CONFIG.navidrome_url;
  preferredFormatInput.value = config.preferred_format || 'flac';
  minUploadSpeedInput.value = config.min_upload_speed_kbps || 0;
  maxUserQueueInput.value = config.max_user_queue || 50;
  searchTimeoutInput.value = config.search_timeout_seconds || 15;
  if (watchDownloadsInput) {
    watchDownloadsInput.checked = config.watch_downloads !== false;
  }
  if (maxFallbackAttemptsInput) {
    maxFallbackAttemptsInput.value = config.max_fallback_attempts || 3;
  }
  if (failThresholdPercentInput) {
    failThresholdPercentInput.value = config.fail_threshold_percent || 30;
  }
  if (postDownloadWebhookInput) {
    postDownloadWebhookInput.value = config.post_download_webhook_url || '';
  }

  updateHeaderLinks(config.slskd_url, config.navidrome_url);
}

// Form submit handler
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const values = getFormValues();
  if (!values.slskd_url) {
    showStatus('Please enter a valid slskd Base URL.', 'error');
    return;
  }

  try {
    await saveConfig(values);
    updateHeaderLinks(values.slskd_url, values.navidrome_url);
    showStatus('Settings saved successfully! Testing connection...', 'loading');

    // Automatically test connection upon save
    const testResult = await chrome.runtime.sendMessage({
      action: 'TEST_CONNECTION',
      config: values
    });

    if (testResult && testResult.success) {
      const ver = typeof testResult.version === 'object' ? (testResult.version.current || 'v0.x') : testResult.version;
      showStatus(`Saved! Connected to slskd successfully (${ver}).`, 'success');
    } else {
      showStatus(`Settings saved, but connection failed: ${testResult?.error || 'Unknown error'}`, 'error');
    }
  } catch (err) {
    showStatus(`Failed to save settings: ${err.message}`, 'error');
  }
});

// Test connection handler
btnTest.addEventListener('click', async () => {
  const currentConfig = getFormValues();
  if (!currentConfig.slskd_url) {
    showStatus('Please enter a valid slskd Base URL to test.', 'error');
    return;
  }

  showStatus('Testing connection to slskd...', 'loading');
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'TEST_CONNECTION',
      config: currentConfig
    });

    if (response && response.success) {
      const ver = typeof response.version === 'object' ? (response.version.current || 'v0.x') : response.version;
      showStatus(`Connected to slskd successfully (${ver})!`, 'success');
    } else {
      showStatus(`Connection failed: ${response?.error || 'Unknown error'}`, 'error');
    }
  } catch (err) {
    showStatus(`Connection test error: ${err.message}`, 'error');
  }
});

// Test webhook handler
if (btnTestWebhook) {
  btnTestWebhook.addEventListener('click', async () => {
    const url = postDownloadWebhookInput ? postDownloadWebhookInput.value.trim() : '';
    if (!url) {
      showStatus('Please enter a Webhook URL to test.', 'error');
      return;
    }

    showStatus(`Sending test ping to webhook (${url})...`, 'loading');
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'TEST_WEBHOOK',
        url
      });

      if (response && response.success) {
        showStatus(`Webhook responded successfully (HTTP ${response.status || 200})!`, 'success');
      } else {
        showStatus(`Webhook test failed: ${response?.error || 'Server did not respond with 2xx'}`, 'error');
      }
    } catch (err) {
      showStatus(`Webhook error: ${err.message}`, 'error');
    }
  });
}

// Update links on input change
slskdUrlInput.addEventListener('input', () => updateHeaderLinks(slskdUrlInput.value, navidromeUrlInput.value));
navidromeUrlInput.addEventListener('input', () => updateHeaderLinks(slskdUrlInput.value, navidromeUrlInput.value));

document.addEventListener('DOMContentLoaded', loadSettings);
