// config.js - Central configuration defaults and storage utilities for RYMseek

export const DEFAULT_CONFIG = {
  slskd_url: 'https://slskd.furroge.uk',
  slskd_api_key: 'slskdDownloadTest',
  slskd_username: '',
  slskd_password: '',
  navidrome_url: 'https://music.furroge.uk',
  preferred_format: 'flac', // 'flac' | 'mp3_320' | 'any'
  min_upload_speed_kbps: 0,
  max_user_queue: 50,
  search_timeout_seconds: 15,
  min_track_count_fallback: 4,
  watch_downloads: true,
  max_fallback_attempts: 3,
  fail_threshold_percent: 30,
  post_download_webhook_url: '' // Optional HTTP(S) endpoint to trigger after an album finishes downloading
};

/**
 * Normalizes URL and ensures protocol is present without trailing slash
 */
export function normalizeUrl(url) {
  if (!url) return '';
  let trimmed = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  return trimmed;
}

/**
 * Retrieve current user configuration merged with defaults.
 * @returns {Promise<typeof DEFAULT_CONFIG>}
 */
export async function getConfig() {
  try {
    const keys = Object.keys(DEFAULT_CONFIG);
    const stored = await chrome.storage.local.get(keys);
    return { ...DEFAULT_CONFIG, ...stored };
  } catch (err) {
    console.error('[RYMseek] Error loading config from storage:', err);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Persist configuration updates to chrome.storage.local.
 * @param {Partial<typeof DEFAULT_CONFIG>} updates
 * @returns {Promise<typeof DEFAULT_CONFIG>}
 */
export async function saveConfig(updates) {
  if (updates.slskd_url) {
    updates.slskd_url = normalizeUrl(updates.slskd_url);
  }
  if (updates.navidrome_url) {
    updates.navidrome_url = normalizeUrl(updates.navidrome_url);
  }
  if (typeof updates.slskd_username === 'string') {
    updates.slskd_username = updates.slskd_username.trim();
  }
  if (typeof updates.post_download_webhook_url === 'string') {
    updates.post_download_webhook_url = updates.post_download_webhook_url.trim();
  }
  if (typeof updates.min_upload_speed_kbps !== 'undefined') {
    updates.min_upload_speed_kbps = Math.max(0, parseInt(updates.min_upload_speed_kbps, 10) || 0);
  }
  if (typeof updates.max_user_queue !== 'undefined') {
    updates.max_user_queue = Math.max(1, parseInt(updates.max_user_queue, 10) || 50);
  }
  if (typeof updates.search_timeout_seconds !== 'undefined') {
    updates.search_timeout_seconds = Math.max(3, Math.min(60, parseInt(updates.search_timeout_seconds, 10) || 15));
  }
  if (typeof updates.min_track_count_fallback !== 'undefined') {
    updates.min_track_count_fallback = Math.max(1, parseInt(updates.min_track_count_fallback, 10) || 4);
  }
  if (typeof updates.watch_downloads !== 'undefined') {
    updates.watch_downloads = Boolean(updates.watch_downloads);
  }
  if (typeof updates.max_fallback_attempts !== 'undefined') {
    updates.max_fallback_attempts = Math.max(1, Math.min(10, parseInt(updates.max_fallback_attempts, 10) || 3));
  }
  if (typeof updates.fail_threshold_percent !== 'undefined') {
    updates.fail_threshold_percent = Math.max(10, Math.min(90, parseInt(updates.fail_threshold_percent, 10) || 30));
  }

  // If user changed credentials, clear existing cached token
  await chrome.storage.local.remove('slskd_session_token');
  await chrome.storage.local.set(updates);
  return await getConfig();
}
