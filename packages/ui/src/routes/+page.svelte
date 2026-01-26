<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { SearchResult, QueueState } from '@karaoke/types';
  import { createWebSocket, join, vote as voteApi, remove as removeApi, skip as skipApi } from '$lib';
  import NowPlaying from '$lib/components/NowPlaying.svelte';
  import Search from '$lib/components/Search.svelte';
  import Queue from '$lib/components/Queue.svelte';
  import PinModal from '$lib/components/PinModal.svelte';
  import { toastStore } from '$lib/stores/toast.svelte';
  import HelpButton from '$lib/components/HelpButton.svelte';

  // State
  let room = $state<QueueState>({ queue: [], nowPlaying: null, currentEpoch: 0 });
  let myName = $state('');
  let voterId = $state('');
  let myVotes = $state<Record<string, number>>({});
  let verifiedNames = $state<Record<string, boolean>>({});

  // Form state
  let selectedSong = $state<SearchResult | null>(null);
  let validatedUrl = $state<string | null>(null);
  let validatedTitle = $state<string | null>(null);
  let isJoining = $state(false);
  let joinError = $state<string | null>(null);

  // PIN modal state
  let pinMode = $state<'claim' | 'verify' | 'closed'>('closed');
  let pinName = $state('');
  let pendingJoin = $state<{ name: string; url: string; title: string } | null>(null);

  // YouTube validation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ytPlayer: any = null;
  let validationStatus = $state<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  let validationMsg = $state('');

  const MAX_DURATION = 420; // 7 minutes

  // WebSocket
  let ws = createWebSocket();
  let previousNowPlaying: typeof room.nowPlaying = null;

  // Derived
  const myEntry = $derived(room.queue.find(e => e.name.toLowerCase() === myName.toLowerCase()));
  const isMyTurn = $derived(room.nowPlaying?.name.toLowerCase() === myName.toLowerCase());
  const isInQueue = $derived(!!myEntry);
  const canJoin = $derived(
    myName.trim().length > 0 &&
    validatedUrl &&
    !isInQueue &&
    !isMyTurn
  );

  // Initialize
  onMount(() => {
    // Restore from localStorage
    myName = localStorage.getItem('karaoke_name') ?? '';
    voterId = localStorage.getItem('karaoke_voter_id') ?? crypto.randomUUID();
    myVotes = JSON.parse(localStorage.getItem('karaoke_votes') ?? '{}');
    verifiedNames = JSON.parse(localStorage.getItem('karaoke_verified') ?? '{}');

    // Save voterId
    localStorage.setItem('karaoke_voter_id', voterId);

    // Connect WebSocket
    ws.onState(handleStateUpdate);
    ws.connect('user');

    // Load YouTube API
    if (typeof window !== 'undefined' && !(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  });

  onDestroy(() => {
    ws.disconnect();
  });

  function handleStateUpdate(newState: QueueState) {
    // Check if user's song just finished
    const wasPlaying = previousNowPlaying?.name.toLowerCase() === myName.toLowerCase();
    const isNowPlaying = newState.nowPlaying?.name.toLowerCase() === myName.toLowerCase();

    if (wasPlaying && !isNowPlaying && myName) {
      const isVerified = verifiedNames[myName.toLowerCase()] === true;
      if (!isVerified) {
        // Show PIN claim modal
        pinName = myName;
        pinMode = 'claim';
      } else {
        toastStore.success('Your song is done! Add another?');
      }
    }

    previousNowPlaying = newState.nowPlaying;
    room = newState;
  }

  function handleNameInput(e: Event) {
    const target = e.target as HTMLInputElement;
    myName = target.value;
    localStorage.setItem('karaoke_name', myName);
  }

  function handleSongSelect(result: SearchResult) {
    selectedSong = result;
    const url = `https://www.youtube.com/watch?v=${result.id}`;
    validateUrl(url, result.title);
  }

  async function validateUrl(url: string, title?: string) {
    validationStatus = 'checking';
    validationMsg = 'Checking video...';

    const videoId = extractVideoId(url);
    if (!videoId) {
      validationStatus = 'invalid';
      validationMsg = 'Invalid YouTube URL';
      validatedUrl = null;
      validatedTitle = null;
      return;
    }

    // Use YouTube IFrame API to validate
    if (typeof window !== 'undefined' && (window as any).YT) {
      await validateWithYT(videoId, url, title);
    } else {
      // Fallback: trust the URL
      validationStatus = 'valid';
      validationMsg = 'Ready to add!';
      validatedUrl = url;
      validatedTitle = title ?? 'Unknown Song';
    }
  }

  function validateWithYT(videoId: string, url: string, title?: string): Promise<void> {
    return new Promise((resolve) => {
      const container = document.getElementById('validationPlayer');
      if (!container) {
        validationStatus = 'valid';
        validatedUrl = url;
        validatedTitle = title ?? 'Unknown Song';
        resolve();
        return;
      }

      container.innerHTML = '<div id="ytPlayer"></div>';

      ytPlayer = new (window as any).YT.Player('ytPlayer', {
        height: '1',
        width: '1',
        videoId,
        playerVars: { autoplay: 0, controls: 0 },
        events: {
          onReady: (event: any) => {
            const duration = event.target.getDuration();
            const data = event.target.getVideoData();

            if (duration === 0) {
              validationStatus = 'invalid';
              validationMsg = 'Livestreams not allowed';
              validatedUrl = null;
              resolve();
              return;
            }

            if (duration > MAX_DURATION) {
              const mins = Math.floor(duration / 60);
              const secs = Math.round(duration % 60);
              validationStatus = 'invalid';
              validationMsg = `Too long (${mins}:${secs.toString().padStart(2, '0')}) - max 7 minutes`;
              validatedUrl = null;
              resolve();
              return;
            }

            validatedUrl = url;
            validatedTitle = title ?? data.title ?? 'Unknown Song';
            validationStatus = 'valid';
            validationMsg = 'Ready to add!';
            resolve();
          },
          onError: () => {
            validationStatus = 'invalid';
            validationMsg = 'Video not found or unavailable';
            validatedUrl = null;
            resolve();
          },
        },
      });

      // Timeout fallback
      setTimeout(() => {
        if (validationStatus === 'checking') {
          validationStatus = 'invalid';
          validationMsg = 'Could not load video';
          validatedUrl = null;
          resolve();
        }
      }, 10000);
    });
  }

  function extractVideoId(url: string): string | null {
    if (!url) return null;
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/watch\?.*&v=([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
      /music\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  async function handleJoin() {
    if (!canJoin || !validatedUrl || !validatedTitle) return;

    isJoining = true;
    joinError = null;

    const isVerified = verifiedNames[myName.toLowerCase()] === true;
    const videoId = extractVideoId(validatedUrl);
    if (!videoId) {
      joinError = 'Invalid video URL';
      return;
    }

    const result = await join({
      name: myName.trim(),
      videoId,
      title: validatedTitle,
      verified: isVerified,
    });

    isJoining = false;

    if (result.requiresPin) {
      // Need PIN verification
      pendingJoin = { name: myName.trim(), url: validatedUrl, title: validatedTitle };
      pinName = myName.trim();
      pinMode = 'verify';
      return;
    }

    if (!result.success) {
      joinError = result.error ?? 'Failed to join queue';
      return;
    }

    toastStore.success(`You're #${result.position} in the queue!`);
    resetForm();
  }

  function resetForm() {
    selectedSong = null;
    validatedUrl = null;
    validatedTitle = null;
    validationStatus = 'idle';
    validationMsg = '';
    joinError = null;
  }

  async function handleVote(entryId: string, direction: -1 | 0 | 1) {
    const result = await voteApi(entryId, direction, voterId);
    if (result.success) {
      if (direction === 0) {
        const { [entryId]: _, ...rest } = myVotes;
        myVotes = rest;
      } else {
        myVotes = { ...myVotes, [entryId]: direction };
      }
      localStorage.setItem('karaoke_votes', JSON.stringify(myVotes));
    }
  }

  async function handleRemove(entryId: string) {
    if (!confirm('Remove your song from the queue?')) return;
    const result = await removeApi(entryId, myName);
    if (!result.success) {
      toastStore.error(result.error ?? 'Failed to remove');
    }
  }

  async function handleSkip() {
    if (!confirm('Skip your song?')) return;
    const result = await skipApi(myName);
    if (result.success) {
      toastStore.success('Song skipped');
    } else {
      toastStore.error(result.error ?? 'Failed to skip');
    }
  }

  function handlePinSuccess() {
    verifiedNames = { ...verifiedNames, [pinName.toLowerCase()]: true };
    localStorage.setItem('karaoke_verified', JSON.stringify(verifiedNames));

    if (pinMode === 'verify' && pendingJoin) {
      // Retry the join
      validatedUrl = pendingJoin.url;
      validatedTitle = pendingJoin.title;
      myName = pendingJoin.name;
      pendingJoin = null;
      pinMode = 'closed';
      handleJoin();
    } else {
      toastStore.success('Your name is locked in!');
      pinMode = 'closed';
    }
  }

  function handlePinClose() {
    pinMode = 'closed';
    pendingJoin = null;
  }

  function handleChangeName() {
    pinMode = 'closed';
    pendingJoin = null;
    myName = '';
    document.getElementById('nameInput')?.focus();
  }
</script>

<svelte:head>
  <title>Karaoke Queue</title>
</svelte:head>

<div class="container">
  <header>
    <h1>Karaoke</h1>
    <p class="subtitle">Pick a song, join the queue, sing your heart out</p>
  </header>

  {#if room.nowPlaying}
    <NowPlaying entry={room.nowPlaying} canSkip={isMyTurn} onSkip={handleSkip} />
  {/if}

  <div class="join-card" class:disabled={isInQueue || isMyTurn}>
    <div class="input-group">
      <label class="input-label" for="nameInput">Your name</label>
      <input
        type="text"
        id="nameInput"
        placeholder="Enter your name"
        maxlength="30"
        autocomplete="off"
        value={myName}
        oninput={handleNameInput}
      />
    </div>

    <div class="input-group">
      <span class="input-label">Search for a song</span>
      <Search maxDuration={MAX_DURATION} onSelect={handleSongSelect} />

      {#if selectedSong}
        <div class="selected-song">
          <div class="selected-song-title">{selectedSong.title}</div>
          <div class="selected-song-meta">{selectedSong.channel} · {selectedSong.duration}</div>
        </div>
      {/if}

      {#if validationStatus !== 'idle'}
        <div class="validation-status {validationStatus}">
          {#if validationStatus === 'checking'}
            <div class="validation-spinner"></div>
          {/if}
          {validationMsg}
        </div>
      {/if}
    </div>

    <button class="btn" onclick={handleJoin} disabled={!canJoin || isJoining}>
      Add to Queue
    </button>

    {#if joinError}
      <div class="error-msg">{joinError}</div>
    {/if}
  </div>

  <Queue
    entries={room.queue}
    {myName}
    {myVotes}
    onVote={handleVote}
    onRemove={handleRemove}
  />
</div>

<div id="validationPlayer" style="display: none;"></div>

<PinModal
  mode={pinMode}
  name={pinName}
  onSuccess={handlePinSuccess}
  onClose={handlePinClose}
  onChangeName={handleChangeName}
/>

<HelpButton />

<style>
  header {
    text-align: center;
    margin-bottom: 32px;
  }

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

  .subtitle {
    color: var(--text-muted);
    font-size: 0.95rem;
    font-weight: 300;
  }

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

  .input-group {
    margin-bottom: 16px;
  }

  .input-label {
    display: block;
    font-size: 0.85rem;
    color: var(--text-muted);
    margin-bottom: 8px;
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

  .validation-status {
    font-size: 0.85rem;
    margin-top: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .validation-status.checking {
    color: var(--cyan);
  }

  .validation-status.valid {
    color: var(--success);
  }

  .validation-status.invalid {
    color: var(--warning);
  }

  .validation-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(78, 205, 196, 0.3);
    border-top-color: var(--cyan);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .error-msg {
    color: var(--warning);
    font-size: 0.85rem;
    margin-top: 12px;
    text-align: center;
    animation: shake 0.4s ease;
  }
</style>
