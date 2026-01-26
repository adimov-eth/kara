<script lang="ts">
  import type { Entry as EntryType } from '@karaoke/types';
  import Entry from './Entry.svelte';

  interface Props {
    entries: EntryType[];
    myName?: string;
    myVotes?: Record<string, number>;
    readonly?: boolean;
    onVote?: (entryId: string, direction: -1 | 0 | 1) => void;
    onRemove?: (entryId: string) => void;
  }

  let {
    entries,
    myName = '',
    myVotes = {},
    readonly = false,
    onVote,
    onRemove,
  }: Props = $props();

  function isMine(entry: EntryType): boolean {
    return entry.name.toLowerCase() === myName.toLowerCase();
  }

  function getMyVote(entryId: string): -1 | 0 | 1 {
    const vote = myVotes[entryId];
    if (vote === 1) return 1;
    if (vote === -1) return -1;
    return 0;
  }
</script>

<div class="queue-section">
  <div class="section-header">
    <span class="section-title">Up Next</span>
    <span class="queue-count">{entries.length} in queue</span>
  </div>

  {#if entries.length === 0}
    <div class="empty-state">
      <div class="empty-icon">*</div>
      <p>Queue is empty.<br>Be the first to add a song!</p>
    </div>
  {:else}
    <ul class="queue-list">
      {#each entries as entry, i (entry.id)}
        <Entry
          {entry}
          position={i + 1}
          myVote={getMyVote(entry.id)}
          isMine={isMine(entry)}
          {readonly}
          onVote={(dir) => onVote?.(entry.id, dir)}
          onRemove={() => onRemove?.(entry.id)}
        />
      {/each}
    </ul>
  {/if}
</div>

<style>
  .queue-section {
    background: var(--bg-card);
    border-radius: 20px;
    padding: 24px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .section-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text);
  }

  .queue-count {
    background: rgba(255, 255, 255, 0.1);
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .queue-list {
    list-style: none;
  }

  .empty-state {
    text-align: center;
    padding: 48px 24px;
    color: var(--text-muted);
  }

  .empty-icon {
    font-size: 3rem;
    margin-bottom: 16px;
    opacity: 0.5;
  }
</style>
