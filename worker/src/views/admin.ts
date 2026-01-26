export const ADMIN_HTML = `
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Karaoke Admin</title>
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
      max-width: 600px;
      margin: 0 auto;
      padding: 24px 16px;
      position: relative;
      z-index: 1;
    }
    header { text-align: center; margin-bottom: 32px; }
    h1 {
      font-size: 2rem;
      font-weight: 800;
      background: linear-gradient(135deg, var(--warning) 0%, var(--accent) 100%);
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
    }
    .now-playing-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .now-playing-label {
      font-size: 0.75rem;
      color: var(--accent);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .now-playing-info { margin-bottom: 16px; }
    .now-playing-title {
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .now-playing-singer { color: var(--text-muted); font-size: 0.9rem; }
    .now-playing-controls { display: flex; gap: 12px; }
    .btn {
      background: linear-gradient(135deg, var(--accent) 0%, #ff8fab 100%);
      color: white;
      border: none;
      border-radius: 12px;
      padding: 12px 20px;
      font-size: 0.95rem;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px var(--accent-glow);
    }
    .btn:active { transform: translateY(0); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .btn-skip {
      background: linear-gradient(135deg, var(--warning) 0%, #ffb347 100%);
    }
    .btn-cyan {
      background: linear-gradient(135deg, var(--cyan) 0%, #45b7aa 100%);
    }
    .btn-cyan:hover { box-shadow: 0 6px 20px var(--cyan-glow); }
    .now-playing-empty {
      text-align: center;
      color: var(--text-muted);
      font-style: italic;
      padding: 20px;
    }

    /* Add Entry */
    .add-card {
      background: var(--bg-card);
      border-radius: 20px;
      padding: 20px;
      margin-bottom: 24px;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .add-header {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 16px;
    }
    .add-form { display: flex; flex-direction: column; gap: 12px; }
    .add-row { display: flex; gap: 12px; }
    input[type="text"] {
      flex: 1;
      background: rgba(255, 255, 255, 0.05);
      border: 2px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 12px 16px;
      font-size: 0.95rem;
      font-family: inherit;
      color: var(--text);
      outline: none;
      transition: all 0.2s ease;
    }
    input[type="text"]:focus {
      border-color: var(--cyan);
      box-shadow: 0 0 0 3px var(--cyan-glow);
    }
    input[type="text"]::placeholder { color: var(--text-muted); }

    /* Queue Section */
    .queue-section {
      background: var(--bg-card);
      border-radius: 20px;
      padding: 20px;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .section-title { font-size: 1rem; font-weight: 600; }
    .queue-count {
      background: rgba(255, 255, 255, 0.1);
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 0.8rem;
      color: var(--text-muted);
    }
    .queue-list { list-style: none; }
    .queue-item {
      display: flex;
      align-items: center;
      padding: 12px;
      border-radius: 12px;
      margin-bottom: 8px;
      background: rgba(255, 255, 255, 0.03);
      transition: all 0.2s ease;
    }
    .queue-item:hover { background: rgba(255, 255, 255, 0.06); }
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
      background: rgba(255, 255, 255, 0.1);
      color: var(--text-muted);
    }
    .queue-info { flex: 1; min-width: 0; }
    .queue-song {
      font-weight: 500;
      font-size: 0.9rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 2px;
    }
    .queue-meta {
      font-size: 0.8rem;
      color: var(--text-muted);
      display: flex;
      gap: 12px;
    }
    .queue-actions { display: flex; gap: 4px; margin-left: 8px; }
    .action-btn {
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
      color: var(--text-muted);
      font-size: 1rem;
    }
    .action-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      color: var(--text);
    }
    .action-btn.danger:hover {
      background: rgba(255, 107, 157, 0.2);
      color: var(--accent);
    }
    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: var(--text-muted);
    }

    /* Toast */
    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: var(--bg-card);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 14px 24px;
      border-radius: 12px;
      font-size: 0.9rem;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      transition: transform 0.3s ease;
      z-index: 100;
    }
    .toast.show { transform: translateX(-50%) translateY(0); }
    .toast.success { border-color: rgba(123, 237, 159, 0.3); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Admin Control</h1>
      <p class="subtitle">Manage the karaoke queue</p>
    </header>

    <div class="now-playing-card" id="nowPlayingCard">
      <div id="nowPlayingContent">
        <div class="now-playing-empty">Nothing playing</div>
      </div>
    </div>

    <div class="add-card">
      <div class="add-header">Add Entry (Plays Next)</div>
      <div class="add-form">
        <div class="add-row">
          <input type="text" id="addName" placeholder="Singer name" maxlength="30">
          <input type="text" id="addUrl" placeholder="YouTube URL">
        </div>
        <input type="text" id="addTitle" placeholder="Song title (optional)" maxlength="100" style="margin-top: 8px;">
        <button class="btn btn-cyan" id="addBtn" style="margin-top: 12px;">Add to Front</button>
      </div>
    </div>

    <div class="queue-section">
      <div class="section-header">
        <span class="section-title">Queue</span>
        <span class="queue-count" id="queueCount">0 entries</span>
      </div>
      <div id="queueContent">
        <div class="empty-state">Queue is empty</div>
      </div>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    const API = '/api';

    let state = { queue: [], nowPlaying: null, currentEpoch: 0 };
    let lastStateHash = '';
    let pollInterval;

    // Elements
    const nowPlayingCard = document.getElementById('nowPlayingCard');
    const nowPlayingContent = document.getElementById('nowPlayingContent');
    const addName = document.getElementById('addName');
    const addUrl = document.getElementById('addUrl');
    const addTitle = document.getElementById('addTitle');
    const addBtn = document.getElementById('addBtn');
    const queueContent = document.getElementById('queueContent');
    const queueCount = document.getElementById('queueCount');
    const toast = document.getElementById('toast');

    // Fetch state
    async function fetchState() {
      try {
        const res = await fetch(API + '/state');
        const data = await res.json();
        const hash = JSON.stringify(data);
        if (hash === lastStateHash) return;
        lastStateHash = hash;
        state = data;
        render();
      } catch (err) {
        console.error('Failed to fetch state:', err);
      }
    }

    function render() {
      // Now playing
      if (state.nowPlaying) {
        nowPlayingContent.innerHTML = \`
          <div class="now-playing-header">
            <span class="now-playing-label">Now Playing</span>
            <span style="color: var(--text-muted); font-size: 0.8rem;">Epoch: \${state.currentEpoch}</span>
          </div>
          <div class="now-playing-info">
            <div class="now-playing-title">\${escapeHtml(state.nowPlaying.youtubeTitle)}</div>
            <div class="now-playing-singer">\${escapeHtml(state.nowPlaying.name)}</div>
          </div>
          <div class="now-playing-controls">
            <button class="btn btn-skip" onclick="skipCurrent()">Skip Song</button>
          </div>
        \`;
      } else {
        nowPlayingContent.innerHTML = '<div class="now-playing-empty">Nothing playing</div>';
      }

      // Queue
      queueCount.textContent = state.queue.length + ' entries';

      if (state.queue.length === 0) {
        queueContent.innerHTML = '<div class="empty-state">Queue is empty</div>';
      } else {
        queueContent.innerHTML = \`
          <ul class="queue-list">
            \${state.queue.map((entry, i) => \`
              <li class="queue-item">
                <span class="position">\${i + 1}</span>
                <div class="queue-info">
                  <div class="queue-song">\${escapeHtml(entry.youtubeTitle)}</div>
                  <div class="queue-meta">
                    <span>\${escapeHtml(entry.name)}</span>
                    <span>Epoch: \${entry.epoch}</span>
                    <span>Votes: \${entry.votes}</span>
                  </div>
                </div>
                <div class="queue-actions">
                  \${i > 0 ? \`<button class="action-btn" onclick="moveUp('\${entry.id}')" title="Move up">^</button>\` : ''}
                  \${i < state.queue.length - 1 ? \`<button class="action-btn" onclick="moveDown('\${entry.id}')" title="Move down">v</button>\` : ''}
                  <button class="action-btn danger" onclick="removeEntry('\${entry.id}')" title="Remove">x</button>
                </div>
              </li>
            \`).join('')}
          </ul>
        \`;
      }
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Skip current song
    async function skipCurrent() {
      try {
        await fetch(API + '/skip', {
          method: 'POST',
          headers: { 'X-Admin': 'true' }
        });
        lastStateHash = '';
        fetchState();
        showToast('Skipped!');
      } catch (err) {
        console.error('Skip failed:', err);
      }
    }

    // Add entry
    async function addEntry() {
      const name = addName.value.trim();
      const url = addUrl.value.trim();
      const title = addTitle.value.trim() || 'Added by admin';

      if (!name || !url) {
        showToast('Name and URL required');
        return;
      }

      addBtn.disabled = true;

      try {
        const res = await fetch(API + '/add', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin': 'true'
          },
          body: JSON.stringify({ name, youtubeUrl: url, youtubeTitle: title })
        });

        const data = await res.json();

        if (!res.ok) {
          showToast(data.error || 'Failed to add');
          return;
        }

        addName.value = '';
        addUrl.value = '';
        addTitle.value = '';
        lastStateHash = '';
        fetchState();
        showToast('Added to front of queue!');
      } catch (err) {
        showToast('Network error');
      } finally {
        addBtn.disabled = false;
      }
    }

    // Move up
    async function moveUp(entryId) {
      const index = state.queue.findIndex(e => e.id === entryId);
      if (index <= 0) return;

      try {
        await fetch(API + '/reorder', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin': 'true'
          },
          body: JSON.stringify({ entryId, newPosition: index - 1 })
        });
        lastStateHash = '';
        fetchState();
      } catch (err) {
        console.error('Move failed:', err);
      }
    }

    // Move down
    async function moveDown(entryId) {
      const index = state.queue.findIndex(e => e.id === entryId);
      if (index === -1 || index >= state.queue.length - 1) return;

      try {
        await fetch(API + '/reorder', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin': 'true'
          },
          body: JSON.stringify({ entryId, newPosition: index + 1 })
        });
        lastStateHash = '';
        fetchState();
      } catch (err) {
        console.error('Move failed:', err);
      }
    }

    // Remove entry
    async function removeEntry(entryId) {
      if (!confirm('Remove this entry?')) return;

      try {
        await fetch(API + '/remove', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin': 'true'
          },
          body: JSON.stringify({ entryId })
        });
        lastStateHash = '';
        fetchState();
      } catch (err) {
        console.error('Remove failed:', err);
      }
    }

    function showToast(msg) {
      toast.textContent = msg;
      toast.classList.add('show', 'success');
      setTimeout(() => toast.classList.remove('show', 'success'), 3000);
    }

    // Event listeners
    addBtn.addEventListener('click', addEntry);

    // Initial fetch and polling
    fetchState();
    pollInterval = setInterval(fetchState, 2000);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        clearInterval(pollInterval);
      } else {
        fetchState();
        pollInterval = setInterval(fetchState, 2000);
      }
    });
  </script>
</body>
</html>`
