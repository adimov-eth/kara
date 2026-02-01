<script lang="ts">
  import type { EnergyState } from '@karaoke/types';

  interface Props {
    energyState?: EnergyState | null;
  }

  let { energyState = null }: Props = $props();

  let pulse = $state(false);
  let lastLevel = $state(null as number | null);
  let pulseTimeout: ReturnType<typeof setTimeout> | null = null;

  const level = $derived(energyState?.level ?? 50);
  const trend = $derived(energyState?.trend ?? 'stable');
  const isLow = $derived(level <= 30);

  $effect(() => {
    if (lastLevel === null) {
      lastLevel = level;
      return;
    }
    if (level !== lastLevel) {
      pulse = true;
      if (pulseTimeout) clearTimeout(pulseTimeout);
      pulseTimeout = setTimeout(() => {
        pulse = false;
      }, 400);
      lastLevel = level;
    }
  });

  function getColor(current: number): string {
    if (current <= 30) return '#ff6b6b';
    if (current <= 60) return '#feca57';
    return '#1dd1a1';
  }

  function getLightColor(current: number): string {
    if (current <= 30) return '#ff9f9f';
    if (current <= 60) return '#ffe29a';
    return '#69e6c1';
  }

  function getGlow(current: number): string {
    if (current <= 30) return 'rgba(255, 107, 107, 0.7)';
    if (current <= 60) return 'rgba(254, 202, 87, 0.6)';
    return 'rgba(29, 209, 161, 0.7)';
  }

  const meterStyle = $derived(
    `--energy-color:${getColor(level)};` +
    `--energy-color-light:${getLightColor(level)};` +
    `--energy-glow:${getGlow(level)};`
  );
</script>

<div class="energy-meter" class:pulse={pulse} class:low={isLow} style={meterStyle}>
  <div class="energy-fill" style={`height: ${level}%;`}></div>
  <div class="energy-trend" data-trend={trend}></div>
</div>

<style>
  .energy-meter {
    position: absolute;
    right: 20px;
    bottom: 120px;
    width: 20px;
    height: 180px;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 10px;
    overflow: hidden;
    z-index: 40;
    transition: box-shadow 0.3s ease;
  }

  .energy-meter.low {
    box-shadow: 0 0 18px rgba(255, 107, 107, 0.6);
  }

  .energy-meter.pulse {
    animation: meterPulse 0.4s ease;
  }

  .energy-fill {
    position: absolute;
    bottom: 0;
    width: 100%;
    transition: height 0.5s ease-out;
    background: linear-gradient(to top, var(--energy-color), var(--energy-color-light));
    box-shadow: 0 0 15px var(--energy-glow);
  }

  .energy-trend {
    position: absolute;
    top: 6px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.6rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .energy-trend::after {
    content: '';
  }

  .energy-trend[data-trend="rising"]::after {
    content: '^';
  }

  .energy-trend[data-trend="falling"]::after {
    content: 'v';
  }

  .energy-trend[data-trend="stable"]::after {
    content: '.';
  }

  @keyframes meterPulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.05); }
    100% { transform: scale(1); }
  }
</style>
