<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { QueueState, Entry, PlaybackState } from '@karaoke/types';
  import { createWebSocket, getState, getRoomId } from '$lib';

  const PAUSE_DURATION = 7000;
  const SYNC_DRIFT_THRESHOLD_MS = 200; // Re-sync if drift exceeds 200ms
  const SYNC_CHECK_INTERVAL_MS = 10000; // Check sync every 10 seconds

  let room = $state<QueueState>({ queue: [], nowPlaying: null, currentEpoch: 0 });
  let wsConnected = $state(false);
  let roomId = $state('');

  let player: YT.Player | null = null;
  let playerReady = $state(false);
  let currentVideoId: string | null = null;
  let isAdvancing = false;

  // Player modes
  type PlayerMode = 'playing_song' | 'pause_screen' | 'idle_screen' | 'needs_interaction';
  let playerMode = $state<PlayerMode>('idle_screen');
  let pauseTimeout: ReturnType<typeof setTimeout> | null = null;
  let countdown = $state(0);
  let countdownInterval: ReturnType<typeof setInterval> | null = null;

  // Track if we need user interaction to start
  let pendingSong: Entry | null = null;

  // Polling fallback
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  // WebSocket
  let ws = createWebSocket();
  let previousNowPlaying: Entry | null = null;

  // Sync state
  let syncCheckInterval: ReturnType<typeof setInterval> | null = null;
  let lastSyncPlayback: PlaybackState | null = null;

  // Derived
  const upNext = $derived(room.queue.slice(0, 5));
  const qrUrl = $derived(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`https://karaoke-queue.boris-47d.workers.dev/${roomId}`)}&bgcolor=0a0a0f&color=ffffff`);

  onMount(() => {
    roomId = getRoomId();

    ws.onState((newState, playback) => {
      wsConnected = true;
      handleStateUpdate(newState);

      // Handle initial playback state from state message
      if (playback) {
        handleSync(playback, ws.getServerTimeOffset());
      }

      // Stop polling when WS connected
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    });

    // Handle sync messages for multi-device synchronization
    ws.onSync((playback, serverTimeOffset) => {
      handleSync(playback, serverTimeOffset);
    });

    ws.connect('player');

    // Fallback polling
    setTimeout(() => {
      if (!wsConnected) {
        startPolling();
      }
    }, 2000);

    // Load YouTube API
    if (typeof window !== 'undefined') {
      window.onYouTubeIframeAPIReady = initPlayer;
      if (!window.YT) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      } else if (window.YT.Player) {
        initPlayer();
      }
    }

    // Start periodic sync check
    startSyncCheck();

    // Request sync when tab becomes visible (user returns to page)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
  });

  onDestroy(() => {
    ws.disconnect();
    if (pollInterval) clearInterval(pollInterval);
    if (pauseTimeout) clearTimeout(pauseTimeout);
    if (countdownInterval) clearInterval(countdownInterval);
    if (syncCheckInterval) clearInterval(syncCheckInterval);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  });

  function startPolling() {
    pollInterval = setInterval(async () => {
      if (!wsConnected) {
        const state = await getState();
        if (state) handleStateUpdate(state);
      }
    }, 2000);
  }

  function startSyncCheck() {
    if (syncCheckInterval) clearInterval(syncCheckInterval);
    syncCheckInterval = setInterval(() => {
      if (wsConnected && playerMode === 'playing_song' && lastSyncPlayback?.playing) {
        // Request fresh sync state from server
        ws.requestSync();
      }
    }, SYNC_CHECK_INTERVAL_MS);
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible' && wsConnected) {
      // Tab became visible - request sync to catch up
      ws.requestSync();
    }
  }

  function handleSync(playback: PlaybackState, serverTimeOffset: number) {
    lastSyncPlayback = playback;

    if (!playback.playing || !playback.videoId || !player || !playerReady) {
      return;
    }

    // Only sync if we're supposed to be playing the same video
    if (currentVideoId !== playback.videoId) {
      return;
    }

    // Calculate where playback should be right now
    const now = Date.now();
    // Adjust for clock offset: server's "now" = our now + offset
    const adjustedNow = now + serverTimeOffset;
    const elapsedSinceStart = (adjustedNow - playback.startedAt) / 1000;
    const targetPosition = playback.position + elapsedSinceStart;

    // Get current player position
    const currentPosition = player.getCurrentTime();
    const drift = currentPosition - targetPosition;
    const driftMs = Math.abs(drift * 1000);

    // Only correct if drift exceeds threshold
    if (driftMs > SYNC_DRIFT_THRESHOLD_MS) {
      console.log(`[Sync] Drift detected: ${drift.toFixed(2)}s (${driftMs.toFixed(0)}ms), seeking to ${targetPosition.toFixed(2)}s`);
      player.seekTo(targetPosition, true);

      // Ensure video is playing
      const playerState = player.getPlayerState();
      if (playerState !== YT.PlayerState.PLAYING && playerState !== YT.PlayerState.BUFFERING) {
        player.playVideo();
      }
    }
  }

  function handleStateUpdate(newState: QueueState) {
    const prevPlaying = previousNowPlaying;
    previousNowPlaying = newState.nowPlaying;
    room = newState;

    // Auto-start if queue has songs but nothing playing
    if (!room.nowPlaying && room.queue.length > 0 && !isAdvancing) {
      advanceToNext();
      return;
    }

    // Load new song if changed
    if (room.nowPlaying) {
      const prevId = prevPlaying?.id ?? null;
      if (room.nowPlaying.id !== prevId) {
        loadSong(room.nowPlaying);
      }
    } else if (!room.nowPlaying && room.queue.length === 0) {
      // Queue empty -> idle screen
      if (playerMode !== 'idle_screen') {
        clearTimers();
        playerMode = 'idle_screen';
        player?.pauseVideo();
      }
    }
  }

  function initPlayer() {
    if (!window.YT) return;

    // Create player - it will be hidden until a song plays
    player = new window.YT.Player('yt-player', {
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 0,
        controls: 1,
        modestbranding: 1,
        rel: 0,
        fs: 1,
        playsinline: 1,
      },
      events: {
        onReady: () => {
          playerReady = true;
          if (room.nowPlaying) {
            loadSong(room.nowPlaying);
          } else if (room.queue.length > 0) {
            // Queue has items but nothing playing - advance
            advanceToNext();
          } else {
            playerMode = 'idle_screen';
          }
        },
        onStateChange: (event: YT.OnStateChangeEvent) => {
          // Playing - clear pending and ensure correct mode
          if (event.data === YT.PlayerState.PLAYING) {
            pendingSong = null;
            if (playerMode === 'needs_interaction') {
              playerMode = 'playing_song';
            }
          }
          // Ended - show pause screen
          if (event.data === YT.PlayerState.ENDED) {
            if (playerMode === 'playing_song') {
              showPauseScreen();
            }
          }
        },
        onError: (event: YT.OnErrorEvent) => {
          console.error('YouTube player error:', event.data);
          if (playerMode === 'playing_song') {
            showPauseScreen();
          }
        },
      },
    });
  }

  function loadSong(entry: Entry) {
    if (!entry || !playerReady || !entry.videoId) return;
    clearTimers();
    currentVideoId = entry.videoId;
    pendingSong = entry;

    // Try to play - if blocked, we'll show interaction screen
    playerMode = 'playing_song';
    player?.loadVideoById(entry.videoId);

    // Check if playback actually started after a short delay
    setTimeout(() => {
      if (player && pendingSong) {
        const state = player.getPlayerState();
        // -1 = unstarted, 3 = buffering is ok, 1 = playing is ok
        // If still unstarted after load, likely blocked
        if (state === -1 || state === 5) { // UNSTARTED or CUED
          playerMode = 'needs_interaction';
        }
      }
    }, 1000);
  }

  function handleStartClick() {
    if (pendingSong && player) {
      player.playVideo();
      playerMode = 'playing_song';
      pendingSong = null;
    } else if (room.nowPlaying) {
      loadSong(room.nowPlaying);
    }
  }

  function showPauseScreen() {
    clearTimers();
    playerMode = 'pause_screen';
    player?.pauseVideo();

    // Start countdown
    countdown = Math.ceil(PAUSE_DURATION / 1000);
    countdownInterval = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearTimers();
        advanceToNext();
      }
    }, 1000);

    // Backup timeout in case interval fails
    pauseTimeout = setTimeout(() => {
      advanceToNext();
    }, PAUSE_DURATION + 500);
  }

  function clearTimers() {
    if (pauseTimeout) {
      clearTimeout(pauseTimeout);
      pauseTimeout = null;
    }
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }

  async function advanceToNext() {
    if (isAdvancing) return;
    isAdvancing = true;
    clearTimers();

    try {
      const currentId = room.nowPlaying?.id ?? null;
      const roomParam = roomId ? `?room=${encodeURIComponent(roomId)}` : '';
      await fetch(`/api/next${roomParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentId }),
      });
      // State will update via WebSocket
    } catch (err) {
      console.error('Failed to advance:', err);
      playerMode = 'idle_screen';
    } finally {
      isAdvancing = false;
    }
  }

  function getConnectionStatus(): { class: string; text: string } {
    if (wsConnected) return { class: 'connected', text: 'Live' };
    if (pollInterval) return { class: 'polling', text: 'Polling' };
    return { class: 'disconnected', text: 'Connecting...' };
  }

  const connectionStatus = $derived(getConnectionStatus());
</script>

<div class="player-container">
  <div class="connection-status {connectionStatus.class}">
    {connectionStatus.text}
  </div>

  <!-- YouTube Player (hidden during pause/idle) -->
  <div class="video-wrapper" class:hidden={playerMode !== 'playing_song'}>
    <div id="yt-player"></div>
  </div>

  <!-- Pause Screen: Between songs -->
  {#if playerMode === 'pause_screen'}
    <div class="overlay pause-overlay">
      <div class="pause-content">
        {#if room.queue.length > 0}
          <div class="up-next-label">UP NEXT</div>
          <div class="next-singer">{room.queue[0]?.name}</div>
          <div class="next-song">{room.queue[0]?.title}</div>
          <div class="countdown">{countdown}</div>
        {:else}
          <div class="waiting-message">Queue empty</div>
        {/if}
      </div>

      {#if room.queue.length > 1}
        <div class="queue-preview">
          <div class="queue-label">Coming up</div>
          {#each room.queue.slice(1, 4) as entry, i (entry.id)}
            <div class="queue-item">
              <span class="queue-position">{i + 2}</span>
              <span class="queue-name">{entry.name}</span>
              <span class="queue-song">{entry.title}</span>
            </div>
          {/each}
        </div>
      {/if}

      <div class="qr-section">
        <img src={qrUrl} alt="Join queue" class="qr-code" />
        <div class="qr-hint">Scan to add songs</div>
      </div>
    </div>
  {/if}

  <!-- Needs Interaction: Browser blocked autoplay -->
  {#if playerMode === 'needs_interaction'}
    <button class="overlay start-overlay" onclick={handleStartClick}>
      <div class="start-content">
        <div class="start-icon">▶</div>
        <div class="start-title">Click to Start</div>
        {#if room.nowPlaying}
          <div class="start-song">{room.nowPlaying.title}</div>
          <div class="start-singer">{room.nowPlaying.name}</div>
        {/if}
      </div>
    </button>
  {/if}

  <!-- Idle Screen: No songs in queue -->
  {#if playerMode === 'idle_screen'}
    <div class="overlay idle-overlay">
      <div class="idle-content">
        <div class="idle-title">Karaoke Night</div>
        <div class="idle-subtitle">{roomId || 'default'}</div>
        <img src={qrUrl} alt="Join queue" class="qr-code qr-large" />
        <div class="idle-cta">Scan to add your song</div>
      </div>

      <div class="idle-decoration">
        <div class="note note-1">♪</div>
        <div class="note note-2">♫</div>
        <div class="note note-3">♪</div>
      </div>
    </div>
  {/if}

  <!-- Info Bar: Always visible during playback -->
  {#if playerMode === 'playing_song'}
    <div class="info-bar">
      {#if room.nowPlaying}
        <div class="now-playing">
          <span class="now-label">Now Playing</span>
          <span class="now-title">{room.nowPlaying.title}</span>
          <span class="now-singer">{room.nowPlaying.name}</span>
        </div>
      {/if}

      <div class="up-next-bar">
        <span class="up-next-bar-label">Up Next</span>
        <div class="up-next-list">
          {#if upNext.length === 0}
            <span class="empty-queue">Queue empty</span>
          {:else}
            {#each upNext.slice(0, 3) as entry (entry.id)}
              <div class="up-next-item">
                <div class="up-next-song">{entry.title}</div>
                <div class="up-next-singer">{entry.name}</div>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .player-container {
    position: relative;
    height: 100vh;
    height: 100dvh;
    background: var(--bg-deep);
    overflow: hidden;
  }

  /* Video Player */
  .video-wrapper {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 100px;
    background: #000;
  }

  .video-wrapper.hidden {
    visibility: hidden;
  }

  :global(#yt-player) {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  /* Overlays */
  .overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: var(--bg-deep);
  }

  /* Start Screen (needs interaction) */
  .start-overlay {
    background: radial-gradient(ellipse at center, rgba(78, 205, 196, 0.15) 0%, var(--bg-deep) 70%);
    cursor: pointer;
    border: none;
    width: 100%;
    transition: background 0.3s ease;
  }

  .start-overlay:hover {
    background: radial-gradient(ellipse at center, rgba(78, 205, 196, 0.25) 0%, var(--bg-deep) 70%);
  }

  .start-content {
    text-align: center;
  }

  .start-icon {
    font-size: 6rem;
    color: var(--cyan);
    margin-bottom: 24px;
    text-shadow: 0 0 60px var(--cyan);
    animation: pulse 2s ease-in-out infinite;
  }

  .start-title {
    font-size: 2rem;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 32px;
  }

  .start-song {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 8px;
    max-width: 600px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .start-singer {
    font-size: 1.25rem;
    color: var(--text-muted);
  }

  /* Pause Screen */
  .pause-overlay {
    background: radial-gradient(ellipse at center, rgba(255, 107, 157, 0.1) 0%, var(--bg-deep) 70%);
  }

  .pause-content {
    text-align: center;
    margin-bottom: 40px;
  }

  .up-next-label {
    font-size: 1rem;
    color: var(--accent);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    margin-bottom: 16px;
  }

  .next-singer {
    font-size: 4rem;
    font-weight: 800;
    color: var(--text);
    margin-bottom: 8px;
    text-shadow: 0 0 60px var(--accent-glow);
  }

  .next-song {
    font-size: 1.5rem;
    color: var(--text-muted);
    max-width: 600px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .countdown {
    font-size: 8rem;
    font-weight: 800;
    color: var(--accent);
    margin-top: 32px;
    text-shadow: 0 0 80px var(--accent-glow);
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.05); opacity: 0.8; }
  }

  .waiting-message {
    font-size: 2rem;
    color: var(--text-muted);
  }

  /* Queue Preview */
  .queue-preview {
    position: absolute;
    bottom: 140px;
    left: 40px;
  }

  .queue-label {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 12px;
  }

  .queue-item {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
    opacity: 0.7;
  }

  .queue-position {
    font-size: 0.875rem;
    color: var(--cyan);
    font-weight: 600;
    width: 20px;
  }

  .queue-name {
    font-size: 1rem;
    font-weight: 500;
  }

  .queue-song {
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  /* QR Section */
  .qr-section {
    position: absolute;
    bottom: 140px;
    right: 40px;
    text-align: center;
  }

  .qr-code {
    width: 120px;
    height: 120px;
    border-radius: 12px;
    background: white;
    padding: 8px;
  }

  .qr-large {
    width: 200px;
    height: 200px;
    margin-bottom: 24px;
  }

  .qr-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 8px;
  }

  /* Idle Screen */
  .idle-overlay {
    background:
      radial-gradient(ellipse at 20% 30%, rgba(255, 107, 157, 0.08) 0%, transparent 50%),
      radial-gradient(ellipse at 80% 70%, rgba(78, 205, 196, 0.08) 0%, transparent 50%),
      var(--bg-deep);
  }

  .idle-content {
    text-align: center;
  }

  .idle-title {
    font-size: 4rem;
    font-weight: 800;
    background: linear-gradient(135deg, var(--accent) 0%, var(--cyan) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 8px;
  }

  .idle-subtitle {
    font-size: 1.5rem;
    color: var(--text-muted);
    margin-bottom: 48px;
  }

  .idle-cta {
    font-size: 1.25rem;
    color: var(--text);
  }

  .idle-decoration {
    position: absolute;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: hidden;
  }

  .note {
    position: absolute;
    font-size: 4rem;
    color: var(--accent);
    opacity: 0.15;
    animation: float 6s ease-in-out infinite;
  }

  .note-1 { top: 20%; left: 10%; animation-delay: 0s; }
  .note-2 { top: 60%; right: 15%; animation-delay: 2s; }
  .note-3 { bottom: 30%; left: 20%; animation-delay: 4s; }

  @keyframes float {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    50% { transform: translateY(-20px) rotate(10deg); }
  }

  /* Info Bar */
  .info-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--bg-card);
    padding: 16px 32px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  .now-playing {
    display: flex;
    align-items: center;
    margin-bottom: 12px;
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
    font-size: 1.25rem;
    font-weight: 600;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .now-singer {
    font-size: 1rem;
    color: var(--text-muted);
    margin-left: 16px;
  }

  .up-next-bar {
    display: flex;
    gap: 24px;
  }

  .up-next-bar-label {
    font-size: 0.7rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    padding-top: 6px;
    white-space: nowrap;
  }

  .up-next-list {
    display: flex;
    gap: 12px;
    flex: 1;
    overflow: hidden;
  }

  .up-next-item {
    background: rgba(255, 255, 255, 0.05);
    padding: 8px 14px;
    border-radius: 8px;
    min-width: 180px;
    max-width: 280px;
  }

  .up-next-song {
    font-size: 0.85rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 2px;
  }

  .up-next-singer {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .empty-queue {
    color: var(--text-muted);
    font-style: italic;
    font-size: 0.85rem;
  }

  /* Connection Status */
  .connection-status {
    position: fixed;
    top: 12px;
    right: 12px;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    z-index: 100;
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
</style>
