<script lang="ts">
  let isOpen = $state(false);

  function toggle() {
    isOpen = !isOpen;
  }

  function close() {
    isOpen = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && isOpen) {
      close();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<button class="help-btn" onclick={toggle} aria-label="Help">
  ?
</button>

{#if isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" onclick={close} onkeydown={(e) => e.key === 'Escape' && close()} role="presentation">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal" onclick={(e) => e.stopPropagation()} onkeydown={() => {}} role="dialog" aria-modal="true" tabindex="-1">
      <button class="close-btn" onclick={close} aria-label="Close">×</button>

      <h2>How It Works</h2>

      <div class="steps">
        <div class="step">
          <span class="step-num">1</span>
          <div class="step-content">
            <strong>Enter your name</strong>
            <p>This is how you'll appear on the big screen</p>
          </div>
        </div>

        <div class="step">
          <span class="step-num">2</span>
          <div class="step-content">
            <strong>Search for a song</strong>
            <p>Find your karaoke jam (max 7 minutes)</p>
          </div>
        </div>

        <div class="step">
          <span class="step-num">3</span>
          <div class="step-content">
            <strong>Join the queue</strong>
            <p>You'll see your position and when you're up</p>
          </div>
        </div>
      </div>

      <div class="divider"></div>

      <h3>Fair Queue System</h3>
      <p class="info">
        First-timers and people who've been waiting longer get priority.
        After you sing, you move to the back — so everyone gets a turn!
      </p>

      <div class="divider"></div>

      <h3>Voting</h3>
      <p class="info">
        Upvote songs you want to hear sooner. Downvote to push them back.
        Votes only affect order within the same priority tier.
      </p>

      <div class="divider"></div>

      <h3>Claim Your Name</h3>
      <p class="info">
        After your first song, you can lock your name with a 6-digit PIN.
        This prevents others from using your stage name.
      </p>
    </div>
  </div>
{/if}

<style>
  .help-btn {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--accent) 0%, #ff8fab 100%);
    border: none;
    color: white;
    font-size: 1.5rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 20px var(--accent-glow);
    transition: all 0.2s ease;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .help-btn:hover {
    transform: scale(1.1);
    box-shadow: 0 6px 28px var(--accent-glow);
  }

  .help-btn:active {
    transform: scale(0.95);
  }

  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    padding: 20px;
    animation: fadeIn 0.2s ease;
  }

  .modal {
    background: var(--bg-card);
    border-radius: 24px;
    padding: 32px;
    max-width: 420px;
    width: 100%;
    max-height: 85vh;
    overflow-y: auto;
    position: relative;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    animation: slideUp 0.3s ease;
  }

  .close-btn {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: var(--text-muted);
    font-size: 1.5rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    line-height: 1;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    color: var(--text);
  }

  h2 {
    font-size: 1.5rem;
    font-weight: 700;
    margin-bottom: 24px;
    background: linear-gradient(135deg, var(--accent) 0%, var(--cyan) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  h3 {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 8px;
    color: var(--cyan);
  }

  .steps {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .step {
    display: flex;
    gap: 16px;
    align-items: flex-start;
  }

  .step-num {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--accent) 0%, #ff8fab 100%);
    color: white;
    font-weight: 700;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .step-content {
    flex: 1;
  }

  .step-content strong {
    display: block;
    margin-bottom: 2px;
  }

  .step-content p {
    color: var(--text-muted);
    font-size: 0.9rem;
    margin: 0;
  }

  .divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
    margin: 20px 0;
  }

  .info {
    color: var(--text-muted);
    font-size: 0.9rem;
    line-height: 1.5;
    margin: 0;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
