<script lang="ts">
  import type { SearchResult } from '@karaoke/types';
  import { search as searchApi } from '../api';

  interface Props {
    maxDuration?: number;
    onSelect: (result: SearchResult) => void;
  }

  let { maxDuration = 420, onSelect }: Props = $props();

  let query = $state('');
  let results = $state<SearchResult[]>([]);
  let isSearching = $state(false);
  let selectedId = $state<string | null>(null);
  let errorMsg = $state<string | null>(null);

  async function performSearch() {
    if (!query.trim() || isSearching) return;

    isSearching = true;
    errorMsg = null;
    results = [];
    selectedId = null;

    const response = await searchApi(query.trim());

    isSearching = false;

    if (response.error) {
      errorMsg = response.error;
      return;
    }

    if (response.results.length === 0) {
      errorMsg = 'No results found. Try a different search.';
      return;
    }

    results = response.results;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      performSearch();
    }
  }

  function selectResult(result: SearchResult) {
    if (result.durationSeconds > maxDuration) return;
    selectedId = result.id;
    onSelect(result);
  }

  function isTooLong(result: SearchResult): boolean {
    return result.durationSeconds > maxDuration;
  }
</script>

<div class="search-container">
  <div class="search-row">
    <input
      type="text"
      bind:value={query}
      placeholder="Song title or artist..."
      onkeydown={handleKeydown}
      autocomplete="off"
    />
    <button class="btn btn-cyan search-btn" onclick={performSearch} disabled={isSearching}>
      Search
    </button>
  </div>

  {#if isSearching}
    <div class="searching-indicator">
      <div class="spinner"></div>
      Searching...
    </div>
  {:else if errorMsg}
    <div class="no-results">{errorMsg}</div>
  {:else if results.length > 0}
    <div class="search-results">
      {#each results as result (result.id)}
        <button
          class="search-result"
          class:selected={selectedId === result.id}
          class:too-long={isTooLong(result)}
          onclick={() => selectResult(result)}
          disabled={isTooLong(result)}
        >
          <img class="result-thumb" src={result.thumbnail} alt="" loading="lazy" />
          <div class="result-info">
            <div class="result-title">{result.title}</div>
            <div class="result-meta">
              <span>{result.channel}</span>
              <span class="result-duration" class:too-long-text={isTooLong(result)}>
                {result.duration}{#if isTooLong(result)} (too long){/if}
              </span>
            </div>
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .search-container {
    margin-bottom: 16px;
  }

  .search-row {
    display: flex;
    gap: 12px;
  }

  .search-row input {
    flex: 1;
  }

  .search-btn {
    flex-shrink: 0;
    width: auto;
    padding: 16px 24px;
  }

  .search-results {
    display: grid;
    gap: 12px;
    margin-top: 16px;
    max-height: 400px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
  }

  .search-results::-webkit-scrollbar {
    width: 6px;
  }

  .search-results::-webkit-scrollbar-track {
    background: transparent;
  }

  .search-results::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
  }

  .search-results::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
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
    text-align: left;
    color: inherit;
    font-family: inherit;
    width: 100%;
  }

  .search-result:hover:not(:disabled) {
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
    background: rgba(0, 0, 0, 0.3);
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
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .no-results {
    text-align: center;
    padding: 24px;
    color: var(--text-muted);
  }
</style>
