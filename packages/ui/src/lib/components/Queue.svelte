<script lang="ts">
  import type { Entry as EntryType } from "@karaoke/types";
  import { flip } from "svelte/animate";
  import { fly, fade } from "svelte/transition";
  import Entry from "./Entry.svelte";

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
    myName = "",
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
      <div class="empty-icon">🎤</div>
      <h3>The stage is silent...</h3>
      <p>Be the hero this party needs!</p>
      <div class="arrow">↓</div>
    </div>
  {:else}
    <ul class="queue-list">
      {#each entries as entry, i (entry.id)}
        <div
          animate:flip={{ duration: 300 }}
          in:fly={{ y: 20, duration: 300 }}
          out:fade
        >
          <Entry
            {entry}
            position={i + 1}
            myVote={getMyVote(entry.id)}
            isMine={isMine(entry)}
            {readonly}
            onVote={(dir) => onVote?.(entry.id, dir)}
            onRemove={() => onRemove?.(entry.id)}
          />
        </div>
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
    padding: 60px 24px;
    color: var(--text-muted);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .empty-icon {
    font-size: 4rem;
    margin-bottom: 8px;
    animation: bounce 2s infinite ease-in-out;
  }

  .empty-state h3 {
    font-size: 1.25rem;
    color: var(--text);
    margin: 0;
    font-weight: 700;
  }

  .empty-state p {
    margin: 0;
    font-size: 0.95rem;
    opacity: 0.8;
  }

  .arrow {
    font-size: 2rem;
    color: var(--accent);
    margin-top: 16px;
    animation: float 1.5s infinite ease-in-out;
  }

  @keyframes bounce {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.1);
    }
  }

  @keyframes float {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(10px);
    }
  }
</style>
