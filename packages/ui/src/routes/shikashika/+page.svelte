<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { QueueState, SearchResult } from '@karaoke/types';
  import {
    createWebSocket,
    getState,
    adminSkip,
    adminRemove,
    adminAdd,
    adminReorder,
    search as searchApi,
  } from '$lib';
  import { toastStore } from '$lib/stores/toast.svelte';

  let room = $state<QueueState>({ queue: [], nowPlaying: null, currentEpoch: 0 });

  // Add form
  let addName = $state('');
  let addUrl = $state('');
  let addTitle = $state('');
  let searchQuery = $state('');
  let searchResults = $state<SearchResult[]>([]);
  let isSearching = $state(false);
  let selectedId = $state<string | null>(null);

  // History
  let historyExpanded = $state(false);
  let activeTab = $state<'singer' | 'popular'>('singer');
  let lookupName = $state('');
  let singerResults = $state<any>(null);
  let popularSongs = $state<any[]>([]);
  let popularLoaded = $state(false);

  // WebSocket
  let ws = createWebSocket();
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    ws.onState((newState) => {
      room = newState;
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    });

    ws.connect('admin');

    // Fallback polling
    pollInterval = setInterval(async () => {
      const state = await getState();
      if (state) room = state;
    }, 2000);
  });

  onDestroy(() => {
    ws.disconnect();
    if (pollInterval) clearInterval(pollInterval);
  });

  async function handleSkip() {
    const result = await adminSkip();
    if (result.success) {
      toastStore.success('Skipped!');
    } else {
      toastStore.error(result.error ?? 'Failed to skip');
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim() || isSearching) return;

    isSearching = true;
    searchResults = [];
    selectedId = null;

    const response = await searchApi(searchQuery.trim());
    isSearching = false;

    if (response.error) {
      toastStore.error(response.error);
      return;
    }

    searchResults = response.results;
  }

  function selectResult(result: SearchResult) {
    selectedId = result.id;
    addUrl = `https://www.youtube.com/watch?v=${result.id}`;
    addTitle = result.title;
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

  async function handleAdd() {
    if (!addName.trim() || !addUrl.trim()) {
      toastStore.error('Name and URL required');
      return;
    }

    const videoId = extractVideoId(addUrl.trim());
    if (!videoId) {
      toastStore.error('Invalid YouTube URL');
      return;
    }

    const result = await adminAdd({
      name: addName.trim(),
      videoId,
      title: addTitle.trim() || 'Added by admin',
    });

    if (result.success) {
      toastStore.success('Added to front of queue!');
      addName = '';
      addUrl = '';
      addTitle = '';
      searchQuery = '';
      searchResults = [];
      selectedId = null;
    } else {
      toastStore.error(result.error ?? 'Failed to add');
    }
  }

  async function handleRemove(entryId: string) {
    if (!confirm('Remove this entry?')) return;

    const result = await adminRemove(entryId);
    if (!result.success) {
      toastStore.error(result.error ?? 'Failed to remove');
    }
  }

  async function handleMoveUp(entryId: string) {
    const index = room.queue.findIndex(e => e.id === entryId);
    if (index <= 0) return;

    const result = await adminReorder(entryId, index - 1);
    if (!result.success) {
      toastStore.error(result.error ?? 'Failed to move');
    }
  }

  async function handleMoveDown(entryId: string) {
    const index = room.queue.findIndex(e => e.id === entryId);
    if (index === -1 || index >= room.queue.length - 1) return;

    const result = await adminReorder(entryId, index + 1);
    if (!result.success) {
      toastStore.error(result.error ?? 'Failed to move');
    }
  }

  function toggleHistory() {
    historyExpanded = !historyExpanded;
  }

  function switchTab(tab: 'singer' | 'popular') {
    activeTab = tab;
    if (tab === 'popular' && !popularLoaded) {
      loadPopularSongs();
    }
  }

  async function lookupSinger() {
    if (!lookupName.trim()) return;

    try {
      const res = await fetch(`/api/history/${encodeURIComponent(lookupName.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        singerResults = { error: data.error ?? 'Not found' };
      } else {
        singerResults = data;
      }
    } catch {
      singerResults = { error: 'Lookup failed' };
    }
  }

  async function loadPopularSongs() {
    try {
      const res = await fetch('/api/songs/popular?limit=20');
      const data = await res.json();
      if (res.ok && data.songs) {
        popularSongs = data.songs;
        popularLoaded = true;
      }
    } catch {
      popularSongs = [];
    }
  }
</script>

<svelte:head>
  <title>Karaoke Admin</title>
</svelte:head>

<div class="container admin-container">
  <header>
    <h1>Admin Control</h1>
    <p class="subtitle">Manage the karaoke queue</p>
  </header>

  <!-- Now Playing -->
  <div class="now-playing-card">
    {#if room.nowPlaying}
      <div class="now-playing-header">
        <span class="now-playing-label">Now Playing</span>
        <span class="epoch-badge">Epoch: {room.currentEpoch}</span>
      </div>
      <div class="now-playing-info">
        <div class="now-playing-title">{room.nowPlaying.title}</div>
        <div class="now-playing-singer">{room.nowPlaying.name}</div>
      </div>
      <div class="now-playing-controls">
        <button class="btn btn-warning" onclick={handleSkip}>Skip Song</button>
      </div>
    {:else}
      <div class="now-playing-empty">Nothing playing</div>
    {/if}
  </div>

  <!-- Add Entry -->
  <div class="add-card">
    <div class="add-header">Add Entry (Plays Next)</div>
    <div class="add-form">
      <input
        type="text"
        bind:value={addName}
        placeholder="Singer name"
        maxlength="30"
      />
      <div class="search-row">
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search for a song..."
          onkeypress={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button class="btn btn-cyan search-btn" onclick={handleSearch} disabled={isSearching}>
          Search
        </button>
      </div>

      {#if isSearching}
        <div class="searching">Searching...</div>
      {:else if searchResults.length > 0}
        <div class="search-results">
          {#each searchResults as result (result.id)}
            <button
              class="search-result"
              class:selected={selectedId === result.id}
              onclick={() => selectResult(result)}
            >
              <img class="result-thumb" src={result.thumbnail} alt="" />
              <div class="result-info">
                <div class="result-title">{result.title}</div>
                <div class="result-meta">{result.channel} · {result.duration}</div>
              </div>
            </button>
          {/each}
        </div>
      {/if}

      <input
        type="text"
        bind:value={addUrl}
        placeholder="YouTube URL (or select from search)"
      />
      <input
        type="text"
        bind:value={addTitle}
        placeholder="Song title"
        maxlength="100"
      />
      <button class="btn btn-cyan" onclick={handleAdd}>Add to Front</button>
    </div>
  </div>

  <!-- Queue -->
  <div class="queue-section">
    <div class="section-header">
      <span class="section-title">Queue</span>
      <span class="queue-count">{room.queue.length} entries</span>
    </div>

    {#if room.queue.length === 0}
      <div class="empty-state">Queue is empty</div>
    {:else}
      <ul class="queue-list">
        {#each room.queue as entry, i (entry.id)}
          <li class="queue-item">
            <span class="position">{i + 1}</span>
            <div class="queue-info">
              <div class="queue-song">{entry.title}</div>
              <div class="queue-meta">
                <span>{entry.name}</span>
                <span>Epoch: {entry.epoch}</span>
                <span>Votes: {entry.votes}</span>
              </div>
            </div>
            <div class="queue-actions">
              {#if i > 0}
                <button class="action-btn" onclick={() => handleMoveUp(entry.id)} title="Move up">^</button>
              {/if}
              {#if i < room.queue.length - 1}
                <button class="action-btn" onclick={() => handleMoveDown(entry.id)} title="Move down">v</button>
              {/if}
              <button class="action-btn danger" onclick={() => handleRemove(entry.id)} title="Remove">x</button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <!-- History -->
  <div class="history-section">
    <button class="history-header" onclick={toggleHistory}>
      <span class="section-title">History & Stats</span>
      <span class="history-toggle" class:expanded={historyExpanded}>▼</span>
    </button>

    {#if historyExpanded}
      <div class="history-content">
        <div class="history-tabs">
          <button
            class="history-tab"
            class:active={activeTab === 'singer'}
            onclick={() => switchTab('singer')}
          >
            Singer Lookup
          </button>
          <button
            class="history-tab"
            class:active={activeTab === 'popular'}
            onclick={() => switchTab('popular')}
          >
            Popular Songs
          </button>
        </div>

        {#if activeTab === 'singer'}
          <div class="lookup-row">
            <input
              type="text"
              bind:value={lookupName}
              placeholder="Singer name..."
              onkeypress={(e) => e.key === 'Enter' && lookupSinger()}
            />
            <button class="btn btn-cyan lookup-btn" onclick={lookupSinger}>Lookup</button>
          </div>

          {#if singerResults}
            {#if singerResults.error}
              <div class="searching">{singerResults.error}</div>
            {:else if singerResults.performances?.length === 0}
              <div class="searching">No history for this singer</div>
            {:else}
              <div class="stats-row">
                <span class="stat-badge"><strong>{singerResults.totalSongs}</strong> songs</span>
                <span class="stat-badge"><strong>{singerResults.completedSongs}</strong> completed</span>
                <span class="stat-badge"><strong>{singerResults.totalVotes}</strong> total votes</span>
                {#if singerResults.claimed}
                  <span class="claimed-badge">claimed</span>
                {/if}
              </div>
              {#each singerResults.performances.slice(0, 10) as p}
                <div class="history-item">
                  <span class="history-item-title">{p.title}</span>
                  <span class="history-item-meta">
                    {p.votes > 0 ? '+' : ''}{p.votes} votes · {new Date(p.performedAt).toLocaleDateString()}
                  </span>
                </div>
              {/each}
              {#if singerResults.performances.length > 10}
                <div class="searching">...and {singerResults.performances.length - 10} more</div>
              {/if}
            {/if}
          {/if}
        {:else}
          {#if !popularLoaded}
            <div class="searching">Loading popular songs...</div>
          {:else if popularSongs.length === 0}
            <div class="searching">No songs recorded yet</div>
          {:else}
            {#each popularSongs as song, i (song.videoId)}
              <div class="popular-item">
                <span class="popular-rank" class:top={i < 3}>{i + 1}</span>
                <div class="popular-info">
                  <div class="popular-title">{song.title}</div>
                  <div class="popular-stats">{song.timesPlayed} plays · {song.totalVotes} votes</div>
                </div>
              </div>
            {/each}
          {/if}
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .admin-container {
    max-width: 600px;
  }

  header {
    text-align: center;
    margin-bottom: 32px;
  }

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

  .subtitle {
    color: var(--text-muted);
    font-size: 0.95rem;
    font-weight: 300;
  }

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

  .epoch-badge {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .now-playing-info {
    margin-bottom: 16px;
  }

  .now-playing-title {
    font-size: 1.1rem;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .now-playing-singer {
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .now-playing-controls {
    display: flex;
    gap: 12px;
  }

  .now-playing-empty {
    text-align: center;
    color: var(--text-muted);
    font-style: italic;
    padding: 20px;
  }

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

  .add-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .search-row {
    display: flex;
    gap: 12px;
  }

  .search-btn, .lookup-btn {
    flex-shrink: 0;
    width: auto;
    padding: 12px 16px;
  }

  .search-results {
    max-height: 300px;
    overflow-y: auto;
  }

  .search-result {
    display: flex;
    gap: 10px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.03);
    border: 2px solid transparent;
    border-radius: 10px;
    cursor: pointer;
    margin-bottom: 8px;
    transition: all 0.2s ease;
    width: 100%;
    text-align: left;
    font-family: inherit;
    color: inherit;
  }

  .search-result:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.1);
  }

  .search-result.selected {
    background: rgba(78, 205, 196, 0.15);
    border-color: var(--cyan);
  }

  .result-thumb {
    width: 64px;
    height: 36px;
    border-radius: 4px;
    object-fit: cover;
    flex-shrink: 0;
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

  .searching {
    text-align: center;
    padding: 20px;
    color: var(--text-muted);
  }

  .queue-section {
    background: var(--bg-card);
    border-radius: 20px;
    padding: 20px;
    margin-bottom: 24px;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .section-title {
    font-size: 1rem;
    font-weight: 600;
  }

  .queue-count {
    background: rgba(255, 255, 255, 0.1);
    padding: 4px 12px;
    border-radius: 16px;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .queue-list {
    list-style: none;
  }

  .queue-item {
    display: flex;
    align-items: center;
    padding: 12px;
    border-radius: 12px;
    margin-bottom: 8px;
    background: rgba(255, 255, 255, 0.03);
    transition: all 0.2s ease;
  }

  .queue-item:hover {
    background: rgba(255, 255, 255, 0.06);
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
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-muted);
  }

  .queue-info {
    flex: 1;
    min-width: 0;
  }

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

  .queue-actions {
    display: flex;
    gap: 4px;
    margin-left: 8px;
  }

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

  .history-section {
    background: var(--bg-card);
    border-radius: 20px;
    padding: 20px;
    margin-bottom: 24px;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .history-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    width: 100%;
    background: none;
    border: none;
    color: inherit;
    font-family: inherit;
    padding: 0;
  }

  .history-toggle {
    color: var(--text-muted);
    font-size: 1.2rem;
    transition: transform 0.2s;
  }

  .history-toggle.expanded {
    transform: rotate(180deg);
  }

  .history-content {
    margin-top: 16px;
  }

  .history-tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }

  .history-tab {
    padding: 8px 16px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-family: inherit;
    font-size: 0.85rem;
    transition: all 0.2s;
  }

  .history-tab:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .history-tab.active {
    background: rgba(78, 205, 196, 0.2);
    color: var(--cyan);
  }

  .lookup-row {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
  }

  .stats-row {
    display: flex;
    gap: 16px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .stat-badge {
    background: rgba(255, 255, 255, 0.05);
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 0.8rem;
  }

  .stat-badge strong {
    color: var(--cyan);
  }

  .claimed-badge {
    display: inline-block;
    background: rgba(123, 237, 159, 0.2);
    color: var(--success);
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .history-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 8px;
    margin-bottom: 8px;
  }

  .history-item-title {
    font-size: 0.9rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }

  .history-item-meta {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-left: 12px;
    white-space: nowrap;
  }

  .popular-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 8px;
    margin-bottom: 8px;
  }

  .popular-rank {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 600;
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-muted);
  }

  .popular-rank.top {
    background: rgba(255, 165, 2, 0.3);
    color: var(--warning);
  }

  .popular-info {
    flex: 1;
    min-width: 0;
  }

  .popular-title {
    font-size: 0.9rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .popular-stats {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
</style>
