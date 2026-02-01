<script lang="ts">
  import type { ReactionEmoji } from '@karaoke/types';

  export interface ReactionItem {
    id: string;
    emoji: ReactionEmoji;
    displayName: string;
    lane: number;
  }

  interface Props {
    items?: ReactionItem[];
  }

  let { items = [] }: Props = $props();

  const emojiMap: Record<ReactionEmoji, string> = {
    fire: '\uD83D\uDD25',
    heart: '\u2764\uFE0F',
    clap: '\uD83D\uDC4F',
    laugh: '\uD83D\uDE02',
    boo: '\uD83D\uDE24',
  };

  const colorMap: Record<ReactionEmoji, string> = {
    fire: '#ff6b6b',
    heart: '#ff6b9d',
    clap: '#ffd166',
    laugh: '#4ecdc4',
    boo: '#a29bfe',
  };

  const laneMap = ['30%', '50%', '70%'];
</script>

<div class="reaction-overlay">
  {#each items as item (item.id)}
    <div
      class="reaction-float"
      style={`--lane-left:${laneMap[item.lane] ?? '50%'}; --glow-color:${colorMap[item.emoji]};`}
    >
      <div class="reaction-emoji">{emojiMap[item.emoji]}</div>
      <div class="reaction-name">{item.displayName}</div>
    </div>
  {/each}
</div>

<style>
  .reaction-overlay {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    top: 0;
    pointer-events: none;
    z-index: 45;
  }

  .reaction-float {
    position: absolute;
    bottom: 80px;
    left: var(--lane-left);
    transform: translateX(-50%);
    font-size: 2.5rem;
    animation: floatUp 3s ease-out forwards;
    text-shadow: 0 0 20px var(--glow-color);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .reaction-emoji {
    filter: drop-shadow(0 0 12px var(--glow-color));
  }

  .reaction-name {
    font-size: 0.7rem;
    opacity: 0;
    color: rgba(255, 255, 255, 0.9);
    animation: showName 1.5s ease-out;
    white-space: nowrap;
  }

  @keyframes floatUp {
    0% { opacity: 1; transform: translate(-50%, 0) scale(1); }
    100% { opacity: 0; transform: translate(-50%, -250px) scale(0.8); }
  }

  @keyframes showName {
    0%, 10% { opacity: 1; }
    100% { opacity: 0; }
  }
</style>
