<script lang="ts">
  import type { SongStats } from '@karaoke/types';
  import { getPopularSongs } from '../api';
  import { onMount } from 'svelte';

  interface Props {
    onSelect: (videoId: string, title: string) => void;
  }

  let { onSelect }: Props = $props();

  let songs = $state<SongStats[]>([]);
  let isLoading = $state(true);
  let hasLoaded = $state(false);

  onMount(async () => {
    const result = await getPopularSongs(8);
    isLoading = false;
    hasLoaded = true;
    if (result.kind === 'songs') {
      songs = result.songs;
    }
  });

  function getThumbnail(videoId: string): string {
    return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
  }

  function handleClick(song: SongStats) {
    onSelect(song.videoId, song.title);
  }
</script>

{#if hasLoaded && songs.length > 0}
  <div class="popular-section">
    <h3 class="popular-title">Popular in this room</h3>
    <div class="popular-grid">
      {#each songs as song (song.videoId)}
        <button class="popular-item" onclick={() => handleClick(song)}>
          <div class="popular-thumb-wrapper">
            <img
              class="popular-thumb"
              src={getThumbnail(song.videoId)}
              alt=""
              loading="lazy"
            />
            <span class="play-count">{song.playCount}x</span>
          </div>
          <div class="popular-info">
            <div class="popular-song-title">{song.title}</div>
          </div>
        </button>
      {/each}
    </div>
  </div>
{:else if isLoading}
  <!-- Silent loading, no spinner needed -->
{/if}

<style>
  .popular-section {
    margin-top: 24px;
    margin-bottom: 16px;
  }

  .popular-title {
    font-size: 0.85rem;
    color: var(--text-muted);
    margin-bottom: 12px;
    font-weight: 500;
  }

  .popular-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
  }

  .popular-item {
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

  .popular-item:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.1);
    transform: translateY(-2px);
  }

  .popular-thumb-wrapper {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
  }

  .popular-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
    background: rgba(0, 0, 0, 0.3);
  }

  .play-count {
    position: absolute;
    bottom: 6px;
    right: 6px;
    background: rgba(78, 205, 196, 0.9);
    color: black;
    font-size: 0.7rem;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .popular-info {
    padding: 10px;
  }

  .popular-song-title {
    font-size: 0.8rem;
    font-weight: 500;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  @media (max-width: 480px) {
    .popular-grid {
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }

    .popular-info {
      padding: 8px;
    }

    .popular-song-title {
      font-size: 0.75rem;
    }
  }
</style>
