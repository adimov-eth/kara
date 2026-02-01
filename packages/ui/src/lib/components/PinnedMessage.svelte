<script lang="ts">
  import type { ChatMessage } from '@karaoke/types';

  interface Props {
    message?: ChatMessage | null;
  }

  let { message = null }: Props = $props();

  const DISPLAY_MS = 8000;
  let visible = $state(false);
  let activeMessage = $state<ChatMessage | null>(null);
  let hideTimeout: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (!message) {
      visible = false;
      activeMessage = null;
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
      return;
    }

    activeMessage = message;
    visible = true;
    if (hideTimeout) clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      visible = false;
    }, DISPLAY_MS);
  });
</script>

{#if activeMessage && visible}
  {#key activeMessage.id}
    <div class="pinned-message">
      <div class="pinned-header">Pinned</div>
      <div class="pinned-content">
        <span class="pinned-name">{activeMessage.displayName}</span>
        <span class="pinned-text">{activeMessage.text}</span>
      </div>
      <div class="pinned-timer"></div>
    </div>
  {/key}
{/if}

<style>
  .pinned-message {
    position: absolute;
    bottom: 120px;
    left: 30px;
    max-width: 360px;
    background: rgba(0, 0, 0, 0.85);
    border-left: 3px solid var(--cyan);
    padding: 10px 14px 14px;
    border-radius: 0 8px 8px 0;
    animation: slideIn 0.3s ease-out, fadeOut 0.4s ease-out 7.6s forwards;
    z-index: 42;
  }

  .pinned-header {
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: var(--cyan);
    margin-bottom: 6px;
  }

  .pinned-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .pinned-name {
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.8);
    font-weight: 600;
  }

  .pinned-text {
    font-size: 0.95rem;
    color: var(--text);
    word-break: break-word;
  }

  .pinned-timer {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 2px;
    background: var(--cyan);
    animation: shrink 8s linear forwards;
  }

  @keyframes slideIn {
    from { transform: translateX(-12px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }

  @keyframes fadeOut {
    to { opacity: 0; }
  }

  @keyframes shrink {
    from { width: 100%; }
    to { width: 0%; }
  }
</style>
