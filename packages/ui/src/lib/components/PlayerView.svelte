<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { QueueState, Entry, PlaybackState, SearchResult, Reaction, ChatMessage, EnergyState } from '@karaoke/types';
  import {
    createWebSocket,
    getState,
    getRoomId,
    search as searchApi,
    join,
    adminSkip,
    adminRemove,
    adminReorder,
    adminAdd,
    verifyAdminPin,
    getAdminToken,
    setAdminToken,
    clearAdminToken,
  } from '$lib';
  import { extractVideoId } from '@karaoke/domain';
  import { toastStore } from '$lib/stores/toast.svelte';
  import Toast from './Toast.svelte';
  import EnergyMeter from './EnergyMeter.svelte';
  import ReactionOverlay from './ReactionOverlay.svelte';
  import PinnedMessage from './PinnedMessage.svelte';

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

  // Social features
  type FloatingReaction = {
    id: string;
    emoji: Reaction['emoji'];
    displayName: string;
    lane: number;
  };

  let energyState = $state<EnergyState | null>(null);
  let floatingReactions = $state<FloatingReaction[]>([]);
  let pinnedMessage = $state<ChatMessage | null>(null);
  let reactionLane = 0;

  // Controls panel state
  let showControls = $state(true);
  let isAdminMode = $state(false);
  let adminPinInput = $state('');
  let showPinModal = $state(false);
  let isAuthenticating = $state(false);
  let authError = $state('');

  // Search state
  let searchQuery = $state('');
  let searchResults = $state<SearchResult[]>([]);
  let isSearching = $state(false);
  let selectedResult = $state<SearchResult | null>(null);
  let singerName = $state('');

  // Derived
  const upNext = $derived(room.queue.slice(0, 5));
  const qrUrl = $derived(
    typeof window === 'undefined'
      ? ''
      : (() => {
          const baseUrl = window.location.origin;
          const normalizedRoomId = roomId === 'default' ? '' : roomId;
          const roomPath = normalizedRoomId ? `/${normalizedRoomId}` : '';
          const targetUrl = `${baseUrl}${roomPath}`;
          return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(targetUrl)}&bgcolor=0a0a0f&color=ffffff`;
        })()
  );

  onMount(() => {
    roomId = getRoomId();

    // Check for existing admin token
    const token = getAdminToken();
    if (token) {
      isAdminMode = true;
    }

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

    ws.onReaction((reaction) => {
      const lane = reactionLane % 3;
      reactionLane += 1;
      const item: FloatingReaction = {
        id: reaction.id,
        emoji: reaction.emoji,
        displayName: reaction.displayName,
        lane,
      };
      floatingReactions = [...floatingReactions, item];
      setTimeout(() => {
        floatingReactions = floatingReactions.filter((r) => r.id !== reaction.id);
      }, 3000);
    });

    ws.onEnergy((state) => {
      energyState = state;
    });

    ws.onChatPinned((message) => {
      pinnedMessage = message;
    });

    ws.onChatUnpinned((messageId) => {
      if (pinnedMessage?.id === messageId) {
        pinnedMessage = null;
      }
    });

    ws.onEnergySkip(() => {
      toastStore.info('Energy dipped - skipping');
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

  // =============================================================================
  // Controls Panel Functions
  // =============================================================================

  function toggleControls() {
    showControls = !showControls;
  }

  function openPinModal() {
    showPinModal = true;
    adminPinInput = '';
    authError = '';
  }

  function closePinModal() {
    showPinModal = false;
    adminPinInput = '';
    authError = '';
  }

  async function handlePinSubmit() {
    if (adminPinInput.length !== 6) {
      authError = 'PIN must be 6 digits';
      return;
    }

    isAuthenticating = true;
    authError = '';

    const result = await verifyAdminPin(adminPinInput);

    isAuthenticating = false;

    if (result.kind === 'verified') {
      setAdminToken(result.token);
      isAdminMode = true;
      showPinModal = false;
      adminPinInput = '';
      toastStore.success('Admin mode enabled');
    } else if (result.kind === 'invalidPin') {
      authError = 'Incorrect PIN';
      adminPinInput = '';
    } else if (result.kind === 'roomNotFound') {
      authError = 'Room not found';
    } else {
      authError = result.message || 'Authentication failed';
    }
  }

  function handlePinKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !isAuthenticating) {
      handlePinSubmit();
    } else if (e.key === 'Escape') {
      closePinModal();
    }
  }

  function handleAdminLogout() {
    clearAdminToken();
    isAdminMode = false;
    toastStore.success('Admin mode disabled');
  }

  async function handleSearch() {
    if (!searchQuery.trim() || isSearching) return;

    isSearching = true;
    searchResults = [];
    selectedResult = null;

    const response = await searchApi(searchQuery.trim());
    isSearching = false;

    if (response.kind === 'error') {
      toastStore.error(response.message);
      return;
    }

    searchResults = response.results;
  }

  function selectSearchResult(result: SearchResult) {
    selectedResult = result;
  }

  function clearSearch() {
    searchQuery = '';
    searchResults = [];
    selectedResult = null;
    singerName = '';
  }

  async function handleAddToQueue() {
    if (!selectedResult) {
      toastStore.error('Select a song first');
      return;
    }
    if (!singerName.trim()) {
      toastStore.error('Enter singer name');
      return;
    }

    const result = await join({
      name: singerName.trim(),
      videoId: selectedResult.id,
      title: selectedResult.title,
      verified: true,
    });

    if (result.kind === 'joined') {
      toastStore.success('Added to queue!');
      clearSearch();
    } else {
      const errorMsg = result.kind === 'error' ? result.message
        : result.kind === 'invalidVideo' ? result.reason
        : 'Failed to add';
      toastStore.error(errorMsg);
    }
  }

  async function handleAddToFront() {
    if (!selectedResult) {
      toastStore.error('Select a song first');
      return;
    }
    if (!singerName.trim()) {
      toastStore.error('Enter singer name');
      return;
    }

    const result = await adminAdd({
      name: singerName.trim(),
      videoId: selectedResult.id,
      title: selectedResult.title,
    });

    if (result.kind === 'joined') {
      toastStore.success('Added to front!');
      clearSearch();
    } else {
      const errorMsg = result.kind === 'error' ? result.message
        : result.kind === 'invalidVideo' ? result.reason
        : 'Failed to add';
      toastStore.error(errorMsg);
    }
  }

  async function handleSkip() {
    const result = await adminSkip();
    if (result.kind === 'skipped') {
      toastStore.success('Skipped!');
    } else {
      const errorMsg = result.kind === 'error' ? result.message
        : result.kind === 'nothingPlaying' ? 'Nothing is playing'
        : result.kind === 'unauthorized' ? 'Session expired'
        : 'Failed to skip';
      if (result.kind === 'unauthorized') handleAdminLogout();
      toastStore.error(errorMsg);
    }
  }

  async function handleRemove(entryId: string) {
    const result = await adminRemove(entryId);
    if (result.kind !== 'removed') {
      const errorMsg = result.kind === 'error' ? result.message
        : result.kind === 'entryNotFound' ? 'Entry not found'
        : result.kind === 'unauthorized' ? 'Session expired'
        : 'Failed to remove';
      if (result.kind === 'unauthorized') handleAdminLogout();
      toastStore.error(errorMsg);
    }
  }

  async function handleMoveUp(entryId: string) {
    const index = room.queue.findIndex(e => e.id === entryId);
    if (index <= 0) return;

    const result = await adminReorder(entryId, index - 1);
    if (result.kind !== 'reordered') {
      const errorMsg = result.kind === 'error' ? result.message : 'Failed to move';
      toastStore.error(errorMsg);
    }
  }

  async function handleMoveDown(entryId: string) {
    const index = room.queue.findIndex(e => e.id === entryId);
    if (index === -1 || index >= room.queue.length - 1) return;

    const result = await adminReorder(entryId, index + 1);
    if (result.kind !== 'reordered') {
      const errorMsg = result.kind === 'error' ? result.message : 'Failed to move';
      toastStore.error(errorMsg);
    }
  }
</script>

<div class="player-container">
  <div class="connection-status {connectionStatus.class}">
    {connectionStatus.text}
  </div>

  {#if energyState}
    <EnergyMeter energyState={energyState} />
  {/if}

  <ReactionOverlay items={floatingReactions} />
  <PinnedMessage message={pinnedMessage} />

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
    <div class="info-bar" class:with-controls={showControls}>
      {#if room.nowPlaying}
        <div class="now-playing">
          <span class="now-label">Now Playing</span>
          <span class="now-title">{room.nowPlaying.title}</span>
          <span class="now-singer">{room.nowPlaying.name}</span>
          {#if isAdminMode}
            <button class="skip-btn" onclick={handleSkip} title="Skip">⏭</button>
          {/if}
        </div>
      {/if}

      <div class="up-next-bar">
        <span class="up-next-bar-label">Up Next</span>
        <div class="up-next-list">
          {#if upNext.length === 0}
            <span class="empty-queue">Queue empty</span>
          {:else}
            {#each upNext.slice(0, 3) as entry, i (entry.id)}
              <div class="up-next-item">
                <div class="up-next-song">{entry.title}</div>
                <div class="up-next-singer">{entry.name}</div>
                {#if isAdminMode}
                  <div class="up-next-actions">
                    {#if i > 0}
                      <button class="action-btn" onclick={() => handleMoveUp(entry.id)} title="Move up">↑</button>
                    {/if}
                    {#if i < upNext.length - 1}
                      <button class="action-btn" onclick={() => handleMoveDown(entry.id)} title="Move down">↓</button>
                    {/if}
                    <button class="action-btn danger" onclick={() => handleRemove(entry.id)} title="Remove">×</button>
                  </div>
                {/if}
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Controls Panel -->
  {#if showControls}
    <div class="controls-panel">
      <div class="controls-row">
        <!-- Search Section -->
        <div class="search-section">
          <div class="search-input-row">
            <input
              type="text"
              class="search-input"
              placeholder="Search for a song..."
              bind:value={searchQuery}
              onkeypress={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button class="btn btn-cyan search-btn" onclick={handleSearch} disabled={isSearching}>
              {isSearching ? '...' : 'Search'}
            </button>
          </div>

          {#if searchResults.length > 0}
            <div class="search-results-dropdown">
              {#each searchResults.slice(0, 5) as result (result.id)}
                <button
                  class="search-result-item"
                  class:selected={selectedResult?.id === result.id}
                  onclick={() => selectSearchResult(result)}
                >
                  <img class="result-thumb" src={result.thumbnail} alt="" />
                  <div class="result-info">
                    <div class="result-title">{result.title}</div>
                    <div class="result-meta">{result.channel}</div>
                  </div>
                </button>
              {/each}
            </div>
          {/if}

          {#if selectedResult}
            <div class="selected-song">
              <span class="selected-title">{selectedResult.title}</span>
              <input
                type="text"
                class="singer-input"
                placeholder="Singer name"
                bind:value={singerName}
                maxlength="30"
              />
              <div class="add-actions">
                <button class="btn btn-cyan" onclick={handleAddToQueue}>Add</button>
                {#if isAdminMode}
                  <button class="btn btn-warning" onclick={handleAddToFront}>Front</button>
                {/if}
                <button class="btn btn-muted" onclick={clearSearch}>×</button>
              </div>
            </div>
          {/if}
        </div>

        <!-- Admin Toggle -->
        <div class="admin-section">
          {#if isAdminMode}
            <button class="admin-btn unlocked" onclick={handleAdminLogout} title="Logout">
              🔓
            </button>
          {:else}
            <button class="admin-btn locked" onclick={openPinModal} title="Admin Login">
              🔒
            </button>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Toggle Controls Button -->
  <button class="toggle-controls-btn" onclick={toggleControls} title={showControls ? 'Hide controls' : 'Show controls'}>
    {showControls ? '▼' : '▲'}
  </button>

  <!-- PIN Modal -->
  {#if showPinModal}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal-overlay" onclick={closePinModal}>
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div class="modal-content" onclick={(e) => e.stopPropagation()}>
        <h3>Admin Login</h3>
        <input
          type="password"
          inputmode="numeric"
          pattern="[0-9]*"
          maxlength="6"
          placeholder="Enter PIN"
          bind:value={adminPinInput}
          onkeydown={handlePinKeydown}
          disabled={isAuthenticating}
        />
        <div class="modal-actions">
          <button class="btn" onclick={handlePinSubmit} disabled={isAuthenticating || adminPinInput.length !== 6}>
            {isAuthenticating ? 'Verifying...' : 'Login'}
          </button>
          <button class="btn btn-muted" onclick={closePinModal}>Cancel</button>
        </div>
        {#if authError}
          <div class="auth-error">{authError}</div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<!-- Toast notifications -->
<Toast />

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

  /* Info bar adjustments for controls */
  .info-bar.with-controls {
    bottom: 70px;
  }

  .skip-btn {
    background: rgba(255, 165, 2, 0.2);
    border: 1px solid rgba(255, 165, 2, 0.3);
    color: var(--warning);
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 1.2rem;
    margin-left: 16px;
    transition: all 0.2s;
  }

  .skip-btn:hover {
    background: rgba(255, 165, 2, 0.3);
  }

  .up-next-item {
    position: relative;
  }

  .up-next-actions {
    position: absolute;
    top: 4px;
    right: 4px;
    display: flex;
    gap: 2px;
  }

  .action-btn {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: var(--text-muted);
    width: 24px;
    height: 24px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .action-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    color: var(--text);
  }

  .action-btn.danger:hover {
    background: rgba(255, 107, 157, 0.3);
    color: var(--accent);
  }

  /* Controls Panel */
  .controls-panel {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(10, 10, 15, 0.95);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    padding: 12px 24px;
    z-index: 50;
  }

  .controls-row {
    display: flex;
    align-items: flex-start;
    gap: 16px;
  }

  .search-section {
    flex: 1;
    position: relative;
  }

  .search-input-row {
    display: flex;
    gap: 8px;
  }

  .search-input {
    flex: 1;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 10px 14px;
    color: var(--text);
    font-size: 0.9rem;
    font-family: inherit;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--cyan);
  }

  .search-input::placeholder {
    color: var(--text-muted);
  }

  .search-btn {
    padding: 10px 16px;
    font-size: 0.85rem;
  }

  .search-results-dropdown {
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    background: var(--bg-card);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    margin-bottom: 8px;
    max-height: 300px;
    overflow-y: auto;
    z-index: 100;
  }

  .search-result-item {
    display: flex;
    gap: 10px;
    padding: 10px 12px;
    background: transparent;
    border: none;
    width: 100%;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    color: var(--text);
    transition: background 0.2s;
  }

  .search-result-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .search-result-item.selected {
    background: rgba(78, 205, 196, 0.15);
  }

  .result-thumb {
    width: 48px;
    height: 36px;
    border-radius: 4px;
    object-fit: cover;
  }

  .result-info {
    flex: 1;
    min-width: 0;
  }

  .result-title {
    font-size: 0.85rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .result-meta {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .selected-song {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 8px;
    padding: 8px 12px;
    background: rgba(78, 205, 196, 0.1);
    border-radius: 8px;
  }

  .selected-title {
    flex: 1;
    font-size: 0.85rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--cyan);
  }

  .singer-input {
    width: 120px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    padding: 6px 10px;
    color: var(--text);
    font-size: 0.85rem;
    font-family: inherit;
  }

  .singer-input:focus {
    outline: none;
    border-color: var(--cyan);
  }

  .add-actions {
    display: flex;
    gap: 6px;
  }

  .add-actions .btn {
    padding: 6px 12px;
    font-size: 0.8rem;
  }

  .admin-section {
    display: flex;
    align-items: center;
  }

  .admin-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 8px;
    border-radius: 8px;
    transition: all 0.2s;
  }

  .admin-btn.locked:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .admin-btn.unlocked {
    background: rgba(78, 205, 196, 0.2);
  }

  .admin-btn.unlocked:hover {
    background: rgba(78, 205, 196, 0.3);
  }

  .toggle-controls-btn {
    position: absolute;
    bottom: 0;
    right: 20px;
    transform: translateY(-100%);
    background: rgba(10, 10, 15, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-bottom: none;
    border-radius: 8px 8px 0 0;
    color: var(--text-muted);
    padding: 4px 12px;
    font-size: 0.8rem;
    cursor: pointer;
    z-index: 51;
    transition: all 0.2s;
  }

  .toggle-controls-btn:hover {
    color: var(--text);
    background: rgba(10, 10, 15, 1);
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }

  .modal-content {
    background: var(--bg-card);
    border-radius: 16px;
    padding: 24px;
    min-width: 280px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .modal-content h3 {
    margin: 0 0 16px;
    font-size: 1.25rem;
    text-align: center;
  }

  .modal-content input {
    width: 100%;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 12px;
    color: var(--text);
    font-size: 1.25rem;
    text-align: center;
    letter-spacing: 0.5em;
    font-family: inherit;
    margin-bottom: 16px;
  }

  .modal-content input:focus {
    outline: none;
    border-color: var(--cyan);
  }

  .modal-actions {
    display: flex;
    gap: 8px;
  }

  .modal-actions .btn {
    flex: 1;
  }

  .auth-error {
    color: var(--accent);
    font-size: 0.85rem;
    text-align: center;
    margin-top: 12px;
  }

  /* Button styles for controls */
  .btn {
    background: var(--accent);
    border: none;
    color: white;
    padding: 10px 20px;
    border-radius: 8px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn:hover:not(:disabled) {
    filter: brightness(1.1);
    transform: translateY(-1px);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-cyan {
    background: var(--cyan);
  }

  .btn-warning {
    background: var(--warning);
  }

  .btn-muted {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-muted);
  }

  .btn-muted:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.2);
    color: var(--text);
  }
</style>
