<script lang="ts">
  import { claimName, verifyPin as verifyPinApi } from '../api';

  type Mode = 'claim' | 'verify' | 'closed';

  interface Props {
    mode?: Mode;
    name?: string;
    onSuccess?: () => void;
    onClose?: () => void;
    onChangeName?: () => void;
  }

  let {
    mode = 'closed',
    name = '',
    onSuccess,
    onClose,
    onChangeName,
  }: Props = $props();

  let pin = $state('');
  let error = $state('');
  let isSubmitting = $state(false);

  $effect(() => {
    // Reset state when mode changes
    pin = '';
    error = '';
  });

  function handlePinInput(e: Event) {
    const target = e.target as HTMLInputElement;
    // Only allow digits
    pin = target.value.replace(/\D/g, '').slice(0, 6);
  }

  async function handleClaim() {
    if (!/^\d{6}$/.test(pin)) {
      error = 'PIN must be 6 digits';
      return;
    }

    isSubmitting = true;
    error = '';

    const result = await claimName(name, pin);

    isSubmitting = false;

    switch (result.kind) {
      case 'claimed':
        onSuccess?.();
        break;
      case 'alreadyClaimed':
        error = 'This name is already claimed';
        break;
      case 'invalidPin':
        error = result.reason;
        break;
      case 'error':
        error = result.message;
        break;
    }
  }

  async function handleVerify() {
    if (!/^\d{6}$/.test(pin)) {
      error = 'PIN must be 6 digits';
      return;
    }

    isSubmitting = true;
    error = '';

    const result = await verifyPinApi(name, pin);

    isSubmitting = false;

    switch (result.kind) {
      case 'verified':
        onSuccess?.();
        break;
      case 'nameNotFound':
        error = 'Name not found';
        break;
      case 'invalidPin':
        error = 'Invalid PIN';
        break;
      case 'error':
        error = result.message;
        break;
    }
  }
</script>

{#if mode !== 'closed'}
  <div class="modal-overlay">
    <div class="modal">
      {#if mode === 'claim'}
        <h2>You made karaoke history!</h2>
        <p>Your performance is saved. Set a PIN to:</p>
        <ul>
          <li>Keep <span class="highlight">"{name}"</span> as your stage name</li>
          <li>Build your songbook across devices</li>
          <li>See your stats and history anytime</li>
        </ul>
        <p>Pick a 6-digit PIN you'll remember:</p>
        <input
          type="text"
          class="modal-input"
          inputmode="numeric"
          pattern="[0-9]*"
          maxlength="6"
          placeholder="------"
          autocomplete="off"
          value={pin}
          oninput={handlePinInput}
        />
        <button class="btn" onclick={handleClaim} disabled={isSubmitting}>
          Lock in my name
        </button>
        {#if error}
          <div class="modal-error">{error}</div>
        {/if}
        <p class="small">
          Skip for now? Anyone can use this name until you claim it.
        </p>
        <button class="skip-link" onclick={onClose}>I'll set it up later</button>
      {:else if mode === 'verify'}
        <h2>Welcome back!</h2>
        <p><span class="highlight">"{name}"</span> has a PIN. Enter it to continue.</p>
        <input
          type="text"
          class="modal-input"
          inputmode="numeric"
          pattern="[0-9]*"
          maxlength="6"
          placeholder="------"
          autocomplete="off"
          value={pin}
          oninput={handlePinInput}
        />
        <button class="btn" onclick={handleVerify} disabled={isSubmitting}>
          Continue
        </button>
        {#if error}
          <div class="modal-error">{error}</div>
        {/if}
        <p class="hint">Not you? <button class="link-btn" onclick={onChangeName}>Use different name</button></p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    padding: 16px;
  }

  .modal {
    background: var(--bg-card);
    border-radius: 24px;
    padding: 32px;
    max-width: 400px;
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 16px 64px rgba(0, 0, 0, 0.5);
    animation: modalIn 0.3s ease;
  }

  .modal h2 {
    font-size: 1.5rem;
    font-weight: 700;
    margin-bottom: 16px;
    text-align: center;
  }

  .modal p {
    color: var(--text-muted);
    margin-bottom: 12px;
    line-height: 1.5;
  }

  .modal ul {
    color: var(--text-muted);
    margin: 0 0 16px 20px;
    line-height: 1.6;
  }

  .modal ul li {
    margin-bottom: 4px;
  }

  .highlight {
    color: var(--cyan);
    font-weight: 500;
  }

  .modal-input {
    width: 100%;
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    padding: 16px 20px;
    font-size: 1.5rem;
    font-family: inherit;
    color: var(--text);
    outline: none;
    text-align: center;
    letter-spacing: 0.5em;
    margin-bottom: 16px;
  }

  .modal-input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 4px var(--accent-glow);
  }

  .modal-input::placeholder {
    color: var(--text-muted);
    letter-spacing: normal;
  }

  .modal .btn {
    margin-bottom: 12px;
  }

  .small {
    font-size: 0.85rem;
    color: var(--text-muted);
    text-align: center;
  }

  .skip-link {
    display: block;
    width: 100%;
    text-align: center;
    color: var(--text-muted);
    background: none;
    border: none;
    font-size: 0.9rem;
    font-family: inherit;
    cursor: pointer;
    padding: 8px;
  }

  .skip-link:hover {
    color: var(--text);
  }

  .hint {
    font-size: 0.85rem;
    color: var(--text-muted);
    text-align: center;
    margin-top: 12px;
  }

  .link-btn {
    color: var(--cyan);
    background: none;
    border: none;
    font-family: inherit;
    font-size: inherit;
    cursor: pointer;
    text-decoration: none;
    padding: 0;
  }

  .link-btn:hover {
    text-decoration: underline;
  }

  .modal-error {
    color: var(--warning);
    font-size: 0.9rem;
    text-align: center;
    margin-top: 8px;
    margin-bottom: 8px;
  }
</style>
