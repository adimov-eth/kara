<script lang="ts">
  import type { Entry } from '@karaoke/types';

  interface Props {
    entry: Entry;
    position: number;
    myVote?: -1 | 0 | 1;
    isMine?: boolean;
    readonly?: boolean;
    onVote?: (direction: -1 | 0 | 1) => void;
    onRemove?: () => void;
  }

  let {
    entry,
    position,
    myVote = 0,
    isMine = false,
    readonly = false,
    onVote,
    onRemove,
  }: Props = $props();

  function handleVote(direction: -1 | 0 | 1) {
    if (readonly || isMine || !onVote) return;
    // Toggle vote if clicking same direction
    const newDirection = myVote === direction ? 0 : direction;
    onVote(newDirection);
  }

  const voteClass = $derived(
    entry.votes > 0 ? 'positive' : entry.votes < 0 ? 'negative' : ''
  );
</script>

<li class="queue-item" class:is-mine={isMine}>
  <span class="position" class:is-mine={isMine}>{position}</span>
  <div class="queue-info">
    <div class="queue-song">{entry.title}</div>
    <div class="queue-singer">
      {entry.name}
      {#if isMine}<span class="you-badge">YOU</span>{/if}
    </div>
  </div>
  {#if !readonly}
    <div class="queue-actions">
      <button
        class="vote-btn upvote"
        class:active={myVote === 1}
        onclick={() => handleVote(1)}
        disabled={isMine}
        aria-label="Upvote"
      >+</button>
      <span class="vote-count {voteClass}">{entry.votes}</span>
      <button
        class="vote-btn downvote"
        class:active={myVote === -1}
        onclick={() => handleVote(-1)}
        disabled={isMine}
        aria-label="Downvote"
      >-</button>
      {#if isMine && onRemove}
        <button class="remove-btn" onclick={onRemove} aria-label="Remove">x</button>
      {/if}
    </div>
  {/if}
</li>

<style>
  .queue-item {
    display: flex;
    align-items: center;
    padding: 14px;
    border-radius: 14px;
    margin-bottom: 8px;
    background: rgba(255, 255, 255, 0.03);
    transition: all 0.2s ease;
    animation: slideIn 0.3s ease;
  }

  .queue-item.is-mine {
    background: linear-gradient(135deg, rgba(78, 205, 196, 0.15) 0%, rgba(78, 205, 196, 0.05) 100%);
    border: 1px solid rgba(78, 205, 196, 0.3);
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
    flex-shrink: 0;
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-muted);
  }

  .position.is-mine {
    background: var(--cyan);
    color: var(--bg);
  }

  .queue-info {
    flex: 1;
    min-width: 0;
  }

  .queue-song {
    font-weight: 500;
    font-size: 0.95rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 2px;
  }

  .queue-singer {
    font-size: 0.8rem;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .you-badge {
    background: var(--cyan);
    color: var(--bg);
    font-size: 0.6rem;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    letter-spacing: 0.05em;
  }

  .queue-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: 12px;
  }

  .vote-btn {
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
    font-size: 1rem;
    color: var(--text-muted);
  }

  .vote-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
  }

  .vote-btn.upvote {
    color: var(--success);
  }

  .vote-btn.downvote {
    color: var(--accent);
  }

  .vote-btn.active {
    background: rgba(255, 255, 255, 0.15);
  }

  .vote-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .vote-count {
    font-size: 0.85rem;
    min-width: 24px;
    text-align: center;
    color: var(--text-muted);
  }

  .vote-count.positive {
    color: var(--success);
  }

  .vote-count.negative {
    color: var(--accent);
  }

  .remove-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 8px;
    border-radius: 8px;
    transition: all 0.2s ease;
    font-size: 0.9rem;
  }

  .remove-btn:hover {
    background: rgba(255, 107, 157, 0.2);
    color: var(--accent);
  }
</style>
