// background.js - Service Worker for RYMseek
// Handles API calls to slskd (bypassing CORS), executes search polling, heuristics, and download enqueuing.

import { getConfig, normalizeUrl } from './config.js';

const AUDIO_EXTENSIONS = new Set([
  '.flac', '.mp3', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.ape', '.wv', '.aiff'
]);

/**
 * Returns path directory from Windows or Unix file path.
 */
function getDirectoryName(filepath) {
  if (!filepath) return '';
  const lastSlash = Math.max(filepath.lastIndexOf('/'), filepath.lastIndexOf('\\'));
  return lastSlash !== -1 ? filepath.substring(0, lastSlash) : '';
}

/**
 * Extracts file extension including dot (e.g. '.flac')
 */
function getExtension(filepath) {
  if (!filepath) return '';
  const dotIndex = filepath.lastIndexOf('.');
  return dotIndex !== -1 ? filepath.substring(dotIndex).toLowerCase() : '';
}

/**
 * Authenticates with slskd web session using username & password and returns a JWT Bearer token.
 */
async function loginAndGetSessionToken(config) {
  const baseUrl = normalizeUrl(config.slskd_url);
  if (!config.slskd_username || !config.slskd_password) {
    return null;
  }

  const loginUrl = `${baseUrl}/api/v0/session`;
  let res;
  try {
    res = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        username: config.slskd_username.trim(),
        password: config.slskd_password
      })
    });
  } catch (err) {
    throw new Error(`Failed to reach slskd at ${baseUrl}: ${err.message || err}`);
  }

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('slskd authentication failed: Invalid Username or Password.');
    }
    const errBody = await res.text().catch(() => '');
    throw new Error(`slskd login failed (HTTP ${res.status}): ${errBody || res.statusText}`);
  }

  const data = await res.json().catch(() => ({}));
  const token = data.token || data.accessToken || data.access_token;
  if (!token) {
    throw new Error('slskd login succeeded but did not return a session token.');
  }

  await chrome.storage.local.set({ slskd_session_token: token });
  return token;
}

/**
 * Returns authentication headers based on configured API key or session token.
 */
async function getAuthHeaders(config) {
  const headers = {};

  // 1. Direct API Key (slskd expects X-API-Key, Bearer is reserved strictly for JWT tokens)
  if (config.slskd_api_key && config.slskd_api_key.trim()) {
    const key = config.slskd_api_key.trim();
    headers['X-API-Key'] = key;
    return headers;
  }

  // 2. Username & Password session token
  if (config.slskd_username && config.slskd_password) {
    const { slskd_session_token } = await chrome.storage.local.get('slskd_session_token');
    if (slskd_session_token) {
      headers['Authorization'] = `Bearer ${slskd_session_token}`;
      return headers;
    }

    // Acquire new token
    const token = await loginAndGetSessionToken(config);
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      return headers;
    }
  }

  return headers;
}

/**
 * Helper to make authenticated requests to slskd
 */
async function slskdFetch(endpoint, options = {}, config, isRetry = false) {
  const baseUrl = normalizeUrl(config.slskd_url);
  if (!baseUrl) {
    throw new Error('slskd URL is not configured. Please check RYMseek extension options.');
  }

  const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  const authHeaders = await getAuthHeaders(config);

  const headers = {
    'Accept': 'application/json',
    ...authHeaders,
    ...(options.headers || {})
  };

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  let response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (netErr) {
    throw new Error(`Failed to connect to slskd at ${baseUrl}: ${netErr.message || netErr}`);
  }

  // If 401 and user has username/password configured, try refreshing session once
  if (response.status === 401 && !isRetry && config.slskd_username && config.slskd_password) {
    console.log('[RYMseek] 401 Unauthorized received. Attempting session refresh...');
    await chrome.storage.local.remove('slskd_session_token');
    try {
      await loginAndGetSessionToken(config);
      return await slskdFetch(endpoint, options, config, true);
    } catch (refreshErr) {
      console.error('[RYMseek] Session refresh failed:', refreshErr);
    }
  }

  return response;
}

/**
 * Tests connection to slskd instance.
 */
async function testSlskdConnection(targetConfig) {
  const config = targetConfig || (await getConfig());
  const baseUrl = normalizeUrl(config.slskd_url);

  if (!baseUrl) {
    return { success: false, error: 'slskd Base URL is empty.' };
  }

  try {
    // If username and password provided, authenticate first
    if (config.slskd_username && config.slskd_password) {
      try {
        await loginAndGetSessionToken(config);
      } catch (authErr) {
        return { success: false, error: authErr.message };
      }
    }

    // Try application info or session endpoint
    let res = await slskdFetch('/api/v0/application', { method: 'GET' }, config);
    if (res.status === 404) {
      res = await slskdFetch('/api/v0/session', { method: 'GET' }, config);
    }

    if (res.status === 401 || res.status === 403) {
      const hasAuthInfo = Boolean(config.slskd_api_key || (config.slskd_username && config.slskd_password));
      if (!hasAuthInfo) {
        return {
          success: false,
          error: 'Server is online, but authentication is required. Enter your slskd Username & Password (or API Key) in Options.'
        };
      }
      return {
        success: false,
        error: 'Authentication failed (401/403). Check your slskd API key or Username/Password.'
      };
    }

    if (!res.ok) {
      return { success: false, error: `slskd returned HTTP ${res.status}: ${res.statusText}` };
    }

    const data = await res.json().catch(() => ({}));
    const verStr = typeof data.version === 'object' ? data.version.current : data.version;
    const userStr = data.user?.username ? ` (${data.user.username})` : '';
    const version = (verStr ? `v${verStr}` : 'v0.x') + userStr;
    return {
      success: true,
      version,
      message: 'Successfully connected to slskd!'
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
/**
 * Initiates a search in slskd, polls metadata until results accumulate,
 * stops the search cleanly via PUT, and returns all peer responses with files.
 */
async function executeSearchAndCollectResponses(query, config) {
  console.log(`[RYMseek] Starting search for "${query}" on slskd (${config.slskd_url})`);

  // 1. Initiate Search
  const searchInitRes = await slskdFetch('/api/v0/searches', {
    method: 'POST',
    body: { searchText: query }
  }, config);

  if (!searchInitRes.ok) {
    const errorBody = await searchInitRes.text().catch(() => '');
    if (searchInitRes.status === 401) {
      throw new Error('Authentication required: Please configure your slskd Username & Password or API key in Extension Options.');
    }
    throw new Error(`slskd search initiation failed (HTTP ${searchInitRes.status}): ${errorBody || searchInitRes.statusText}`);
  }

  const searchInitData = await searchInitRes.json();
  const searchId = searchInitData.id;
  if (!searchId) {
    throw new Error('slskd did not return a valid search ID.');
  }

  console.log(`[RYMseek] Search initiated. ID: ${searchId}. Polling search progress...`);

  // 2. Poll /api/v0/searches/{id} for progress.
  // Note: slskd accumulates responses in memory while InProgress, but only exposes
  // the /responses array when the search finishes or is explicitly stopped via PUT.
  const timeoutMs = Math.max(12, (config.search_timeout_seconds || 15)) * 1000;
  const startTime = Date.now();
  let searchMeta = null;

  while ((Date.now() - startTime) < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      const metaRes = await slskdFetch(`/api/v0/searches/${encodeURIComponent(searchId)}`, {
        method: 'GET'
      }, config);

      if (metaRes.ok) {
        searchMeta = await metaRes.json();
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const respCount = searchMeta.responseCount || 0;
        const fileCount = searchMeta.fileCount || 0;
        console.log(`[RYMseek] [T+${elapsed}s] Search progress: peers=${respCount}, files=${fileCount}, complete=${searchMeta.isComplete}`);

        // If search completed naturally (e.g. limit reached or slskd timed out)
        if (searchMeta.isComplete) {
          break;
        }

        // Fast path: if at least 5 peers arrived and >= 3.5s elapsed, we have plenty of candidate peers
        if (respCount >= 5 && (Date.now() - startTime) >= 3500) {
          break;
        }

        // Sufficient path: if at least 1 peer arrived and >= 7.5s elapsed
        if (respCount >= 1 && (Date.now() - startTime) >= 7500) {
          break;
        }
      }
    } catch (pollErr) {
      console.warn('[RYMseek] Error during search poll:', pollErr);
    }
  }

  // Stop search if still running to force slskd to finalize and expose responses
  if (searchMeta && !searchMeta.isComplete) {
    try {
      console.log(`[RYMseek] Finalizing search ID ${searchId} via PUT to retrieve peer files...`);
      await slskdFetch(`/api/v0/searches/${encodeURIComponent(searchId)}`, {
        method: 'PUT'
      }, config);
    } catch (stopErr) {
      console.warn('[RYMseek] Error stopping search:', stopErr);
    }
  }

  // Now retrieve all responses populated by slskd
  let responses = [];
  try {
    const respRes = await slskdFetch(`/api/v0/searches/${encodeURIComponent(searchId)}/responses`, {
      method: 'GET'
    }, config);

    if (respRes.ok) {
      responses = await respRes.json();
    }
  } catch (fetchErr) {
    console.warn('[RYMseek] Error fetching responses:', fetchErr);
  }

  // Fallback check on search object if /responses was somehow empty
  if (!responses || responses.length === 0) {
    try {
      const metaRes = await slskdFetch(`/api/v0/searches/${encodeURIComponent(searchId)}`, {
        method: 'GET'
      }, config);
      if (metaRes.ok) {
        const meta = await metaRes.json();
        responses = meta.responses || [];
      }
    } catch (_) {}
  }

  console.log(`[RYMseek] Retrieved ${responses ? responses.length : 0} peer responses for query "${query}".`);
  return responses || [];
}

/**
 * Initiates search, polls for results, runs heuristics, and enqueues best match.
 */
async function handleSearchAndEnqueue(metadata, tabId) {
  const config = await getConfig();
  const { artist, album, year, trackCount } = metadata;

  // 1. Primary Query: Cleaned Artist + Album
  const cleanArtist = (artist || '').replace(/[\\\/:"*?<>|]+/g, ' ').trim();
  const cleanAlbum = (album || '').replace(/[\\\/:"*?<>|]+/g, ' ').trim();
  let query = `${cleanArtist} ${cleanAlbum}`.trim();

  let responses = await executeSearchAndCollectResponses(query, config);

  // If no responses found, try fallback query (stripping subtitles after ':' or '-')
  if ((!responses || responses.length === 0) && (cleanAlbum.includes(':') || cleanAlbum.includes('-'))) {
    const simplifiedAlbum = cleanAlbum.split(/[:\-]/)[0].trim();
    if (simplifiedAlbum && simplifiedAlbum.length > 2) {
      const fallbackQuery = `${cleanArtist} ${simplifiedAlbum}`.trim();
      if (fallbackQuery !== query) {
        console.log(`[RYMseek] No peers found for "${query}". Trying fallback query: "${fallbackQuery}"...`);
        responses = await executeSearchAndCollectResponses(fallbackQuery, config);
        if (responses && responses.length > 0) {
          query = fallbackQuery;
        }
      }
    }
  }

  if (!responses || responses.length === 0) {
    throw new Error(`No peer responses received for "${query}" within ${config.search_timeout_seconds || 15}s.`);
  }

  // 2. Heuristic Directory Evaluation
  const minTracksRequired = trackCount
    ? (trackCount === 1 ? 1 : Math.max(2, Math.floor(trackCount * 0.5)))
    : (config.min_track_count_fallback || 2);

  const minSpeedBytes = (config.min_upload_speed_kbps || 0) * 1024;
  const maxQueue = config.max_user_queue || 50;

  function evaluateCandidateFolders(maxAllowedQueue, minAllowedTracks) {
    const candidates = [];
    for (const userResp of responses) {
      const username = userResp.username;
      const uploadSpeed = userResp.uploadSpeed || 0;
      const queueLength = userResp.queueLength || 0;
      const hasFreeSlot = Boolean(userResp.hasFreeUploadSlot);
      const userLocked = Boolean(userResp.locked);

      // Filter out globally locked users or queue overflows
      if (userLocked || queueLength > maxAllowedQueue) continue;
      if (minSpeedBytes > 0 && uploadSpeed < minSpeedBytes) continue;

      const files = userResp.files || [];
      // Group files by folder directory
      const dirMap = new Map();
      for (const file of files) {
        const dir = getDirectoryName(file.filename);
        if (!dirMap.has(dir)) {
          dirMap.set(dir, []);
        }
        dirMap.get(dir).push(file);
      }

      for (const [dirPath, dirFiles] of dirMap.entries()) {
        // Check if any file is locked
        const hasLockedFile = dirFiles.some(f => f.isLocked || f.locked);
        if (hasLockedFile) continue;

        // Extract audio files
        const audioFiles = dirFiles.filter(f => {
          const ext = getExtension(f.filename);
          return AUDIO_EXTENSIONS.has(ext);
        });

        if (audioFiles.length < minAllowedTracks) {
          continue; // Skip partial album shares
        }

        // Check format composition
        let flacCount = 0;
        let mp3Count = 0;
        let totalBitrate = 0;
        let bitrateSamples = 0;

        for (const af of audioFiles) {
          const ext = getExtension(af.filename);
          if (ext === '.flac') flacCount++;
          if (ext === '.mp3') {
            mp3Count++;
            if (af.bitRate) {
              totalBitrate += af.bitRate;
              bitrateSamples++;
            }
          }
        }

        const isFlac = flacCount >= (audioFiles.length / 2);
        const avgBitrate = bitrateSamples > 0 ? Math.round(totalBitrate / bitrateSamples) : 0;
        const isMp3_320 = mp3Count > 0 && (avgBitrate >= 310 || avgBitrate === 0);

        // Scoring Algorithm
        let score = 0;
        const pref = config.preferred_format || 'flac';

        if (pref === 'flac') {
          if (isFlac) score += 1500;
          else if (isMp3_320) score += 500;
          else score += 150;
        } else if (pref === 'mp3_320') {
          if (isMp3_320) score += 1500;
          else if (isFlac) score += 800;
          else score += 250;
        } else {
          // Any format
          if (isFlac) score += 1100;
          else if (isMp3_320) score += 950;
          else score += 400;
        }

        // Free upload slot incentive
        if (hasFreeSlot) score += 350;

        // Upload speed incentive (up to 300 points)
        score += Math.min(300, Math.floor(uploadSpeed / 25000));

        // Queue penalty
        score -= (queueLength * 12);

        // Track count accuracy bonus / penalty
        if (trackCount) {
          const diff = Math.abs(audioFiles.length - trackCount);
          score -= (diff * 35);
        }

        // Relevance heuristics in directory path
        const dirLower = dirPath.toLowerCase();
        if (album && dirLower.includes(album.toLowerCase())) score += 150;
        if (artist && dirLower.includes(artist.toLowerCase())) score += 100;
        if (year && dirLower.includes(String(year))) score += 75;

        candidates.push({
          username,
          directory: dirPath,
          files: dirFiles,
          audioFileCount: audioFiles.length,
          format: isFlac ? 'flac' : (isMp3_320 ? 'mp3 320' : 'mp3'),
          uploadSpeed,
          queueLength,
          hasFreeSlot,
          score
        });
      }
    }
    return candidates;
  }

  // Pass 1: Strict criteria
  let candidateDirectories = evaluateCandidateFolders(maxQueue, minTracksRequired);

  // Pass 2: Relaxed fallback criteria if strict filter yielded no results
  if (candidateDirectories.length === 0) {
    console.log('[RYMseek] No candidates passed strict filter. Trying relaxed filter (higher queue, 1+ audio files)...');
    candidateDirectories = evaluateCandidateFolders(Math.max(250, maxQueue * 3), 1);
  }

  if (candidateDirectories.length === 0) {
    throw new Error(
      `Received ${responses.length} peer response(s), but all matching folders were locked or contained no audio files.`
    );
  }

  // Sort descending by score
  candidateDirectories.sort((a, b) => b.score - a.score);

  // Extract unique peer candidates (different usernames or different directory paths)
  const uniqueCandidates = [];
  const seenCandidates = new Set();
  for (const cand of candidateDirectories) {
    const key = `${cand.username.toLowerCase()}::${cand.directory.toLowerCase()}`;
    if (!seenCandidates.has(key)) {
      seenCandidates.add(key);
      uniqueCandidates.push(cand);
    }
    if (uniqueCandidates.length >= (config.max_fallback_attempts || 3) * 2) {
      break;
    }
  }

  const best = uniqueCandidates[0];
  console.log(`[RYMseek] Best candidate selected (#1 of ${uniqueCandidates.length}): user="${best.username}", score=${best.score}, format=${best.format}, tracks=${best.audioFileCount}`);

  // 3. Enqueue Download for the best candidate
  await enqueueCandidate(best, config);

  // 4. If watch_downloads is enabled, launch the background watcher to monitor and fallback if needed
  if (config.watch_downloads !== false) {
    // Run watcher in the background without blocking the initial message response
    startDownloadWatcher(uniqueCandidates, 0, metadata, tabId, config).catch(err => {
      console.error('[RYMseek] Download watcher error:', err);
    });
  }

  return {
    success: true,
    username: best.username,
    directory: best.directory,
    fileCount: best.files.length,
    audioCount: best.audioFileCount,
    format: best.format,
    speed: best.uploadSpeed,
    candidateCount: uniqueCandidates.length
  };
}

/**
 * Helper to enqueue a specific candidate
 */
async function enqueueCandidate(candidate, config) {
  const fileList = candidate.files.map(f => ({
    filename: f.filename,
    size: typeof f.size === 'number' ? f.size : 0
  }));

  const enqueuePayload = {
    username: candidate.username,
    files: fileList
  };

  let enqueueRes = await slskdFetch('/api/v0/transfers/enqueue', {
    method: 'POST',
    body: enqueuePayload
  }, config);

  // Fallback to alternative endpoint if /api/v0/transfers/enqueue is not available in specific slskd versions
  if (enqueueRes.status === 404 || enqueueRes.status === 405) {
    console.log('[RYMseek] /transfers/enqueue returned 404/405. Trying /transfers/downloads/{username} fallback...');
    enqueueRes = await slskdFetch(`/api/v0/transfers/downloads/${encodeURIComponent(candidate.username)}`, {
      method: 'POST',
      body: fileList
    }, config);
  }

  if (!enqueueRes.ok) {
    const errorBody = await enqueueRes.text().catch(() => '');
    // If files are already queued or in progress in slskd, treat as success
    if (errorBody.toLowerCase().includes('already in progress')) {
      console.log(`[RYMseek] Files for "${candidate.username}" are already in progress in slskd.`);
      return;
    }
    throw new Error(`Failed to enqueue transfer in slskd (HTTP ${enqueueRes.status}): ${errorBody || enqueueRes.statusText}`);
  }
}

/**
 * Cancels failed or stalled files for a specific peer.
 */
async function cancelUserFiles(username, fileIds, config) {
  if (!fileIds || fileIds.length === 0) return;
  console.log(`[RYMseek] Cancelling ${fileIds.length} failed/stalled files for user "${username}"...`);
  for (const fileId of fileIds) {
    try {
      await slskdFetch(`/api/v0/transfers/downloads/${encodeURIComponent(username)}/${encodeURIComponent(fileId)}`, {
        method: 'DELETE'
      }, config);
    } catch (_) {}
  }
}

/**
 * Sends a message safely to a tab.
 */
async function notifyTab(tabId, message) {
  if (!tabId) return;
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (_) {
    // Tab might have navigated or closed
  }
}

/**
 * Monitors active download progress, detects peer failures, and automatically falls back to alternative sources.
 */
async function startDownloadWatcher(candidates, initialCandidateIndex, metadata, tabId, config) {
  let currentIndex = initialCandidateIndex;
  let currentCandidate = candidates[currentIndex];
  let checkCount = 0;
  const maxChecks = 120; // 120 * 3s = 6 minutes max watch duration
  const pollIntervalMs = 3000;
  const maxFallbackAttempts = config.max_fallback_attempts || 3;
  const thresholdPercent = config.fail_threshold_percent || 30;

  console.log(`[RYMseek] Starting download watcher for "${currentCandidate.username}" (${metadata.artist} - ${metadata.album})`);

  while (checkCount < maxChecks) {
    await new Promise(r => setTimeout(r, pollIntervalMs));
    checkCount++;

    let downloadsData;
    try {
      const res = await slskdFetch('/api/v0/transfers/downloads', { method: 'GET' }, config);
      if (res.ok) {
        downloadsData = await res.json();
      }
    } catch (err) {
      console.warn('[RYMseek] Watcher poll error:', err.message);
      continue;
    }

    if (!Array.isArray(downloadsData)) continue;

    // Find current user's downloads
    const userDownloads = downloadsData.find(u =>
      u.username?.toLowerCase() === currentCandidate.username.toLowerCase()
    );

    if (!userDownloads || !userDownloads.directories) {
      continue;
    }

    // Match files for this candidate
    const candidateFileSet = new Set(currentCandidate.files.map(f => f.filename));
    const matchedFiles = [];
    for (const dir of userDownloads.directories) {
      for (const f of (dir.files || [])) {
        if (candidateFileSet.has(f.filename)) {
          matchedFiles.push(f);
        }
      }
    }

    if (matchedFiles.length === 0) continue;

    let succeededCount = 0;
    let failedCount = 0;
    let inProgressCount = 0;
    const failedFileIds = [];
    const pendingFileIds = [];

    for (const f of matchedFiles) {
      const st = f.state || '';
      if (st.includes('Succeeded')) {
        succeededCount++;
      } else if (
        st.includes('Errored') ||
        st.includes('Cancelled') ||
        st.includes('TimedOut') ||
        st.includes('Aborted') ||
        st.includes('Rejected')
      ) {
        failedCount++;
        if (f.id) failedFileIds.push(f.id);
      } else {
        inProgressCount++;
        if (f.id) pendingFileIds.push(f.id);
      }
    }

    const totalCount = currentCandidate.files.length;
    const percent = Math.round((succeededCount / totalCount) * 100);

    // Notify tab of live progress
    await notifyTab(tabId, {
      action: 'DOWNLOAD_PROGRESS',
      username: currentCandidate.username,
      format: currentCandidate.format,
      succeededCount,
      failedCount,
      inProgressCount,
      totalCount,
      percent
    });

    console.log(`[RYMseek] Watcher status: user="${currentCandidate.username}", succeeded=${succeededCount}, failed=${failedCount}, inProgress=${inProgressCount}, total=${totalCount}`);

    // Failure Threshold Detection
    const failPercent = (failedCount / totalCount) * 100;
    const hasFailed = (failPercent >= thresholdPercent) || (failedCount >= 2 && inProgressCount === 0 && succeededCount === 0);

    if (hasFailed) {
      console.warn(`[RYMseek] Peer "${currentCandidate.username}" exceeded failure threshold (${failedCount}/${totalCount} files failed).`);

      // Cancel remaining pending and failed files for this peer to clean up
      await cancelUserFiles(currentCandidate.username, [...failedFileIds, ...pendingFileIds], config);

      // Try next candidate
      if (currentIndex + 1 < candidates.length && (currentIndex + 1) < maxFallbackAttempts) {
        currentIndex++;
        const oldUser = currentCandidate.username;
        currentCandidate = candidates[currentIndex];
        console.log(`[RYMseek] Switching to fallback source #${currentIndex + 1}: "${currentCandidate.username}"`);

        await notifyTab(tabId, {
          action: 'DOWNLOAD_FALLBACK',
          oldUser,
          newUser: currentCandidate.username,
          candidateIndex: currentIndex + 1,
          totalCandidates: Math.min(candidates.length, maxFallbackAttempts),
          format: currentCandidate.format
        });

        try {
          await enqueueCandidate(currentCandidate, config);
        } catch (enqueueErr) {
          console.error(`[RYMseek] Error enqueuing fallback candidate "${currentCandidate.username}":`, enqueueErr);
        }

        checkCount = 0; // Reset watcher checks for the new candidate
        continue;
      } else {
        console.error('[RYMseek] All fallback candidate sources failed.');
        await notifyTab(tabId, {
          action: 'DOWNLOAD_FAILED',
          error: `Download failed: ${failedCount} files errored on peer "${currentCandidate.username}", and no more sources are available.`
        });
        break;
      }
    }

    // Success Completion Detection
    if (succeededCount >= totalCount || (inProgressCount === 0 && succeededCount > 0 && failedCount <= 1)) {
      console.log(`[RYMseek] Download job completed successfully (${succeededCount}/${totalCount} files)!`);
      await notifyTab(tabId, {
        action: 'DOWNLOAD_COMPLETED',
        username: currentCandidate.username,
        succeededCount,
        totalCount,
        format: currentCandidate.format
      });

      // Optional post-download automation webhook (e.g. running beets .bat script)
      if (config.post_download_webhook_url && config.post_download_webhook_url.trim()) {
        triggerPostDownloadWebhook(config.post_download_webhook_url.trim(), {
          event: 'AlbumDownloadComplete',
          artist: metadata.artist,
          album: metadata.album,
          year: metadata.year,
          trackCount: metadata.trackCount,
          username: currentCandidate.username,
          directory: currentCandidate.directory,
          format: currentCandidate.format,
          files: currentCandidate.files.map(f => f.filename)
        }).catch(err => console.warn('[RYMseek] Webhook trigger error:', err));
      }

      break;
    }
  }
}

/**
 * Triggers an optional post-download webhook URL (e.g. to run a local/remote beets batch script).
 */
async function triggerPostDownloadWebhook(webhookUrl, payload) {
  try {
    console.log(`[RYMseek] Pinging post-download webhook at ${webhookUrl}...`);
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    console.log(`[RYMseek] Webhook response: HTTP ${res.status}`);
    return { success: res.ok, status: res.status };
  } catch (err) {
    console.error('[RYMseek] Webhook fetch failed:', err);
    return { success: false, error: err.message || String(err) };
  }
}

// Runtime Message Listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'SEARCH_AND_ENQUEUE') {
    handleSearchAndEnqueue(message.metadata, sender.tab?.id)
      .then(result => sendResponse(result))
      .catch(err => {
        console.error('[RYMseek] Search/enqueue error:', err);
        sendResponse({ success: false, error: err.message || String(err) });
      });
    return true; // Keep message channel open for async response
  }

  if (message.action === 'TEST_CONNECTION') {
    testSlskdConnection(message.config)
      .then(result => sendResponse(result))
      .catch(err => {
        console.error('[RYMseek] Test connection error:', err);
        sendResponse({ success: false, error: err.message || String(err) });
      });
    return true;
  }

  if (message.action === 'TEST_WEBHOOK') {
    triggerPostDownloadWebhook(message.url, {
      event: 'TestPing',
      timestamp: new Date().toISOString(),
      message: 'Hello from RYMseek test!'
    })
      .then(result => sendResponse(result))
      .catch(err => {
        console.error('[RYMseek] Test webhook error:', err);
        sendResponse({ success: false, error: err.message || String(err) });
      });
    return true;
  }
});
