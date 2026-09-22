# RYMseek - RateYourMusic to slskd / Navidrome

A Manifest V3 Chrome Extension that seamlessly integrates your self-hosted **slskd** (Soulseek daemon) and **Navidrome** music streaming server directly into **RateYourMusic (RYM)** release pages.

![RYMseek](icons/icon-128.png)

---

## Features

- 🎯 **Native-looking UI Injection**: Injects a custom rounded download button styled identically to RYM's existing streaming links (Spotify, Bandcamp, Apple Music) with dark mode synergy.
- 🧹 **Clean Metadata Scraping**: Extracts Artist, Album Title, Release Year, and Track Count while intelligently stripping remaster tags (e.g., `(2011 Remaster)`, `[Bonus Tracks]`, `Deluxe Edition`).
- ⚡ **Background Worker Routing**: Completely avoids browser CORS restrictions by routing queries through Chrome's Manifest V3 background service worker.
- 🧠 **Smart Heuristic Folder Selection**:
  - Automatically groups search results by folder.
  - Skips locked folders and users with congested download queues (> 50).
  - Matches folder file counts against RYM's tracklist count to avoid partial shares.
  - Scores candidates based on audio quality preference (**FLAC**, **MP3 320**, or **Any**), free upload slots, upload speeds, and folder naming relevance.
  - Retains top-ranked alternative peer folders for automatic retry.
- 🛡️ **Download Watcher & Auto-Fallback**:
  - Actively monitors the progress of enqueued downloads in slskd.
  - Detects if peer files fail (`Completed, Errored`, `TimedOut`, `Cancelled`, `Aborted`).
  - If a peer fails (e.g. >= 30% of tracks fail or peer goes offline), RYMseek cancels the stalled files and automatically switches to the next best source candidate!
- 🔄 **Real-time Status Feedback**:
  - **Idle**: Sleek Soulseek / music glyph matching RYM button standards.
  - **Searching/Loading**: Smooth rotating SVG spinner indicator.
  - **Downloading (Live)**: Shows real-time progress (`Downloading 4/10 tracks from [user] (40%)`).
  - **Auto-Fallback Notice**: Alerts when switching sources (`Peer failed. Trying source #2 (user2)...`).
  - **Success**: Vibrant green checkmark confirming completed download with user and track details for 4.5s.
  - **Error**: Red warning alert with a detailed tooltip showing the exact failure reason.
- ⚙️ **Configurable Dashboard & Popup**: Preconfigured for your instance (`https://slskd.furroge.uk` and `https://music.furroge.uk`) with live connection test, fallback controls, and format preference selectors.

---

## Installation Guide (Unpacked Extension)

1. Clone or download this repository to your computer:
   ```bash
   git clone https://github.com/Roger079/RYMseek.git
   ```
2. Open Google Chrome (or any Chromium browser like Brave, Edge, Vivaldi).
3. In the URL address bar, navigate to:
   ```text
   chrome://extensions
   ```
4. In the top right corner, enable **Developer mode**.
5. Click **Load unpacked** in the top left corner.
6. Select the folder containing `manifest.json` (the root of this repository).
7. RYMseek is now installed! Pin it to your Chrome toolbar for quick access.

---

## Configuration

Default endpoints are pre-populated:
- **slskd Base URL**: `https://slskd.furroge.uk`
- **Navidrome URL**: `https://music.furroge.uk`

To change or verify your configuration:
1. Click the RYMseek icon in your browser toolbar, then click **Extension Options ⚙** (or right-click the icon & select **Options**).
2. Enter your **slskd Base URL** (`https://slskd.furroge.uk`).
3. Enter your **Authentication**:
   - **Option 1 (Recommended)**: Enter your slskd Web UI **Username & Password** (the credentials you use to log into your slskd web dashboard).
   - **Option 2**: Enter your **slskd API Key** (if configured under `web.authentication.api_keys` in `slskd.yml`).
4. Set your **Preferred Audio Format**:
   - `FLAC Lossless Only (Recommended)`
   - `MP3 320 kbps`
   - `Any (FLAC preferred, then MP3 320)`
5. Click **Test Connection** to verify slskd connectivity.
6. Click **Save Settings**.

---

## How It Works

1. Visit any RateYourMusic release page (e.g., `https://rateyourmusic.com/release/album/...` or `mixtape/...`).
2. Notice the Soulseek button injected right into the streaming services icon bar.
3. Click the button:
   - RYMseek cleans the artist and title strings.
   - It triggers a background search on your slskd instance.
   - It polls for peer responses over the Soulseek network.
   - Once qualified directory candidates arrive, it ranks them by format, track count, free slots, and speed.
   - It calls `POST /api/v0/transfers/enqueue` on your slskd daemon to initiate the download.
   - The button transitions to a green checkmark indicating the selected peer and track count!

---

## Docker Setup Reference (slskd + Navidrome)

If mounting slskd and Navidrome together on a Docker host, both containers share the same `./music` storage volume so completed downloads are instantly indexed:

```yaml
services:
  slskd:
    image: slskd/slskd:latest
    container_name: slskd
    restart: unless-stopped
    ports:
      - "5030:5030"     # Web UI & REST API
      - "50300:50300"   # Soulseek peer transfer port
    environment:
      - SLSKD_REMOTE_CONFIGURATION=true
    volumes:
      - ./slskd/app:/app
      - ./music:/music:rw
      - ./music:/app/downloads:rw

  navidrome:
    image: deluan/navidrome:latest
    container_name: navidrome
    restart: unless-stopped
    ports:
      - "4533:4533"     # Navidrome Web UI
    environment:
      - ND_SCANSCHEDULE=1h
      - ND_LOGLEVEL=info
      - ND_BASEURL=https://music.furroge.uk
    volumes:
      - ./navidrome/data:/data
      - ./music:/music:ro
```

---

## License

MIT License.
