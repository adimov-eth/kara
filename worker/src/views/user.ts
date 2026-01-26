export const USER_HTML = `
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Karaoke Queue</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg-deep: #0a0a0f;
      --bg-card: #12121a;
      --accent: #ff6b9d;
      --accent-glow: rgba(255, 107, 157, 0.4);
      --cyan: #4ecdc4;
      --cyan-glow: rgba(78, 205, 196, 0.3);
      --text: #f0f0f5;
      --text-muted: #6b6b80;
      --success: #7bed9f;
      --warning: #ffa502;
    }
    body {
      font-family: 'Outfit', sans-serif;
      background: var(--bg-deep);
      color: var(--text);
      min-height: 100vh;
      min-height: 100dvh;
      overflow-x: hidden;
    }
    body::before {
      content: '';
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background:
        radial-gradient(ellipse at 20% 20%, rgba(255, 107, 157, 0.08) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 80%, rgba(78, 205, 196, 0.08) 0%, transparent 50%);
      pointer-events: none;
      z-index: 0;
    }
    .container {
      max-width: 480px;
      margin: 0 auto;
      padding: 24px 16px;
      position: relative;
      z-index: 1;
    }
    header { text-align: center; margin-bottom: 32px; }
    h1 {
      font-size: 2.5rem;
      font-weight: 800;
      background: linear-gradient(135deg, var(--accent) 0%, var(--cyan) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      letter-spacing: -0.02em;
      margin-bottom: 8px;
    }
    .subtitle { color: var(--text-muted); font-size: 0.95rem; font-weight: 300; }

    /* Now Playing */
    .now-playing-card {
      background: linear-gradient(135deg, rgba(255, 107, 157, 0.15) 0%, rgba(78, 205, 196, 0.1) 100%);
      border: 1px solid rgba(255, 107, 157, 0.3);
      border-radius: 20px;
      padding: 20px;
      margin-bottom: 24px;
      text-align: center;
    }
    .now-playing-label {
      font-size: 0.75rem;
      color: var(--accent);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 8px;
    }
    .now-playing-title {
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .now-playing-singer {
      color: var(--text-muted);
      font-size: 0.9rem;
    }
    .skip-own-btn {
      margin-top: 12px;
      background: rgba(255, 165, 2, 0.2);
      border: 1px solid rgba(255, 165, 2, 0.4);
      color: var(--warning);
      padding: 10px 20px;
      border-radius: 10px;
      font-size: 0.9rem;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .skip-own-btn:hover {
      background: rgba(255, 165, 2, 0.3);
    }
    .now-playing-empty {
      color: var(--text-muted);
      font-style: italic;
    }

    /* Join Form */
    .join-card {
      background: var(--bg-card);
      border-radius: 20px;
      padding: 24px;
      margin-bottom: 24px;
      border: 1px solid rgba(255, 255, 255, 0.05);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }
    .join-card.disabled {
      opacity: 0.6;
      pointer-events: none;
    }
    .input-group { margin-bottom: 16px; }
    .input-label {
      display: block;
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-bottom: 8px;
    }
    input[type="text"] {
      width: 100%;
      background: rgba(255, 255, 255, 0.05);
      border: 2px solid rgba(255, 255, 255, 0.1);
      border-radius: 14px;
      padding: 16px 20px;
      font-size: 1rem;
      font-family: inherit;
      color: var(--text);
      outline: none;
      transition: all 0.2s ease;
    }
    input[type="text"]:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 4px var(--accent-glow);
    }
    input[type="text"]::placeholder { color: var(--text-muted); }
    input[type="text"]:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn {
      background: linear-gradient(135deg, var(--accent) 0%, #ff8fab 100%);
      color: white;
      border: none;
      border-radius: 14px;
      padding: 16px 28px;
      font-size: 1rem;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
      width: 100%;
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px var(--accent-glow);
    }
    .btn:active { transform: translateY(0); }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }
    .error-msg {
      color: var(--warning);
      font-size: 0.85rem;
      margin-top: 12px;
      text-align: center;
      animation: shake 0.4s ease;
    }
    .validation-status {
      font-size: 0.85rem;
      margin-top: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .validation-status.checking { color: var(--cyan); }
    .validation-status.valid { color: var(--success); }
    .validation-status.invalid { color: var(--warning); }
    .validation-spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(78, 205, 196, 0.3);
      border-top-color: var(--cyan);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-8px); }
      75% { transform: translateX(8px); }
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Search UI */
    .search-row {
      display: flex;
      gap: 12px;
    }
    .search-row input {
      flex: 1;
    }
    .btn-search {
      flex-shrink: 0;
      width: auto;
      padding: 16px 24px;
      background: linear-gradient(135deg, var(--cyan) 0%, #45b7aa 100%);
    }
    .btn-search:hover {
      box-shadow: 0 8px 24px var(--cyan-glow);
    }
    .search-results {
      display: grid;
      gap: 12px;
      margin-top: 16px;
      max-height: 400px;
      overflow-y: auto;
    }
    .search-result {
      display: flex;
      gap: 12px;
      padding: 12px;
      background: rgba(255, 255, 255, 0.03);
      border: 2px solid transparent;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .search-result:hover {
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(255, 255, 255, 0.1);
    }
    .search-result.selected {
      background: rgba(78, 205, 196, 0.15);
      border-color: var(--cyan);
    }
    .search-result.too-long {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .search-result.too-long:hover {
      background: rgba(255, 255, 255, 0.03);
      border-color: transparent;
    }
    .result-thumb {
      width: 80px;
      height: 45px;
      border-radius: 6px;
      object-fit: cover;
      flex-shrink: 0;
      background: rgba(0,0,0,0.3);
    }
    .result-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .result-title {
      font-size: 0.9rem;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 4px;
    }
    .result-meta {
      font-size: 0.8rem;
      color: var(--text-muted);
      display: flex;
      gap: 8px;
    }
    .result-duration {
      color: var(--cyan);
    }
    .result-duration.too-long-text {
      color: var(--warning);
    }
    .searching-indicator {
      text-align: center;
      padding: 24px;
      color: var(--text-muted);
    }
    .no-results {
      text-align: center;
      padding: 24px;
      color: var(--text-muted);
    }
    .selected-song {
      background: rgba(78, 205, 196, 0.1);
      border: 1px solid rgba(78, 205, 196, 0.3);
      border-radius: 12px;
      padding: 16px;
      margin-top: 16px;
    }
    .selected-song-title {
      font-weight: 600;
      margin-bottom: 4px;
    }
    .selected-song-meta {
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    .url-toggle {
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 0.85rem;
      font-family: inherit;
      cursor: pointer;
      padding: 8px 0;
      margin-top: 8px;
      transition: color 0.2s ease;
    }
    .url-toggle:hover {
      color: var(--text);
    }
    .url-fallback {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
    .url-fallback.hidden {
      display: none;
    }

    /* Queue Section */
    .queue-section {
      background: var(--bg-card);
      border-radius: 20px;
      padding: 24px;
      border: 1px solid rgba(255, 255, 255, 0.05);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .section-title { font-size: 1.1rem; font-weight: 600; color: var(--text); }
    .queue-count {
      background: rgba(255, 255, 255, 0.1);
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    .queue-list { list-style: none; }
    .queue-item {
      display: flex;
      align-items: center;
      padding: 14px;
      border-radius: 14px;
      margin-bottom: 8px;
      background: rgba(255, 255, 255, 0.03);
      transition: all 0.2s ease;
      animation: slideIn 0.3s ease;
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateX(-20px); }
      to { opacity: 1; transform: translateX(0); }
    }
    .queue-item.is-mine {
      background: linear-gradient(135deg, rgba(78, 205, 196, 0.15) 0%, rgba(78, 205, 196, 0.05) 100%);
      border: 1px solid rgba(78, 205, 196, 0.3);
    }
    .position {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 0.85rem;
      margin-right: 12px;
      flex-shrink: 0;
      background: rgba(255, 255, 255, 0.1);
      color: var(--text-muted);
    }
    .queue-info { flex: 1; min-width: 0; }
    .queue-song {
      font-weight: 500;
      font-size: 0.95rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 2px;
    }
    .queue-singer {
      font-size: 0.8rem;
      color: var(--text-muted);
    }
    .queue-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-left: 12px;
    }
    .vote-btn {
      background: none;
      border: none;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
    }
    .vote-btn:hover { background: rgba(255, 255, 255, 0.1); }
    .vote-btn.upvote { color: var(--success); }
    .vote-btn.downvote { color: var(--accent); }
    .vote-btn.active { background: rgba(255, 255, 255, 0.15); }
    .vote-btn:disabled { opacity: 0.3; cursor: not-allowed; }
    .vote-count {
      font-size: 0.85rem;
      min-width: 24px;
      text-align: center;
      color: var(--text-muted);
    }
    .vote-count.positive { color: var(--success); }
    .vote-count.negative { color: var(--accent); }
    .remove-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 8px;
      border-radius: 8px;
      transition: all 0.2s ease;
      font-size: 0.9rem;
    }
    .remove-btn:hover {
      background: rgba(255, 107, 157, 0.2);
      color: var(--accent);
    }
    .empty-state {
      text-align: center;
      padding: 48px 24px;
      color: var(--text-muted);
    }
    .empty-icon { font-size: 3rem; margin-bottom: 16px; opacity: 0.5; }
    .loading { text-align: center; padding: 48px; color: var(--text-muted); }
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid rgba(255, 255, 255, 0.1);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 16px;
    }

    /* Toast */
    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: var(--bg-card);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 16px 24px;
      border-radius: 14px;
      font-size: 0.95rem;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      transition: transform 0.3s ease;
      z-index: 100;
    }
    .toast.show { transform: translateX(-50%) translateY(0); }
    .toast.success { border-color: rgba(123, 237, 159, 0.3); }

    /* Hidden YouTube player for validation */
    #validationPlayer { display: none; }

    /* Modal */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 200;
      padding: 16px;
    }
    .modal-overlay.show { display: flex; }
    .modal {
      background: var(--bg-card);
      border-radius: 24px;
      padding: 32px;
      max-width: 400px;
      width: 100%;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 16px 64px rgba(0, 0, 0, 0.5);
      animation: modalIn 0.3s ease;
    }
    @keyframes modalIn {
      from { opacity: 0; transform: scale(0.95) translateY(10px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    .modal h2 {
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 16px;
      text-align: center;
    }
    .modal p { color: var(--text-muted); margin-bottom: 12px; line-height: 1.5; }
    .modal ul {
      color: var(--text-muted);
      margin: 0 0 16px 20px;
      line-height: 1.6;
    }
    .modal ul li { margin-bottom: 4px; }
    .modal .highlight { color: var(--cyan); font-weight: 500; }
    .modal-input {
      width: 100%;
      background: rgba(255, 255, 255, 0.05);
      border: 2px solid rgba(255, 255, 255, 0.1);
      border-radius: 14px;
      padding: 16px 20px;
      font-size: 1.5rem;
      font-family: inherit;
      color: var(--text);
      outline: none;
      text-align: center;
      letter-spacing: 0.5em;
      margin-bottom: 16px;
    }
    .modal-input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 4px var(--accent-glow);
    }
    .modal-input::placeholder {
      color: var(--text-muted);
      letter-spacing: normal;
    }
    .modal .btn { margin-bottom: 12px; }
    .modal .small {
      font-size: 0.85rem;
      color: var(--text-muted);
      text-align: center;
    }
    .modal .skip-link {
      display: block;
      text-align: center;
      color: var(--text-muted);
      text-decoration: none;
      font-size: 0.9rem;
      margin-top: 12px;
      cursor: pointer;
    }
    .modal .skip-link:hover { color: var(--text); }
    .modal .hint {
      font-size: 0.85rem;
      color: var(--text-muted);
      text-align: center;
      margin-top: 12px;
    }
    .modal .hint a {
      color: var(--cyan);
      text-decoration: none;
      cursor: pointer;
    }
    .modal .hint a:hover { text-decoration: underline; }
    .modal-error {
      color: var(--warning);
      font-size: 0.9rem;
      text-align: center;
      margin-top: 8px;
      display: none;
    }
    .modal-error.show { display: block; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Karaoke</h1>
      <p class="subtitle">Pick a song, join the queue, sing your heart out</p>
    </header>

    <div class="now-playing-card" id="nowPlayingCard" style="display: none;">
      <div class="now-playing-label">Now Playing</div>
      <div class="now-playing-title" id="nowPlayingTitle"></div>
      <div class="now-playing-singer" id="nowPlayingSinger"></div>
      <button class="skip-own-btn" id="skipOwnBtn" style="display: none;" onclick="skipOwnSong()">Skip My Song</button>
    </div>

    <div class="join-card" id="joinCard">
      <div class="input-group">
        <label class="input-label">Your name</label>
        <input type="text" id="nameInput" placeholder="Enter your name" maxlength="30" autocomplete="off">
      </div>
      <div class="input-group">
        <label class="input-label">Search for a song</label>
        <div class="search-row">
          <input type="text" id="searchInput" placeholder="Song title or artist..." autocomplete="off">
          <button class="btn btn-search" id="searchBtn">Search</button>
        </div>
        <div id="searchResults"></div>
        <div id="selectedSong" class="selected-song" style="display: none;">
          <div class="selected-song-title" id="selectedTitle"></div>
          <div class="selected-song-meta" id="selectedMeta"></div>
        </div>
        <div class="validation-status" id="validationStatus" style="display: none;"></div>
        <button class="url-toggle" id="urlToggle">Have a link instead?</button>
        <div class="url-fallback hidden" id="urlFallback">
          <input type="text" id="urlInput" placeholder="Paste YouTube link" autocomplete="off">
        </div>
      </div>
      <button class="btn" id="joinBtn" disabled>Add to Queue</button>
      <div id="errorMsg" class="error-msg" style="display: none;"></div>
    </div>

    <div class="queue-section">
      <div class="section-header">
        <span class="section-title">Up Next</span>
        <span class="queue-count" id="queueCount">0 in queue</span>
      </div>
      <div id="queueContent">
        <div class="loading">
          <div class="spinner"></div>
          Loading queue...
        </div>
      </div>
    </div>
  </div>

  <div class="toast" id="toast"></div>
  <div id="validationPlayer"></div>

  <!-- PIN Claim Modal (after first song) -->
  <div class="modal-overlay" id="pinClaimModal">
    <div class="modal">
      <h2>You made karaoke history!</h2>
      <p>Your performance is saved. Set a PIN to:</p>
      <ul>
        <li>Keep <span class="highlight" id="claimNameDisplay"></span> as your stage name</li>
        <li>Build your songbook across devices</li>
        <li>See your stats and history anytime</li>
      </ul>
      <p>Pick a 6-digit PIN you'll remember:</p>
      <input type="text" class="modal-input" id="claimPinInput" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="------" autocomplete="off">
      <button class="btn" id="claimPinBtn" onclick="claimName()">Lock in my name</button>
      <div class="modal-error" id="claimError"></div>
      <p class="small">
        Skip for now? Anyone can use this name until you claim it.
      </p>
      <a class="skip-link" onclick="dismissClaimModal()">I'll set it up later</a>
    </div>
  </div>

  <!-- PIN Verify Modal (returning user) -->
  <div class="modal-overlay" id="pinVerifyModal">
    <div class="modal">
      <h2>Welcome back!</h2>
      <p><span class="highlight" id="verifyNameDisplay"></span> has a PIN. Enter it to continue.</p>
      <input type="text" class="modal-input" id="verifyPinInput" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="------" autocomplete="off">
      <button class="btn" id="verifyPinBtn" onclick="verifyPin()">Continue</button>
      <div class="modal-error" id="verifyError"></div>
      <p class="hint">Not you? <a onclick="changeName()">Use different name</a></p>
    </div>
  </div>

  <script src="https://www.youtube.com/iframe_api"></script>
  <script>
    const API = '/api';
    const MAX_DURATION = 420; // 7 minutes

    let state = { queue: [], nowPlaying: null, currentEpoch: 0 };
    let lastStateHash = '';
    let pollInterval;
    let validationPlayer = null;
    let validatedUrl = null;
    let validatedTitle = null;
    let selectedResult = null;
    let isSearching = false;

    // Session & identity - tracks which names have been verified this session
    let verifiedNames = JSON.parse(localStorage.getItem('karaoke_verified') || '{}');
    // Track pending join request while showing PIN modal
    let pendingJoinRequest = null;

    // WebSocket connection
    let ws = null;
    let wsConnected = false;
    let wsReconnectTimeout = null;
    let wsReconnectAttempts = 0;
    let heartbeatInterval = null;
    const MAX_RECONNECT_DELAY = 30000;
    const BASE_RECONNECT_DELAY = 1000;

    function getReconnectDelay() {
      const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, wsReconnectAttempts), MAX_RECONNECT_DELAY);
      return delay + Math.random() * 1000;
    }

    function connectWebSocket() {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = protocol + '//' + location.host + '/?upgrade=websocket';

      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('WebSocket connected');
          wsConnected = true;
          wsReconnectAttempts = 0;
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
          ws.send(JSON.stringify({ type: 'subscribe', clientType: 'user' }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'state') {
              handleStateUpdate(msg.state);
            }
          } catch (e) {
            console.error('Failed to parse WebSocket message:', e);
          }
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected');
          wsConnected = false;
          ws = null;
          if (!pollInterval && !document.hidden) {
            fetchState();
            pollInterval = setInterval(fetchState, 3000);
          }
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
        if (!pollInterval && !document.hidden) {
          fetchState();
          pollInterval = setInterval(fetchState, 3000);
        }
      }
    }

    function handleStateUpdate(newState) {
      const hash = JSON.stringify(newState);
      if (hash === lastStateHash) return;

      // Check if user's song just finished
      const wasPlaying = state.nowPlaying && state.nowPlaying.name.toLowerCase() === myName.toLowerCase();
      const isNowPlaying = newState.nowPlaying && newState.nowPlaying.name.toLowerCase() === myName.toLowerCase();
      if (wasPlaying && !isNowPlaying && myName) {
        // Check if this name is already claimed/verified
        const isVerified = verifiedNames[myName.toLowerCase()] === true;
        if (!isVerified) {
          // Show PIN claim modal - user hasn't set up a PIN yet
          showClaimModal(myName);
        } else {
          showToast('Your song is done! Add another?');
        }
      }

      lastStateHash = hash;
      state = newState;
      render();
    }

    // Get or create persistent IDs
    let myName = localStorage.getItem('karaoke_name') || '';
    let voterId = localStorage.getItem('karaoke_voter_id');
    if (!voterId) {
      voterId = crypto.randomUUID();
      localStorage.setItem('karaoke_voter_id', voterId);
    }
    let myVotes = JSON.parse(localStorage.getItem('karaoke_votes') || '{}');

    // Elements
    const nameInput = document.getElementById('nameInput');
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const searchResults = document.getElementById('searchResults');
    const selectedSong = document.getElementById('selectedSong');
    const selectedTitle = document.getElementById('selectedTitle');
    const selectedMeta = document.getElementById('selectedMeta');
    const urlToggle = document.getElementById('urlToggle');
    const urlFallback = document.getElementById('urlFallback');
    const urlInput = document.getElementById('urlInput');
    const joinBtn = document.getElementById('joinBtn');
    const errorMsg = document.getElementById('errorMsg');
    const validationStatus = document.getElementById('validationStatus');
    const queueContent = document.getElementById('queueContent');
    const queueCount = document.getElementById('queueCount');
    const nowPlayingCard = document.getElementById('nowPlayingCard');
    const nowPlayingTitle = document.getElementById('nowPlayingTitle');
    const nowPlayingSinger = document.getElementById('nowPlayingSinger');
    const skipOwnBtn = document.getElementById('skipOwnBtn');
    const joinCard = document.getElementById('joinCard');
    const toast = document.getElementById('toast');

    // Restore name
    if (myName) nameInput.value = myName;

    // YouTube IFrame API ready
    function onYouTubeIframeAPIReady() {
      // API is ready
    }

    // Extract video ID from URL
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

    // Validate YouTube URL
    async function validateUrl(url) {
      // Check for playlist-only URLs (no video ID present)
      if (url.includes('list=') && !url.includes('v=') && !url.includes('youtu.be/')) {
        showValidation('invalid', 'Playlists not supported - paste a single video');
        return false;
      }

      const videoId = extractVideoId(url);
      if (!videoId) {
        showValidation('invalid', 'Invalid YouTube URL');
        return false;
      }

      showValidation('checking', 'Checking video...');

      return new Promise((resolve) => {
        // Check if YouTube API is loaded
        if (typeof YT === 'undefined' || typeof YT.Player === 'undefined') {
          showValidation('invalid', 'YouTube API not loaded. Refresh the page.');
          resolve(false);
          return;
        }

        // Destroy existing player
        if (validationPlayer) {
          validationPlayer.destroy();
        }

        const container = document.getElementById('validationPlayer');
        container.innerHTML = '<div id="ytPlayer"></div>';

        validationPlayer = new YT.Player('ytPlayer', {
          height: '1',
          width: '1',
          videoId: videoId,
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1
          },
          events: {
            onReady: (event) => {
              const duration = event.target.getDuration();
              const data = event.target.getVideoData();

              if (duration === 0) {
                showValidation('invalid', 'Livestreams not allowed');
                resolve(false);
                return;
              }

              if (duration > MAX_DURATION) {
                const mins = Math.floor(duration / 60);
                const secs = Math.round(duration % 60);
                showValidation('invalid', \`Too long (\${mins}:\${secs.toString().padStart(2, '0')}) - max 7 minutes\`);
                resolve(false);
                return;
              }

              validatedUrl = url;
              validatedTitle = selectedResult ? selectedResult.title : (data.title || 'Unknown Song');
              showValidation('valid', 'Ready to add!');
              resolve(true);
            },
            onError: (e) => {
              // Error codes: 2=invalid ID, 5=not found, 100=private/removed, 101/150=embedding disabled
              const code = e.data;
              if (code === 101 || code === 150) {
                showValidation('invalid', 'Video has embedding disabled');
              } else {
                showValidation('invalid', 'Video not found or unavailable');
              }
              resolve(false);
            }
          }
        });

        // Timeout fallback
        setTimeout(() => {
          if (validationStatus.classList.contains('checking')) {
            showValidation('invalid', 'Could not load video');
            resolve(false);
          }
        }, 10000);
      });
    }

    function showValidation(type, message) {
      validationStatus.style.display = 'flex';
      validationStatus.className = 'validation-status ' + type;

      if (type === 'checking') {
        validationStatus.innerHTML = '<div class="validation-spinner"></div>' + message;
      } else {
        validationStatus.textContent = message;
      }

      updateJoinButton();
    }

    function updateJoinButton() {
      const hasName = nameInput.value.trim().length > 0;
      // Valid if: either using search selection OR using URL input that matches validated URL
      const hasValidUrl = validatedUrl && (selectedResult || urlInput.value === validatedUrl);
      const notInQueue = !state.queue.some(e => e.name.toLowerCase() === nameInput.value.trim().toLowerCase());
      const notPlaying = !state.nowPlaying || state.nowPlaying.name.toLowerCase() !== nameInput.value.trim().toLowerCase();

      joinBtn.disabled = !(hasName && hasValidUrl && notInQueue && notPlaying);
    }

    // Fetch state (fallback when WebSocket unavailable)
    async function fetchState() {
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
      // Now playing
      if (state.nowPlaying) {
        nowPlayingCard.style.display = 'block';
        nowPlayingTitle.textContent = state.nowPlaying.youtubeTitle;
        nowPlayingSinger.textContent = state.nowPlaying.name;

        // Show skip button if it's my song
        const isMyTurn = state.nowPlaying.name.toLowerCase() === myName.toLowerCase();
        skipOwnBtn.style.display = isMyTurn ? 'inline-block' : 'none';
      } else {
        nowPlayingCard.style.display = 'none';
        skipOwnBtn.style.display = 'none';
      }

      // Check if user is in queue or playing
      const inQueue = state.queue.some(e => e.name.toLowerCase() === myName.toLowerCase());
      const isPlaying = state.nowPlaying && state.nowPlaying.name.toLowerCase() === myName.toLowerCase();

      if (inQueue || isPlaying) {
        joinCard.classList.add('disabled');
      } else {
        joinCard.classList.remove('disabled');
      }

      queueCount.textContent = state.queue.length + ' in queue';

      if (state.queue.length === 0) {
        queueContent.innerHTML = \`
          <div class="empty-state">
            <div class="empty-icon">*</div>
            <p>Queue is empty.<br>Be the first to add a song!</p>
          </div>
        \`;
      } else {
        queueContent.innerHTML = \`
          <ul class="queue-list">
            \${state.queue.map((entry, i) => {
              const isMe = entry.name.toLowerCase() === myName.toLowerCase();
              const myVote = myVotes[entry.id] || 0;
              const voteClass = entry.votes > 0 ? 'positive' : (entry.votes < 0 ? 'negative' : '');

              return \`
              <li class="queue-item \${isMe ? 'is-mine' : ''}">
                <span class="position">\${i + 1}</span>
                <div class="queue-info">
                  <div class="queue-song">\${escapeHtml(entry.youtubeTitle)}</div>
                  <div class="queue-singer">\${escapeHtml(entry.name)}</div>
                </div>
                <div class="queue-actions">
                  <button class="vote-btn upvote \${myVote === 1 ? 'active' : ''}"
                          onclick="vote('\${entry.id}', \${myVote === 1 ? 0 : 1})"
                          \${isMe ? 'disabled' : ''}>+</button>
                  <span class="vote-count \${voteClass}">\${entry.votes}</span>
                  <button class="vote-btn downvote \${myVote === -1 ? 'active' : ''}"
                          onclick="vote('\${entry.id}', \${myVote === -1 ? 0 : -1})"
                          \${isMe ? 'disabled' : ''}>-</button>
                  \${isMe ? \`<button class="remove-btn" onclick="removeEntry('\${entry.id}')">x</button>\` : ''}
                </div>
              </li>
            \`}).join('')}
          </ul>
        \`;
      }

      updateJoinButton();
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Join queue
    async function joinQueue() {
      const name = nameInput.value.trim();
      if (!name || !validatedUrl || !validatedTitle) return;

      joinBtn.disabled = true;
      hideError();

      // Check if we have a verified session for this name
      const isVerified = verifiedNames[name.toLowerCase()] === true;

      try {
        const res = await fetch(API + '/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            youtubeUrl: validatedUrl,
            youtubeTitle: validatedTitle,
            verified: isVerified
          })
        });

        const data = await res.json();

        // Name is claimed - need PIN verification
        if (data.requiresPin) {
          pendingJoinRequest = { name, youtubeUrl: validatedUrl, youtubeTitle: validatedTitle };
          showVerifyModal(name);
          return;
        }

        if (!res.ok) {
          showError(data.error || 'Failed to join queue');
          return;
        }

        myName = name;
        localStorage.setItem('karaoke_name', name);
        showToast(\`You're #\${data.position} in the queue!\`);

        // Reset form
        resetJoinForm();

        lastStateHash = '';
        fetchState();
      } catch (err) {
        showError('Network error. Please try again.');
      } finally {
        joinBtn.disabled = false;
      }
    }

    function resetJoinForm() {
      urlInput.value = '';
      searchInput.value = '';
      searchResults.innerHTML = '';
      selectedSong.style.display = 'none';
      validatedUrl = null;
      validatedTitle = null;
      selectedResult = null;
      validationStatus.style.display = 'none';
      updateJoinButton();
    }

    // PIN Modal Functions
    function showClaimModal(name) {
      document.getElementById('claimNameDisplay').textContent = '"' + name + '"';
      document.getElementById('claimPinInput').value = '';
      document.getElementById('claimError').classList.remove('show');
      document.getElementById('pinClaimModal').classList.add('show');
      document.getElementById('claimPinInput').focus();
    }

    function dismissClaimModal() {
      document.getElementById('pinClaimModal').classList.remove('show');
    }

    function showVerifyModal(name) {
      document.getElementById('verifyNameDisplay').textContent = '"' + name + '"';
      document.getElementById('verifyPinInput').value = '';
      document.getElementById('verifyError').classList.remove('show');
      document.getElementById('pinVerifyModal').classList.add('show');
      document.getElementById('verifyPinInput').focus();
    }

    function dismissVerifyModal() {
      document.getElementById('pinVerifyModal').classList.remove('show');
      pendingJoinRequest = null;
    }

    async function claimName() {
      const pin = document.getElementById('claimPinInput').value;
      if (!/^\\d{6}$/.test(pin)) {
        document.getElementById('claimError').textContent = 'PIN must be 6 digits';
        document.getElementById('claimError').classList.add('show');
        return;
      }

      const name = myName;
      document.getElementById('claimPinBtn').disabled = true;

      try {
        const res = await fetch(API + '/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, pin })
        });

        const data = await res.json();

        if (!res.ok) {
          document.getElementById('claimError').textContent = data.error || 'Failed to claim name';
          document.getElementById('claimError').classList.add('show');
          return;
        }

        // Success - save verified status
        verifiedNames[name.toLowerCase()] = true;
        localStorage.setItem('karaoke_verified', JSON.stringify(verifiedNames));
        dismissClaimModal();
        showToast('Your name is locked in!');
      } catch (err) {
        document.getElementById('claimError').textContent = 'Network error';
        document.getElementById('claimError').classList.add('show');
      } finally {
        document.getElementById('claimPinBtn').disabled = false;
      }
    }

    async function verifyPin() {
      const pin = document.getElementById('verifyPinInput').value;
      const name = pendingJoinRequest?.name;
      if (!name) return;

      if (!/^\\d{6}$/.test(pin)) {
        document.getElementById('verifyError').textContent = 'PIN must be 6 digits';
        document.getElementById('verifyError').classList.add('show');
        return;
      }

      document.getElementById('verifyPinBtn').disabled = true;

      try {
        const res = await fetch(API + '/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, pin })
        });

        const data = await res.json();

        if (!res.ok) {
          document.getElementById('verifyError').textContent = data.error || 'Invalid PIN';
          document.getElementById('verifyError').classList.add('show');
          return;
        }

        // Success - save verified status and retry join
        verifiedNames[name.toLowerCase()] = true;
        localStorage.setItem('karaoke_verified', JSON.stringify(verifiedNames));
        dismissVerifyModal();

        // Retry the join with verified flag
        if (pendingJoinRequest) {
          validatedUrl = pendingJoinRequest.youtubeUrl;
          validatedTitle = pendingJoinRequest.youtubeTitle;
          nameInput.value = pendingJoinRequest.name;
          pendingJoinRequest = null;
          joinQueue();
        }
      } catch (err) {
        document.getElementById('verifyError').textContent = 'Network error';
        document.getElementById('verifyError').classList.add('show');
      } finally {
        document.getElementById('verifyPinBtn').disabled = false;
      }
    }

    function changeName() {
      dismissVerifyModal();
      nameInput.value = '';
      nameInput.focus();
    }

    // Expose modal functions globally
    window.claimName = claimName;
    window.verifyPin = verifyPin;
    window.dismissClaimModal = dismissClaimModal;
    window.changeName = changeName;

    // Vote
    async function vote(entryId, direction) {
      try {
        const res = await fetch(API + '/vote', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Voter-Id': voterId
          },
          body: JSON.stringify({ entryId, direction })
        });

        if (res.ok) {
          if (direction === 0) {
            delete myVotes[entryId];
          } else {
            myVotes[entryId] = direction;
          }
          localStorage.setItem('karaoke_votes', JSON.stringify(myVotes));
          lastStateHash = '';
          fetchState();
        }
      } catch (err) {
        console.error('Vote failed:', err);
      }
    }

    // Remove entry
    async function removeEntry(entryId) {
      if (!confirm('Remove your song from the queue?')) return;

      try {
        const res = await fetch(API + '/remove', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Name': myName
          },
          body: JSON.stringify({ entryId })
        });

        if (res.ok) {
          lastStateHash = '';
          fetchState();
        }
      } catch (err) {
        console.error('Remove failed:', err);
      }
    }

    // Skip own song
    async function skipOwnSong() {
      if (!confirm('Skip your song?')) return;

      try {
        const res = await fetch(API + '/skip', {
          method: 'POST',
          headers: {
            'X-User-Name': myName
          }
        });

        if (res.ok) {
          showToast('Song skipped');
          lastStateHash = '';
          fetchState();
        }
      } catch (err) {
        console.error('Skip failed:', err);
      }
    }

    function showError(msg) {
      errorMsg.textContent = msg;
      errorMsg.style.display = 'block';
    }

    function hideError() {
      errorMsg.style.display = 'none';
    }

    function showToast(msg) {
      toast.textContent = msg;
      toast.classList.add('show', 'success');
      setTimeout(() => toast.classList.remove('show', 'success'), 3000);
    }

    // Search function
    async function performSearch() {
      const query = searchInput.value.trim();
      if (!query || isSearching) return;

      isSearching = true;
      searchBtn.disabled = true;
      selectedResult = null;
      validatedUrl = null;
      validatedTitle = null;
      selectedSong.style.display = 'none';
      validationStatus.style.display = 'none';
      updateJoinButton();

      searchResults.innerHTML = '<div class="searching-indicator"><div class="spinner"></div>Searching...</div>';

      try {
        const res = await fetch(API + '/search?q=' + encodeURIComponent(query));
        const data = await res.json();

        if (!res.ok) {
          searchResults.innerHTML = '<div class="no-results">Search failed. Try again.</div>';
          return;
        }

        if (!data.results || data.results.length === 0) {
          searchResults.innerHTML = '<div class="no-results">No results found. Try a different search.</div>';
          return;
        }

        searchResults.innerHTML = data.results.map(video => {
          const tooLong = video.durationSeconds > MAX_DURATION;
          return \`
            <div class="search-result \${tooLong ? 'too-long' : ''}"
                 data-id="\${video.id}"
                 data-title="\${escapeHtml(video.title)}"
                 data-channel="\${escapeHtml(video.channel)}"
                 data-duration="\${video.duration}"
                 data-too-long="\${tooLong}"
                 onclick="selectSearchResult(this)">
              <img class="result-thumb" src="\${video.thumbnail}" alt="" loading="lazy">
              <div class="result-info">
                <div class="result-title">\${escapeHtml(video.title)}</div>
                <div class="result-meta">
                  <span>\${escapeHtml(video.channel)}</span>
                  <span class="result-duration \${tooLong ? 'too-long-text' : ''}">\${video.duration}\${tooLong ? ' (too long)' : ''}</span>
                </div>
              </div>
            </div>
          \`;
        }).join('');
      } catch (err) {
        searchResults.innerHTML = '<div class="no-results">Search failed. Check your connection.</div>';
      } finally {
        isSearching = false;
        searchBtn.disabled = false;
      }
    }

    // Select search result
    function selectSearchResult(element) {
      if (element.dataset.tooLong === 'true') return;

      // Remove previous selection
      document.querySelectorAll('.search-result.selected').forEach(el => el.classList.remove('selected'));

      element.classList.add('selected');
      selectedResult = {
        id: element.dataset.id,
        title: element.dataset.title,
        channel: element.dataset.channel,
        duration: element.dataset.duration
      };

      // Show selected song
      selectedTitle.textContent = selectedResult.title;
      selectedMeta.textContent = selectedResult.channel + ' · ' + selectedResult.duration;
      selectedSong.style.display = 'block';

      // Validate the selected video
      const url = 'https://www.youtube.com/watch?v=' + selectedResult.id;
      validateUrl(url);
    }
    window.selectSearchResult = selectSearchResult;

    // Toggle URL fallback
    function toggleUrlFallback() {
      urlFallback.classList.toggle('hidden');
      if (!urlFallback.classList.contains('hidden')) {
        urlToggle.textContent = 'Use search instead';
        urlInput.focus();
      } else {
        urlToggle.textContent = 'Have a link instead?';
        urlInput.value = '';
        validatedUrl = null;
        validatedTitle = null;
        validationStatus.style.display = 'none';
        updateJoinButton();
      }
    }

    // Event listeners
    joinBtn.addEventListener('click', joinQueue);
    nameInput.addEventListener('input', () => {
      myName = nameInput.value.trim();
      updateJoinButton();
    });

    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') performSearch();
    });

    urlToggle.addEventListener('click', toggleUrlFallback);

    let urlDebounce;
    urlInput.addEventListener('input', () => {
      clearTimeout(urlDebounce);
      validatedUrl = null;
      validatedTitle = null;
      selectedResult = null;
      selectedSong.style.display = 'none';

      // Clear search selection when using URL
      document.querySelectorAll('.search-result.selected').forEach(el => el.classList.remove('selected'));

      const url = urlInput.value.trim();
      if (!url) {
        validationStatus.style.display = 'none';
        updateJoinButton();
        return;
      }

      urlDebounce = setTimeout(() => validateUrl(url), 500);
    });

    // Initialize: try WebSocket first, fall back to polling
    connectWebSocket();

    setTimeout(() => {
      if (!wsConnected && !pollInterval) {
        fetchState();
        pollInterval = setInterval(fetchState, 3000);
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
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
        stopHeartbeat();
        if (ws) ws.close();
        if (wsReconnectTimeout) {
          clearTimeout(wsReconnectTimeout);
          wsReconnectTimeout = null;
        }
      } else {
        wsReconnectAttempts = 0;
        if (!wsConnected && !ws) {
          connectWebSocket();
        }
        if (!wsConnected) {
          fetchState();
          if (!pollInterval) {
            pollInterval = setInterval(fetchState, 3000);
          }
        }
        startHeartbeat();
      }
    });

    // Start heartbeat
    startHeartbeat();
  </script>
</body>
</html>`
