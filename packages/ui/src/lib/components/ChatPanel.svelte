<script lang="ts">
  import { tick } from 'svelte';
  import type { ChatMessage } from '@karaoke/types';
  import { vibrateTap } from '$lib/haptics';

  interface Props {
    enabled?: boolean;
    messages?: ChatMessage[];
    onSend?: (text: string) => void;
    onPin?: (messageId: string) => void;
  }

  let { enabled = true, messages = [], onSend, onPin }: Props = $props();

  let expanded = $state(false);
  let input = $state('');
  let listEl = $state<HTMLDivElement | null>(null);
  let rateLimitNotice = $state('');
  let sentTimestamps = $state<number[]>([]);

  $effect(() => {
    if (!expanded || !listEl) return;
    tick().then(() => {
      if (listEl) {
        listEl.scrollTop = listEl.scrollHeight;
      }
    });
  });

  function toggle() {
    expanded = !expanded;
    vibrateTap();
  }

  function handleSend() {
    if (!enabled) return;
    const text = input.trim().slice(0, 200);
    if (!text) return;

    const now = Date.now();
    sentTimestamps = sentTimestamps.filter((t) => now - t < 10000);
    if (sentTimestamps.length >= 5) {
      rateLimitNotice = 'Slow down a bit';
      setTimeout(() => {
        rateLimitNotice = '';
      }, 1200);
      return;
    }

    sentTimestamps = [...sentTimestamps, now];
    onSend?.(text);
    input = '';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  }
</script>

<div class="chat-panel" class:expanded={expanded} class:disabled={!enabled}>
  <button class="chat-header" onclick={toggle}>
    <span class="chat-title">Chat</span>
    <span class="chat-count">{messages.length}</span>
    <span class="chat-toggle">{expanded ? '▼' : '▲'}</span>
  </button>

  {#if expanded}
    <div class="chat-body">
      <div class="chat-messages" bind:this={listEl}>
        {#if messages.length === 0}
          <div class="chat-empty">No messages yet</div>
        {:else}
          {#each messages as message (message.id)}
            <div class="chat-message">
              <div class="chat-meta">
                <span class="chat-name">{message.displayName}</span>
                <button class="pin-btn" onclick={() => onPin?.(message.id)} title="Pin message">
                  Pin
                </button>
              </div>
              <div class="chat-text">{message.text}</div>
            </div>
          {/each}
        {/if}
      </div>

      <div class="chat-input-row">
        <input
          type="text"
          class="chat-input"
          placeholder={enabled ? 'Say something...' : 'Chat disabled'}
          bind:value={input}
          onkeydown={handleKeydown}
          disabled={!enabled}
        />
        <button class="chat-send" onclick={handleSend} disabled={!enabled || !input.trim()}>
          Send
        </button>
      </div>
      {#if rateLimitNotice}
        <div class="chat-rate-limit">{rateLimitNotice}</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .chat-panel {
    background: rgba(10, 10, 15, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    overflow: hidden;
    margin-bottom: 16px;
  }

  .chat-panel.disabled {
    opacity: 0.5;
  }

  .chat-header {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: none;
    color: var(--text);
    padding: 12px 16px;
    font-family: inherit;
    cursor: pointer;
  }

  .chat-title {
    font-weight: 600;
    font-size: 0.95rem;
  }

  .chat-count {
    font-size: 0.75rem;
    color: var(--text-muted);
    background: rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    padding: 2px 8px;
  }

  .chat-toggle {
    margin-left: auto;
    color: var(--text-muted);
  }

  .chat-body {
    padding: 12px 16px 16px;
  }

  .chat-messages {
    max-height: 150px;
    overflow-y: auto;
    padding-right: 4px;
    margin-bottom: 10px;
  }

  .chat-empty {
    font-size: 0.85rem;
    color: var(--text-muted);
    text-align: center;
    padding: 16px 0;
  }

  .chat-message {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    padding: 8px 10px;
    margin-bottom: 8px;
  }

  .chat-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .chat-name {
    font-size: 0.75rem;
    color: var(--cyan);
    font-weight: 600;
  }

  .pin-btn {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.8rem;
    cursor: pointer;
  }

  .pin-btn:hover {
    color: var(--cyan);
  }

  .chat-text {
    font-size: 0.9rem;
    color: var(--text);
    word-break: break-word;
  }

  .chat-input-row {
    display: flex;
    gap: 8px;
  }

  .chat-input {
    flex: 1;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 8px 12px;
    color: var(--text);
    font-size: 0.9rem;
    font-family: inherit;
  }

  .chat-input:focus {
    outline: none;
    border-color: var(--cyan);
  }

  .chat-send {
    background: var(--cyan);
    border: none;
    color: #0a0a0f;
    padding: 8px 12px;
    border-radius: 10px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }

  .chat-send:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .chat-rate-limit {
    margin-top: 6px;
    font-size: 0.75rem;
    color: var(--warning);
    text-align: center;
  }
</style>
