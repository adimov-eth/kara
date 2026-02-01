<script lang="ts">
  import type { ReactionEmoji } from '@karaoke/types';
  import { vibrateTap } from '$lib/haptics';

  interface Props {
    enabled?: boolean;
    booEnabled?: boolean;
    onReact?: (emoji: ReactionEmoji) => void;
  }

  let { enabled = true, booEnabled = false, onReact }: Props = $props();

  const emojiOrder: ReactionEmoji[] = ['fire', 'heart', 'clap', 'laugh', 'boo'];
  const emojiMap: Record<ReactionEmoji, string> = {
    fire: '\uD83D\uDD25',
    heart: '\u2764\uFE0F',
    clap: '\uD83D\uDC4F',
    laugh: '\uD83D\uDE02',
    boo: '\uD83D\uDE24',
  };

  let cooldownEmoji = $state<ReactionEmoji | null>(null);
  let recentTaps = $state<number[]>([]);
  let rateLimitNotice = $state('');

  function handleReact(emoji: ReactionEmoji) {
    if (!enabled) return;
    if (emoji === 'boo' && !booEnabled) return;

    const now = Date.now();
    recentTaps = recentTaps.filter((t) => now - t < 5000);
    if (recentTaps.length >= 10) {
      rateLimitNotice = 'Easy there!';
      setTimeout(() => {
        rateLimitNotice = '';
      }, 800);
      return;
    }

    recentTaps = [...recentTaps, now];
    cooldownEmoji = emoji;
    setTimeout(() => {
      if (cooldownEmoji === emoji) cooldownEmoji = null;
    }, 300);

    vibrateTap();
    onReact?.(emoji);
  }
</script>

<div class="reaction-panel" class:disabled={!enabled}>
  <div class="reaction-row">
    {#each emojiOrder as emoji}
      {#if emoji !== 'boo' || booEnabled}
        <button
          class="reaction-btn"
          class:cooldown={cooldownEmoji === emoji}
          onclick={() => handleReact(emoji)}
          disabled={!enabled}
        >
          <span class="emoji">{emojiMap[emoji]}</span>
        </button>
      {/if}
    {/each}
  </div>
  {#if rateLimitNotice}
    <div class="rate-limit">{rateLimitNotice}</div>
  {/if}
</div>

<style>
  .reaction-panel {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 12px 16px 20px;
    background: rgba(10, 10, 15, 0.92);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(6px);
    z-index: 60;
  }

  .reaction-panel.disabled {
    opacity: 0.4;
  }

  .reaction-row {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }

  .reaction-btn {
    flex: 1;
    height: 48px;
    min-width: 48px;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    cursor: pointer;
    transition: transform 0.15s ease, opacity 0.15s ease, background 0.2s ease;
  }

  .reaction-btn:disabled {
    cursor: not-allowed;
  }

  .reaction-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.12);
    transform: translateY(-1px);
  }

  .reaction-btn.cooldown {
    opacity: 0.5;
    transform: scale(0.96);
  }

  .emoji {
    font-size: 1.6rem;
    filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.2));
  }

  .rate-limit {
    margin-top: 6px;
    font-size: 0.75rem;
    color: var(--warning);
    text-align: center;
  }

  @media (min-width: 720px) {
    .reaction-panel {
      position: sticky;
      bottom: auto;
      border-radius: 16px;
      margin-bottom: 12px;
    }
  }
</style>
