<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { QueueState, Entry } from '@karaoke/types';
  import { createWebSocket, getState } from '$lib';

  const PAUSE_VIDEO_ID = 'yRhlZ-X50R4';
  const PAUSE_DURATION = 7000;

  let room = $state<QueueState>({ queue: [], nowPlaying: null, currentEpoch: 0 });
  let extensionConnected = $state(false);
  let wsConnected = $state(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let player: any = null;
  let playerReady = $state(false);
  let currentVideoId: string | null = null;
  let isAdvancing = false;

  // Player modes
  type PlayerMode = 'playing_song' | 'playing_pause' | 'idle_loop';
  let playerMode = $state<PlayerMode>('idle_loop');
  let pauseTimeout: ReturnType<typeof setTimeout> | null = null;

  // Polling fallback
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  // WebSocket
  let ws = createWebSocket();
  let previousNowPlaying: Entry | null = null;

  // Derived
  const upNext = $derived(room.queue.slice(0, 3));

  onMount(() => {
    ws.onState((newState, extConnected) => {
      extensionConnected = extConnected ?? false;
      wsConnected = true;
      handleStateUpdate(newState);

      // Stop polling when WS connected
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
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
      (window as any).onYouTubeIframeAPIReady = initPlayer;
      if (!(window as any).YT) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      } else if ((window as any).YT.Player) {
        initPlayer();
      }
    }
  });

  onDestroy(() => {
    ws.disconnect();
    if (pollInterval) clearInterval(pollInterval);
    if (pauseTimeout) clearTimeout(pauseTimeout);
  });

  function startPolling() {
    pollInterval = setInterval(async () => {
      if (!wsConnected) {
        const state = await getState();
        if (state) handleStateUpdate(state);
      }
    }, 2000);
  }

  function handleStateUpdate(newState: QueueState) {
    const prevPlaying = previousNowPlaying;
    previousNowPlaying = newState.nowPlaying;
    room = newState;

    // Auto-start if queue has songs but nothing playing
    if (!room.nowPlaying && room.queue.length > 0 && !isAdvancing && !extensionConnected) {
      advanceToNext();
      return;
    }

    // Load new song if changed (only when not in extension mode)
    if (room.nowPlaying && !extensionConnected) {
      const prevId = prevPlaying?.id ?? null;
      if (room.nowPlaying.id !== prevId) {
        loadSong(room.nowPlaying);
      }
    } else if (!room.nowPlaying && room.queue.length === 0) {
      // Queue empty -> idle loop
      if (playerMode !== 'idle_loop' && playerMode !== 'playing_pause') {
        playerMode = 'idle_loop';
        if (playerReady && currentVideoId !== PAUSE_VIDEO_ID) {
          player?.loadVideoById(PAUSE_VIDEO_ID);
          currentVideoId = PAUSE_VIDEO_ID;
        }
      }
    }
  }

  function initPlayer() {
    player = new (window as any).YT.Player('player', {
      width: '100%',
      height: '100%',
      videoId: PAUSE_VIDEO_ID,
      playerVars: { autoplay: 1, controls: 1, modestbranding: 1, rel: 0, fs: 1 },
      events: {
        onReady: () => {
          playerReady = true;
          if (room.nowPlaying) {
            loadSong(room.nowPlaying);
          } else {
            playerMode = 'idle_loop';
            currentVideoId = PAUSE_VIDEO_ID;
          }
        },
        onStateChange: (event: any) => {
          if (event.data === (window as any).YT.PlayerState.ENDED) {
            if (playerMode === 'playing_song') {
              playPauseScreen();
            } else if (playerMode === 'playing_pause' || playerMode === 'idle_loop') {
              player?.loadVideoById(PAUSE_VIDEO_ID);
              currentVideoId = PAUSE_VIDEO_ID;
            }
          }
        },
        onError: () => {
          if (playerMode === 'playing_song') {
            playPauseScreen();
          } else {
            player?.loadVideoById(PAUSE_VIDEO_ID);
            currentVideoId = PAUSE_VIDEO_ID;
          }
        },
      },
    });
  }

  function extractVideoId(url: string): string | null {
    if (!url) return null;
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/watch\?.*&v=([a-zA-Z0-9_-]{11})/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  function loadSong(entry: Entry) {
    if (!entry || !playerReady || !entry.videoId) return;
    if (pauseTimeout) {
      clearTimeout(pauseTimeout);
      pauseTimeout = null;
    }
    playerMode = 'playing_song';
    currentVideoId = entry.videoId;
    player?.loadVideoById(entry.videoId);
  }

  function playPauseScreen() {
    playerMode = 'playing_pause';
    player?.loadVideoById(PAUSE_VIDEO_ID);
    currentVideoId = PAUSE_VIDEO_ID;

    if (pauseTimeout) clearTimeout(pauseTimeout);
    pauseTimeout = setTimeout(() => {
      advanceToNext();
    }, PAUSE_DURATION);
  }

  async function advanceToNext() {
    if (isAdvancing) return;
    isAdvancing = true;

    if (pauseTimeout) {
      clearTimeout(pauseTimeout);
      pauseTimeout = null;
    }

    try {
      const currentId = room.nowPlaying?.id ?? null;
      await fetch('/api/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentId }),
      });
      // State will update via WebSocket
    } catch (err) {
      console.error('Failed to advance:', err);
      playerMode = 'idle_loop';
      if (playerReady) {
        player?.loadVideoById(PAUSE_VIDEO_ID);
        currentVideoId = PAUSE_VIDEO_ID;
      }
    } finally {
      isAdvancing = false;
    }
  }

  function getConnectionStatus(): { class: string; text: string } {
    if (extensionConnected) return { class: 'extension', text: 'Extension' };
    if (wsConnected) return { class: 'connected', text: 'Live' };
    if (pollInterval) return { class: 'polling', text: 'Polling' };
    return { class: 'disconnected', text: 'Connecting...' };
  }

  const connectionStatus = $derived(getConnectionStatus());
</script>

<svelte:head>
  <title>Karaoke Player</title>
</svelte:head>

<div class="player-container">
  <div class="connection-status {connectionStatus.class}">
    {connectionStatus.text}
  </div>

  <div class="video-wrapper">
    <div id="player" style:display={extensionConnected ? 'none' : 'block'}></div>
    {#if extensionConnected}
      <div class="extension-mode">
        <div class="extension-icon">📺</div>
        <div class="extension-text">Playing on venue TV</div>
      </div>
    {/if}
  </div>

  <div class="info-bar">
    {#if room.nowPlaying && playerMode === 'playing_song'}
      <div class="now-playing">
        <span class="now-label">Now Playing</span>
        <span class="now-title">{room.nowPlaying.title}</span>
        <span class="now-singer">{room.nowPlaying.name}</span>
      </div>
    {:else if playerMode === 'playing_pause' && room.queue.length > 0}
      <div class="now-playing">
        <span class="now-label">Up Next</span>
        <span class="now-title">{room.queue[0]?.title}</span>
        <span class="now-singer">{room.queue[0]?.name}</span>
      </div>
    {/if}

    <div class="up-next">
      <span class="up-next-label">Up Next</span>
      <div class="up-next-list">
        {#if upNext.length === 0}
          <span class="empty-queue">Waiting for songs... Scan to join!</span>
        {:else}
          {#each (playerMode === 'playing_pause' ? upNext.slice(1) : upNext) as entry (entry.id)}
            <div class="up-next-item">
              <div class="up-next-song">{entry.title}</div>
              <div class="up-next-singer">{entry.name}</div>
            </div>
          {:else}
            <span class="empty-queue">No more songs after this</span>
          {/each}
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
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

  :global(#player) {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  .extension-mode {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: var(--bg-deep);
  }

  .extension-icon {
    font-size: 4rem;
    margin-bottom: 16px;
  }

  .extension-text {
    font-size: 1.5rem;
    color: var(--text-muted);
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
</style>
