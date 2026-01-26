<script lang="ts">
  import type { Entry } from '@karaoke/types';

  interface Props {
    entry: Entry;
    canSkip?: boolean;
    onSkip?: () => void;
  }

  let { entry, canSkip = false, onSkip }: Props = $props();
</script>

<div class="now-playing-card">
  <div class="now-playing-label">Now Playing</div>
  <div class="now-playing-title">{entry.title}</div>
  <div class="now-playing-singer">{entry.name}</div>
  {#if canSkip && onSkip}
    <button class="skip-own-btn" onclick={onSkip}>Skip My Song</button>
  {/if}
</div>

<style>
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
</style>
