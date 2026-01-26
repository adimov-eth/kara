export const PLAYER_HTML = `
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Karaoke Player</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg-deep: #0a0a0f;
      --bg-card: #12121a;
      --accent: #ff6b9d;
      --cyan: #4ecdc4;
      --text: #f0f0f5;
      --text-muted: #6b6b80;
    }
    html, body {
      font-family: 'Outfit', sans-serif;
      background: var(--bg-deep);
      color: var(--text);
      height: 100%;
      overflow: hidden;
    }
    .player-container {
      display: flex;
      flex-direction: column;
      height: 100vh;
      height: 100dvh;
    }
    .video-wrapper {
      flex: 1;
      position: relative;
      background: #000;
    }
    #player {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }
    .idle-state {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: var(--bg-deep);
    }
    .idle-icon {
      font-size: 6rem;
      margin-bottom: 24px;
      opacity: 0.3;
    }
    .idle-text {
      font-size: 2rem;
      color: var(--text-muted);
      font-weight: 300;
    }
    .info-bar {
      background: var(--bg-card);
      padding: 20px 32px;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }
    .now-playing {
      display: flex;
      align-items: center;
      margin-bottom: 16px;
    }
    .now-label {
      font-size: 0.75rem;
      color: var(--accent);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-right: 16px;
    }
    .now-title {
      font-size: 1.5rem;
      font-weight: 600;
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .now-singer {
      font-size: 1.2rem;
      color: var(--text-muted);
      margin-left: 16px;
    }
    .up-next {
      display: flex;
      gap: 24px;
    }
    .up-next-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      padding-top: 4px;
    }
    .up-next-list {
      display: flex;
      gap: 16px;
      flex: 1;
      overflow: hidden;
    }
    .up-next-item {
      background: rgba(255, 255, 255, 0.05);
      padding: 12px 16px;
      border-radius: 10px;
      min-width: 200px;
      max-width: 300px;
    }
    .up-next-song {
      font-size: 0.95rem;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 4px;
    }
    .up-next-singer {
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    .empty-queue {
      color: var(--text-muted);
      font-style: italic;
    }
    .connection-status {
      position: fixed;
      top: 12px;
      right: 12px;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      z-index: 100;
      transition: all 0.3s ease;
    }
    .connection-status.connected {
      background: rgba(78, 205, 196, 0.2);
      color: var(--cyan);
      border: 1px solid rgba(78, 205, 196, 0.3);
    }
    .connection-status.polling {
      background: rgba(255, 165, 2, 0.2);
      color: #ffa502;
      border: 1px solid rgba(255, 165, 2, 0.3);
    }
    .connection-status.disconnected {
      background: rgba(255, 107, 129, 0.2);
      color: #ff6b81;
      border: 1px solid rgba(255, 107, 129, 0.3);
    }
    .connection-status.extension {
      background: rgba(123, 237, 159, 0.2);
      color: #7bed9f;
      border: 1px solid rgba(123, 237, 159, 0.3);
    }
    .extension-mode {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: var(--bg-deep);
    }
    .extension-icon { font-size: 4rem; margin-bottom: 16px; }
    .extension-text { font-size: 1.5rem; color: var(--text-muted); }
  </style>
</head>
<body>
  <div class="player-container">
    <div class="connection-status disconnected" id="connectionStatus">Connecting...</div>
    <div class="video-wrapper">
      <div id="player"></div>
      <div class="idle-state" id="idleState">
        <div class="idle-icon">*</div>
        <div class="idle-text">Waiting for songs...</div>
      </div>
      <div id="extensionMode" class="extension-mode">
        <div class="extension-icon">📺</div>
        <div class="extension-text">Playing on venue TV</div>
      </div>
    </div>
    <div class="info-bar">
      <div class="now-playing" id="nowPlaying" style="display: none;">
        <span class="now-label">Now Playing</span>
        <span class="now-title" id="nowTitle"></span>
        <span class="now-singer" id="nowSinger"></span>
      </div>
      <div class="up-next">
        <span class="up-next-label">Up Next</span>
        <div class="up-next-list" id="upNextList">
          <span class="empty-queue">No songs in queue</span>
        </div>
      </div>
    </div>
  </div>

  <script src="https://www.youtube.com/iframe_api"></script>
  <script>
    const API = '/api';
    const PAUSE_VIDEO_ID = 'yRhlZ-X50R4';
    const PAUSE_DURATION = 7000; // 7 seconds

    let player = null;
    let playerReady = false;
    let currentVideoId = null;
    let state = { queue: [], nowPlaying: null, currentEpoch: 0 };
    let lastStateHash = '';
    let pollInterval;
    let isAdvancing = false;

    // Player modes: 'playing_song' | 'playing_pause' | 'idle_loop'
    let playerMode = 'idle_loop';
    let pauseTimeout = null;

    // Extension mode: when true, extension handles playback on venue TV
    let extensionConnected = false;

    // WebSocket connection
    let ws = null;
    let wsConnected = false;
    let wsReconnectTimeout = null;
    let wsReconnectAttempts = 0;
    let heartbeatInterval = null;
    const MAX_RECONNECT_DELAY = 30000;
    const BASE_RECONNECT_DELAY = 1000;

    function getReconnectDelay() {
      // Exponential backoff: 1s, 2s, 4s, 8s, ... capped at 30s
      const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, wsReconnectAttempts), MAX_RECONNECT_DELAY);
      return delay + Math.random() * 1000; // Add jitter
    }

    function updateConnectionStatus() {
      const el = document.getElementById('connectionStatus');
      if (!el) return;

      if (wsConnected) {
        el.className = 'connection-status connected';
        el.textContent = 'Live';
      } else if (pollInterval) {
        el.className = 'connection-status polling';
        el.textContent = 'Polling';
      } else {
        el.className = 'connection-status disconnected';
        el.textContent = 'Connecting...';
      }
    }

    function connectWebSocket() {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = protocol + '//' + location.host + '/?upgrade=websocket';

      updateConnectionStatus();

      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('WebSocket connected');
          wsConnected = true;
          wsReconnectAttempts = 0; // Reset on successful connection
          updateConnectionStatus();
          // Stop polling when WebSocket is connected
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
          // Subscribe as player
          ws.send(JSON.stringify({ type: 'subscribe', clientType: 'player' }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            handleWsMessage(msg);
          } catch (e) {
            console.error('Failed to parse WebSocket message:', e);
          }
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected');
          wsConnected = false;
          ws = null;
          updateConnectionStatus();
          // Fall back to polling
          if (!pollInterval && !document.hidden) {
            fetchState();
            pollInterval = setInterval(fetchState, 2000);
            updateConnectionStatus();
          }
          // Try to reconnect with exponential backoff
          wsReconnectAttempts++;
          const delay = getReconnectDelay();
          console.log('Reconnecting in ' + Math.round(delay/1000) + 's (attempt ' + wsReconnectAttempts + ')');
          wsReconnectTimeout = setTimeout(connectWebSocket, delay);
        };

        ws.onerror = (err) => {
          console.error('WebSocket error:', err);
        };
      } catch (e) {
        console.error('Failed to connect WebSocket:', e);
        // Fall back to polling
        if (!pollInterval && !document.hidden) {
          fetchState();
          pollInterval = setInterval(fetchState, 2000);
          updateConnectionStatus();
        }
      }
    }

    function handleWsMessage(msg) {
      switch (msg.type) {
        case 'state':
          extensionConnected = msg.extensionConnected ?? false;
          handleStateUpdate(msg.state);
          updatePlayerMode();
          break;
        case 'extensionStatus':
          extensionConnected = msg.connected;
          updatePlayerMode();
          break;
        case 'advanced':
          // State will follow, but we can pre-render
          if (msg.nowPlaying && !extensionConnected) {
            loadSong(msg.nowPlaying);
          }
          break;
        case 'pong':
          // Heartbeat response
          break;
      }
    }

    function updatePlayerMode() {
      const statusEl = document.getElementById('connectionStatus');
      const playerEl = document.getElementById('player');
      const extensionModeEl = document.getElementById('extensionMode');

      if (extensionConnected) {
        // Extension mode: hide embed player, show extension status
        statusEl.className = 'connection-status extension';
        statusEl.textContent = 'Extension';
        playerEl.style.display = 'none';
        extensionModeEl.style.display = 'flex';
        // Pause/stop the embed player if it's running
        if (playerReady && player && player.pauseVideo) {
          player.pauseVideo();
        }
      } else {
        // Normal mode: show embed player
        playerEl.style.display = 'block';
        extensionModeEl.style.display = 'none';
        updateConnectionStatus();
        // Resume playing if we have a song
        if (state.nowPlaying && playerReady) {
          loadSong(state.nowPlaying);
        }
      }
    }

    function handleStateUpdate(newState) {
      const hash = JSON.stringify(newState);
      if (hash === lastStateHash) return;
      lastStateHash = hash;

      const previousNowPlaying = state.nowPlaying;
      state = newState;
      render();

      // If nothing playing but queue has songs, start the first one
      // Skip this if extension is connected (it handles playback)
      if (!state.nowPlaying && state.queue.length > 0 && !isAdvancing && !extensionConnected) {
        advanceToNext();
        return;
      }

      // Load song if now playing changed (only when not in extension mode)
      if (state.nowPlaying && !extensionConnected) {
        const previousId = previousNowPlaying ? previousNowPlaying.id : null;
        if (state.nowPlaying.id !== previousId) {
          loadSong(state.nowPlaying);
        }
      } else if (!state.nowPlaying && state.queue.length === 0) {
        // Queue empty and nothing playing -> idle loop
        if (playerMode !== 'idle_loop' && playerMode !== 'playing_pause') {
          playerMode = 'idle_loop';
          if (playerReady && currentVideoId !== PAUSE_VIDEO_ID) {
            player.loadVideoById(PAUSE_VIDEO_ID);
            currentVideoId = PAUSE_VIDEO_ID;
          }
        }
      }
    }

    // Extract video ID
    function extractVideoId(url) {
      if (!url) return null;
      url = url.trim();

      const patterns = [
        /(?:youtube\\.com\\/watch\\?v=|youtu\\.be\\/|youtube\\.com\\/embed\\/)([a-zA-Z0-9_-]{11})/,
        /youtube\\.com\\/watch\\?.*&v=([a-zA-Z0-9_-]{11})/,
        /youtube\\.com\\/shorts\\/([a-zA-Z0-9_-]{11})/,
        /music\\.youtube\\.com\\/watch\\?v=([a-zA-Z0-9_-]{11})/,
        /music\\.youtube\\.com\\/watch\\?.*&v=([a-zA-Z0-9_-]{11})/,
        /m\\.youtube\\.com\\/watch\\?v=([a-zA-Z0-9_-]{11})/,
        /m\\.youtube\\.com\\/watch\\?.*&v=([a-zA-Z0-9_-]{11})/,
        /youtube\\.com\\/v\\/([a-zA-Z0-9_-]{11})/
      ];
      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
      }
      return null;
    }

    // YouTube IFrame API ready
    function onYouTubeIframeAPIReady() {
      player = new YT.Player('player', {
        width: '100%',
        height: '100%',
        videoId: PAUSE_VIDEO_ID, // Start with pause video
        playerVars: {
          autoplay: 1,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          fs: 1
        },
        events: {
          onReady: onPlayerReady,
          onStateChange: onPlayerStateChange,
          onError: onPlayerError
        }
      });
    }

    function onPlayerReady() {
      playerReady = true;
      // Check if there's already something to play
      if (state.nowPlaying) {
        loadSong(state.nowPlaying);
      } else {
        // Start in idle loop mode
        playerMode = 'idle_loop';
        currentVideoId = PAUSE_VIDEO_ID;
      }
    }

    function onPlayerStateChange(event) {
      // Video ended
      if (event.data === YT.PlayerState.ENDED) {
        if (playerMode === 'playing_song') {
          // Song ended -> show pause screen, then advance
          playPauseScreen();
        } else if (playerMode === 'playing_pause' || playerMode === 'idle_loop') {
          // Pause video ended naturally -> loop it
          player.loadVideoById(PAUSE_VIDEO_ID);
          currentVideoId = PAUSE_VIDEO_ID;
        }
      }
    }

    function onPlayerError(event) {
      console.error('Player error:', event.data);
      // On error, try to advance to next or show pause screen
      if (playerMode === 'playing_song') {
        playPauseScreen();
      } else {
        // Error on pause video, just try to reload it
        player.loadVideoById(PAUSE_VIDEO_ID);
        currentVideoId = PAUSE_VIDEO_ID;
      }
    }

    function playPauseScreen() {
      playerMode = 'playing_pause';
      player.loadVideoById(PAUSE_VIDEO_ID);
      currentVideoId = PAUSE_VIDEO_ID;
      render(); // Update info bar to show "Up next"

      // Clear any existing timeout
      if (pauseTimeout) clearTimeout(pauseTimeout);

      // After pause duration, advance to next
      pauseTimeout = setTimeout(() => {
        advanceToNext();
      }, PAUSE_DURATION);
    }

    async function advanceToNext() {
      if (isAdvancing) return;
      isAdvancing = true;

      // Clear pause timeout if any
      if (pauseTimeout) {
        clearTimeout(pauseTimeout);
        pauseTimeout = null;
      }

      try {
        // Send current entry ID for idempotency (prevents double-advance from multiple tabs)
        const currentId = state.nowPlaying ? state.nowPlaying.id : null;
        await fetch(API + '/next', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentId })
        });
        lastStateHash = '';
        await fetchState();
      } catch (err) {
        console.error('Failed to advance:', err);
        // On error, go to idle loop
        playerMode = 'idle_loop';
        if (playerReady) {
          player.loadVideoById(PAUSE_VIDEO_ID);
          currentVideoId = PAUSE_VIDEO_ID;
        }
      } finally {
        isAdvancing = false;
      }
    }

    function loadSong(entry) {
      if (!entry || !playerReady) return;

      const videoId = extractVideoId(entry.youtubeUrl);
      if (videoId) {
        // Clear any pause timeout
        if (pauseTimeout) {
          clearTimeout(pauseTimeout);
          pauseTimeout = null;
        }
        playerMode = 'playing_song';
        currentVideoId = videoId;
        player.loadVideoById(videoId);
      }
    }

    // Fetch state (fallback when WebSocket unavailable)
    async function fetchState() {
      // Skip if WebSocket is connected
      if (wsConnected) return;

      try {
        const res = await fetch(API + '/state');
        const data = await res.json();
        handleStateUpdate(data);
      } catch (err) {
        console.error('Failed to fetch state:', err);
      }
    }

    function render() {
      const idleState = document.getElementById('idleState');
      const nowPlaying = document.getElementById('nowPlaying');
      const nowTitle = document.getElementById('nowTitle');
      const nowSinger = document.getElementById('nowSinger');
      const upNextList = document.getElementById('upNextList');

      // Always hide the old idle state since we use pause video now
      idleState.style.display = 'none';

      if (state.nowPlaying && playerMode === 'playing_song') {
        nowPlaying.style.display = 'flex';
        nowTitle.textContent = state.nowPlaying.youtubeTitle;
        nowSinger.textContent = state.nowPlaying.name;
      } else if (playerMode === 'playing_pause' && state.queue.length > 0) {
        // During pause screen, show "Up next" info
        nowPlaying.style.display = 'flex';
        nowTitle.textContent = state.queue[0].youtubeTitle;
        nowSinger.textContent = 'Up next: ' + state.queue[0].name;
      } else {
        nowPlaying.style.display = 'none';
      }

      // Up next list
      const upcoming = state.queue.slice(0, 3);
      if (upcoming.length === 0) {
        if (playerMode === 'idle_loop' || playerMode === 'playing_pause') {
          upNextList.innerHTML = '<span class="empty-queue">Waiting for songs... Scan to join!</span>';
        } else {
          upNextList.innerHTML = '<span class="empty-queue">No songs in queue</span>';
        }
      } else {
        // Skip first item if we're showing it as "Up next" in the now playing section during pause
        const displayList = (playerMode === 'playing_pause') ? upcoming.slice(1) : upcoming;
        if (displayList.length === 0) {
          upNextList.innerHTML = '<span class="empty-queue">No more songs after this</span>';
        } else {
          upNextList.innerHTML = displayList.map(entry => \`
            <div class="up-next-item">
              <div class="up-next-song">\${escapeHtml(entry.youtubeTitle)}</div>
              <div class="up-next-singer">\${escapeHtml(entry.name)}</div>
            </div>
          \`).join('');
        }
      }
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Initialize: try WebSocket first, fall back to polling
    connectWebSocket();

    // Fallback: start polling if WebSocket doesn't connect within 2s
    setTimeout(() => {
      if (!wsConnected && !pollInterval) {
        console.log('WebSocket not connected, falling back to polling');
        fetchState();
        pollInterval = setInterval(fetchState, 2000);
      }
    }, 2000);

    function startHeartbeat() {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      heartbeatInterval = setInterval(() => {
        if (ws && wsConnected) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
    }

    function stopHeartbeat() {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Pause polling when hidden
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
        // Stop heartbeat
        stopHeartbeat();
        // Close WebSocket when hidden to save resources
        if (ws) {
          ws.close();
        }
        if (wsReconnectTimeout) {
          clearTimeout(wsReconnectTimeout);
          wsReconnectTimeout = null;
        }
      } else {
        // Reset reconnect attempts when tab becomes visible
        wsReconnectAttempts = 0;
        // Reconnect when visible
        if (!wsConnected && !ws) {
          connectWebSocket();
        }
        // Also fetch state immediately as backup
        if (!wsConnected) {
          fetchState();
          if (!pollInterval) {
            pollInterval = setInterval(fetchState, 2000);
          }
        }
        // Start heartbeat
        startHeartbeat();
      }
    });

    // Start heartbeat
    startHeartbeat();
  </script>
</body>
</html>`
