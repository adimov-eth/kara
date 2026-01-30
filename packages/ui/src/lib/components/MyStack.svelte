<script lang="ts">
  import {
    getMyStack,
    removeFromStack,
    reorderStack,
    type StackedSong,
    type Entry,
  } from '$lib/api';

  // Props
  interface Props {
    onStackChange?: (stack: StackedSong[], inQueue: Entry | null) => void;
  }
  let { onStackChange }: Props = $props();

  // State
  let stack = $state<StackedSong[]>([]);
  let inQueue = $state<Entry | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let draggingIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);

  // Load stack on mount
  $effect(() => {
    loadStack();
  });

  async function loadStack() {
    loading = true;
    error = null;
    const result = await getMyStack();

    if (result.kind === 'stack') {
      stack = result.songs;
      inQueue = result.inQueue;
      onStackChange?.(stack, inQueue);
    } else if (result.kind === 'unauthenticated') {
      stack = [];
      inQueue = null;
    } else {
      error = result.message;
    }
    loading = false;
  }

  async function handleRemove(songId: string) {
    const result = await removeFromStack(songId);
    if (result.kind === 'removed') {
      stack = stack.filter(s => s.id !== songId);
      onStackChange?.(stack, inQueue);
    }
  }

  // Drag and drop handlers
  function handleDragStart(index: number) {
    draggingIndex = index;
  }

  function handleDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    dragOverIndex = index;
  }

  function handleDragEnd() {
    if (draggingIndex !== null && dragOverIndex !== null && draggingIndex !== dragOverIndex) {
      const newStack = [...stack];
      const [dragged] = newStack.splice(draggingIndex, 1);
      newStack.splice(dragOverIndex, 0, dragged!);
      stack = newStack;

      // Save new order
      reorderStack(newStack.map(s => s.id)).then(result => {
        if (result.kind === 'reordered') {
          onStackChange?.(stack, inQueue);
        }
      });
    }
    draggingIndex = null;
    dragOverIndex = null;
  }

  function handleDragLeave() {
    dragOverIndex = null;
  }

  // External method to refresh
  export function refresh() {
    loadStack();
  }

  // External method to update from WebSocket
  export function updateStack(newStack: StackedSong[]) {
    stack = newStack;
    onStackChange?.(stack, inQueue);
  }

  export function updateInQueue(entry: Entry | null) {
    inQueue = entry;
    onStackChange?.(stack, inQueue);
  }
</script>

<div class="my-stack">
  <h3 class="section-title">
    My Queue
    {#if stack.length > 0}
      <span class="count">({stack.length})</span>
    {/if}
  </h3>

  {#if loading}
    <div class="loading">Loading...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else}
    {#if inQueue}
      <div class="in-queue-card">
        <div class="status-badge">In Queue</div>
        <div class="song-info">
          <span class="title">{inQueue.title}</span>
          <span class="votes">{inQueue.votes > 0 ? '+' : ''}{inQueue.votes} votes</span>
        </div>
      </div>
    {/if}

    {#if stack.length === 0}
      <div class="empty-state">
        {#if inQueue}
          <p>Add more songs - they'll play after your current one!</p>
        {:else}
          <p>Search and add songs to build your queue</p>
        {/if}
      </div>
    {:else}
      <div class="stack-list">
        {#each stack as song, index}
          <div
            class="stack-item"
            class:dragging={draggingIndex === index}
            class:drag-over={dragOverIndex === index}
            draggable="true"
            ondragstart={() => handleDragStart(index)}
            ondragover={(e) => handleDragOver(e, index)}
            ondragleave={handleDragLeave}
            ondragend={handleDragEnd}
            role="listitem"
          >
            <span class="drag-handle">⋮⋮</span>
            <div class="song-details">
              <span class="position">#{index + 1}</span>
              <span class="title">{song.title}</span>
            </div>
            <button
              class="remove-btn"
              onclick={() => handleRemove(song.id)}
              aria-label="Remove from stack"
            >
              ×
            </button>
          </div>
        {/each}
      </div>
      <p class="stack-hint">
        Drag to reorder. Your next song will join the main queue when your current song finishes.
      </p>
    {/if}
  {/if}
</div>

<style>
  .my-stack {
    background: var(--bg-card);
    border-radius: 16px;
    padding: 20px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .section-title {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 16px 0;
    color: var(--cyan);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .count {
    font-size: 0.85rem;
    color: var(--text-muted);
    font-weight: 400;
  }

  .loading, .error, .empty-state {
    text-align: center;
    padding: 24px;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .error {
    color: #ff6b6b;
  }

  .empty-state p {
    margin: 0;
    line-height: 1.5;
  }

  .in-queue-card {
    background: linear-gradient(135deg, rgba(0, 245, 212, 0.1) 0%, rgba(255, 107, 157, 0.1) 100%);
    border: 1px solid var(--cyan);
    border-radius: 12px;
    padding: 14px;
    margin-bottom: 16px;
  }

  .status-badge {
    display: inline-block;
    padding: 2px 10px;
    background: var(--cyan);
    color: var(--bg);
    border-radius: 20px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
  }

  .song-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .song-info .title {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .votes {
    color: var(--accent);
    font-size: 0.85rem;
    flex-shrink: 0;
  }

  .stack-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .stack-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    cursor: grab;
    transition: all 0.15s ease;
  }

  .stack-item:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.1);
  }

  .stack-item.dragging {
    opacity: 0.5;
    cursor: grabbing;
  }

  .stack-item.drag-over {
    border-color: var(--cyan);
    background: rgba(0, 245, 212, 0.05);
  }

  .drag-handle {
    color: var(--text-muted);
    font-size: 0.8rem;
    user-select: none;
    cursor: grab;
  }

  .song-details {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    overflow: hidden;
  }

  .position {
    color: var(--text-muted);
    font-size: 0.8rem;
    flex-shrink: 0;
    width: 24px;
  }

  .song-details .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.9rem;
  }

  .remove-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: var(--text-muted);
    font-size: 1.2rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
    flex-shrink: 0;
    line-height: 1;
  }

  .remove-btn:hover {
    background: rgba(255, 107, 107, 0.2);
    border-color: #ff6b6b;
    color: #ff6b6b;
  }

  .stack-hint {
    margin: 12px 0 0 0;
    font-size: 0.8rem;
    color: var(--text-muted);
    text-align: center;
    line-height: 1.4;
  }
</style>
