<script lang="ts">
  import type { SearchResult } from "@karaoke/types";
  import { fade } from "svelte/transition";
  import { search as searchApi } from "../api";

  interface Props {
    maxDuration?: number;
    onSelect: (result: SearchResult) => void;
  }

  let { maxDuration = 420, onSelect }: Props = $props();

  let query = $state("");
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

    if (response.kind === "error") {
      errorMsg = response.message;
      return;
    }

    if (response.results.length === 0) {
      errorMsg = "No results found. Try a different search.";
      return;
    }

    results = response.results;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
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
    <button
      class="btn btn-cyan search-btn"
      onclick={performSearch}
      disabled={isSearching}
    >
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
      {#each results as result, i (result.id)}
        <button
          in:fade={{ duration: 200, delay: i * 50 }}
          class="search-result"
          class:selected={selectedId === result.id}
          class:too-long={isTooLong(result)}
          onclick={() => selectResult(result)}
          disabled={isTooLong(result)}
        >
          <div class="result-thumb-wrapper">
            <img
              class="result-thumb"
              src={result.thumbnail}
              alt=""
              loading="lazy"
            />
            <span
              class="result-duration"
              class:too-long-badge={isTooLong(result)}
            >
              {result.duration}
            </span>
          </div>
          <div class="result-info">
            <div class="result-title">{result.title}</div>
            <div class="result-channel">{result.channel}</div>
            {#if isTooLong(result)}
              <div class="too-long-msg">Too long (max 7 min)</div>
            {/if}
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
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
    margin-top: 16px;
  }

  .search-result {
    display: flex;
    flex-direction: column;
    padding: 0;
    background: rgba(255, 255, 255, 0.03);
    border: 2px solid transparent;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
    color: inherit;
    font-family: inherit;
    overflow: hidden;
  }

  .search-result:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.1);
    transform: translateY(-2px);
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
    transform: none;
  }

  .result-thumb-wrapper {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
  }

  .result-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
    background: rgba(0, 0, 0, 0.3);
  }

  .result-duration {
    position: absolute;
    bottom: 6px;
    right: 6px;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    font-size: 0.7rem;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .result-duration.too-long-badge {
    background: var(--warning);
    color: black;
  }

  .result-info {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .result-title {
    font-size: 0.85rem;
    font-weight: 500;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .result-channel {
    font-size: 0.75rem;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .too-long-msg {
    font-size: 0.7rem;
    color: var(--warning);
    font-weight: 500;
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

  /* Mobile: 2 columns */
  @media (max-width: 480px) {
    .search-results {
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }

    .result-info {
      padding: 8px;
    }

    .result-title {
      font-size: 0.8rem;
    }
  }
</style>
