// content.js - RateYourMusic content script for RYMseek
// Scrapes release metadata and injects a Soulseek / Navidrome download button into RYM's streaming row.

(() => {
  'use strict';

  const BUTTON_ID = 'rymseek-btn';
  const CONTAINER_ID = 'rymseek-container';
  const TOOLTIP_ID = 'rymseek-tooltip';

  // SVG Icons
  const ICONS = {
    // Soulseek / Navidrome bird & music glyph
    idle: `
      <svg class="rymseek-icon rymseek-icon-idle" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14.5v-3.5h2.5L12 8.5 8.5 13H11v3.5h2zm-4.7-6.8c-.5 0-.9-.4-.9-.9s.4-.9.9-.9.9.4.9.9-.4.9-.9.9zm7.4 0c-.5 0-.9-.4-.9-.9s.4-.9.9-.9.9.4.9.9-.4.9-.9.9z"/>
      </svg>
    `,
    // Spinning loader ring
    loading: `
      <svg class="rymseek-icon rymseek-icon-loading" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="42" stroke-linecap="round" />
      </svg>
    `,
    // Green checkmark
    success: `
      <svg class="rymseek-icon rymseek-icon-success" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.2 14.2l-4-4 1.4-1.4 2.6 2.6 6.6-6.6 1.4 1.4-8 8z"/>
      </svg>
    `,
    // Red alert badge
    error: `
      <svg class="rymseek-icon rymseek-icon-error" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
      </svg>
    `
  };

  /**
   * Cleans text by stripping out remaster tags, bonus track labels, and punctuation.
   * @param {string} str
   * @returns {string}
   */
  function cleanMetadataString(str) {
    if (!str) return '';
    return str
      .replace(/&amp;/g, '&')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      // Remove tags like (2011 Remaster), [Bonus Tracks], (Deluxe Edition), [Expanded], etc.
      .replace(/[\(\[](?:(?:\d{4}\s+)?(?:re-?master(?:ed)?|deluxe|bonus\s+tracks?|reissue|expanded|anniversary|collector'?s?|special|limited)\s*(?:edition|version|release)?|explicit|mono|stereo)[\)\]]/gi, '')
      // Remove trailing (YYYY) release year if attached to the title string
      .replace(/\s*\(\s*(?:19|20)\d{2}\s*\)\s*$/g, '')
      .trim()
      // Remove trailing delimiters
      .replace(/[,\-:;]+$/, '')
      .trim();
  }

  /**
   * Scrapes metadata from current RYM release page.
   */
  function extractMetadata() {
    let artist = '';
    let album = '';
    let year = null;
    let trackCount = null;

    // 1. Artist Name
    const artistEl = document.querySelector(
      '.album_info .artist, .artist[itemprop="byArtist"], [itemprop="byArtist"] a, a.artist, .artist'
    );
    if (artistEl && artistEl.textContent.trim()) {
      const clone = artistEl.cloneNode(true);
      clone.querySelectorAll('small, span.parenthetical, script, style').forEach(el => el.remove());
      artist = cleanMetadataString(clone.textContent);
    } else {
      const metaArtist = document.querySelector('meta[property="music:musician"], meta[name="twitter:creator"]');
      if (metaArtist && metaArtist.content) {
        artist = cleanMetadataString(metaArtist.content);
      }
    }

    // 2. Album Title
    const titleEl = document.querySelector('.album_title, [itemprop="name"]');
    if (titleEl && titleEl.textContent.trim()) {
      const clone = titleEl.cloneNode(true);
      clone.querySelectorAll('.album_year, .release_year, .ui_bubble, .badge, small, span.parenthetical, script, style').forEach(el => el.remove());
      album = cleanMetadataString(clone.textContent);
    } else {
      const ogTitle = document.querySelector('meta[property="og:title"]')?.content;
      if (ogTitle) {
        if (ogTitle.includes(' by ')) {
          album = cleanMetadataString(ogTitle.split(' by ')[0]);
        } else {
          album = cleanMetadataString(ogTitle);
        }
      }
    }

    // Fallback: Parse document title (e.g. "Abbey Road by The Beatles (Album, Pop Rock): Reviews...")
    if ((!artist || !album) && document.title.includes(' by ')) {
      const titleParts = document.title.split(' by ');
      if (!album) album = cleanMetadataString(titleParts[0]);
      if (!artist && titleParts[1]) {
        artist = cleanMetadataString(titleParts[1].split('(')[0]);
      }
    }

    // 3. Release Year
    const datePub = document.querySelector('[itemprop="datePublished"]');
    if (datePub) {
      const m = datePub.textContent.match(/\b(19\d{2}|20\d{2})\b/);
      if (m) year = parseInt(m[1], 10);
    }
    if (!year) {
      const descriptors = document.querySelectorAll(
        '.release_pri_descriptors, .album_info, .release_date, tr.release_date'
      );
      for (const el of descriptors) {
        const m = el.textContent.match(/\b(19\d{2}|20\d{2})\b/);
        if (m) {
          year = parseInt(m[1], 10);
          break;
        }
      }
    }

    // 4. Track Count
    const trackRows = document.querySelectorAll(
      '#tracks .track, .tracklist tr.track, .tracklist tr[itemprop="track"], .section_tracklisting tr, tr.track'
    );
    let counted = 0;
    for (const row of trackRows) {
      if (row.querySelector('.track_num, .track_title, [itemprop="name"], .trackname') || row.classList.contains('track')) {
        counted++;
      }
    }
    if (counted > 0) {
      trackCount = counted;
    }

    return {
      artist,
      album,
      year,
      trackCount,
      pageUrl: window.location.href
    };
  }

  /**
   * Finds the best target element to inject the download action button.
   */
  function findInjectionTarget() {
    // 1. Direct streaming media link containers
    const mediaContainer = document.querySelector(
      '.ui_media_link_container, .ui_media_links, div.ui_media_link_btn_container'
    );
    if (mediaContainer) {
      return { container: mediaContainer, mode: 'append' };
    }

    // 2. Container holding data-media-type buttons (e.g. Spotify, Apple, Bandcamp)
    const mediaLink = document.querySelector('a[data-media-type], a.ui_media_link_btn');
    if (mediaLink && mediaLink.parentElement) {
      return { container: mediaLink.parentElement, mode: 'append' };
    }

    // 3. Release primary descriptors row
    const descriptors = document.querySelector('.release_pri_descriptors');
    if (descriptors) {
      return { container: descriptors, mode: 'append' };
    }

    // 4. Album shortcuts / info section
    const shortcuts = document.querySelector('.album_shortcuts, .release_page .album_info');
    if (shortcuts) {
      return { container: shortcuts, mode: 'append' };
    }

    return null;
  }

  /**
   * Updates visual state and tooltip message of the RYMseek button.
   * @param {string} state - 'idle' | 'loading' | 'success' | 'error'
   * @param {string} message - text for tooltip
   */
  function setButtonState(state, message) {
    const btn = document.getElementById(BUTTON_ID);
    const tooltip = document.getElementById(TOOLTIP_ID);
    if (!btn || !tooltip) return;

    btn.setAttribute('data-state', state);
    btn.setAttribute('aria-label', message);
    tooltip.textContent = message;
    tooltip.title = message;
  }

  /**
   * Handles user click on the RYMseek button.
   */
  async function handleDownloadClick(e) {
    e.preventDefault();
    e.stopPropagation();

    const btn = document.getElementById(BUTTON_ID);
    if (!btn || btn.getAttribute('data-state') === 'loading') {
      return;
    }

    const metadata = extractMetadata();
    console.log('[RYMseek] Extracted release metadata:', metadata);

    if (!metadata.artist || !metadata.album) {
      setButtonState('error', 'Could not detect Artist or Album title');
      return;
    }

    // Transition to loading
    const queryDisplay = `${metadata.artist} - ${metadata.album}`;
    setButtonState('loading', `Searching slskd for "${queryDisplay}"...`);

    try {
      // Send request to background service worker
      const response = await chrome.runtime.sendMessage({
        action: 'SEARCH_AND_ENQUEUE',
        metadata
      });

      if (response && response.success) {
        const trackNote = response.fileCount ? ` (${response.fileCount} tracks)` : '';
        const userNote = response.username ? ` from ${response.username}` : '';
        const formatNote = response.format ? ` [${response.format.toUpperCase()}]` : '';
        const initialMsg = `Queued${userNote}${trackNote}${formatNote}. Watching progress...`;
        
        console.log('[RYMseek] Download queued successfully:', response);
        setButtonState('downloading', initialMsg);
      } else {
        const errorMsg = response?.error || 'Unknown error querying slskd';
        console.error('[RYMseek] Error response:', errorMsg);
        setButtonState('error', errorMsg);
      }
    } catch (err) {
      console.error('[RYMseek] Error contacting background worker:', err);
      setButtonState('error', `Extension error: ${err.message || err}`);
    }
  }

  // Listen for real-time download watcher updates from the background service worker
  chrome.runtime.onMessage.addListener((message) => {
    const btn = document.getElementById(BUTTON_ID);
    if (!btn) return;

    if (message.action === 'DOWNLOAD_PROGRESS') {
      const formatStr = message.format ? ` [${message.format.toUpperCase()}]` : '';
      const progressMsg = `Downloading from ${message.username}${formatStr}: ${message.succeededCount}/${message.totalCount} tracks (${message.percent}%)`;
      setButtonState('downloading', progressMsg);
    } else if (message.action === 'DOWNLOAD_FALLBACK') {
      const fallbackMsg = `Peer "${message.oldUser}" failed. Trying source #${message.candidateIndex} (${message.newUser})...`;
      console.warn('[RYMseek]', fallbackMsg);
      setButtonState('loading', fallbackMsg);
    } else if (message.action === 'DOWNLOAD_COMPLETED') {
      const completeMsg = `Downloaded ${message.succeededCount}/${message.totalCount} tracks from ${message.username}!`;
      console.log('[RYMseek]', completeMsg);
      setButtonState('success', completeMsg);

      setTimeout(() => {
        if (btn.getAttribute('data-state') === 'success') {
          setButtonState('idle', 'Send to slskd / Navidrome');
        }
      }, 4500);
    } else if (message.action === 'DOWNLOAD_FAILED') {
      console.error('[RYMseek] Download failed:', message.error);
      setButtonState('error', message.error || 'Download failed across available sources.');
    }
  });

  /**
   * Injects the RYMseek button into the DOM.
   */
  function injectButton() {
    if (document.getElementById(BUTTON_ID)) {
      return true; // Already injected
    }

    const target = findInjectionTarget();
    if (!target || !target.container) {
      return false;
    }

    // Build the wrapper container
    const container = document.createElement('div');
    container.id = CONTAINER_ID;
    container.className = 'rymseek-container';

    // Build the button
    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.className = 'rymseek-btn ui_media_link_btn';
    btn.type = 'button';
    btn.setAttribute('data-state', 'idle');
    btn.setAttribute('aria-label', 'Send to slskd / Navidrome');
    btn.innerHTML = `
      ${ICONS.idle}
      ${ICONS.loading}
      ${ICONS.success}
      ${ICONS.error}
    `;

    // Build the tooltip
    const tooltip = document.createElement('div');
    tooltip.id = TOOLTIP_ID;
    tooltip.className = 'rymseek-tooltip';
    tooltip.textContent = 'Send to slskd / Navidrome';

    btn.addEventListener('click', handleDownloadClick);

    container.appendChild(btn);
    container.appendChild(tooltip);

    // Batch DOM insertion using requestAnimationFrame
    window.requestAnimationFrame(() => {
      target.container.appendChild(container);
      console.log('[RYMseek] Download button injected into:', target.container);
      // Once injected, disconnect observer to avoid continuous DOM inspection
      if (observer) {
        observer.disconnect();
      }
    });

    return true;
  }

  /**
   * Checks if current page is a Cloudflare Turnstile / anti-bot verification challenge.
   */
  function isCloudflareChallenge() {
    if (document.title && document.title.toLowerCase().includes('just a moment')) return true;
    if (document.querySelector('#challenge-running, #challenge-form, #cf-wrapper, .cf-browser-verification, #challenge-stage')) {
      return true;
    }
    return false;
  }

  function init() {
    // If on a Cloudflare challenge page, do not touch the DOM or attach observers
    if (isCloudflareChallenge()) {
      console.log('[RYMseek] Cloudflare challenge detected. Deferring injection.');
      return;
    }

    if (injectButton()) {
      return;
    }

    // Observe specific release page container if present, otherwise body
    const observeTarget = document.querySelector('.release_page, #page, .album_info') || document.body;
    if (!observeTarget) return;

    let debounceTimer = null;
    observer = new MutationObserver(() => {
      if (document.getElementById(BUTTON_ID)) {
        observer.disconnect();
        return;
      }
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (injectButton()) {
          observer.disconnect();
        }
      }, 250);
    });

    observer.observe(observeTarget, {
      childList: true,
      subtree: true
    });

    // Safety timeout: Disconnect observer after 10 seconds to eliminate background overhead
    setTimeout(() => {
      if (observer) observer.disconnect();
    }, 10000);
  }

  let observer = null;

  // Initial injection attempt
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
