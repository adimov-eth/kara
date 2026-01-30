<script lang="ts">
  import type { FeedbackCategory } from '@karaoke/types';
  import { submitFeedback } from '$lib/api';
  import { toastStore } from '$lib/stores/toast.svelte';
  import { vibrateSuccess, vibrateError } from '$lib/haptics';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen, onClose }: Props = $props();

  let feedback = $state('');
  let title = $state('');
  let category = $state<FeedbackCategory>('suggestion');
  let isSubmitting = $state(false);
  let error = $state('');

  const categories: Array<{ value: FeedbackCategory; label: string; icon: string }> = [
    { value: 'bug', label: 'Bug', icon: 'X' },
    { value: 'suggestion', label: 'Suggestion', icon: '+' },
    { value: 'question', label: 'Question', icon: '?' },
    { value: 'other', label: 'Other', icon: '#' },
  ];

  function resetForm() {
    feedback = '';
    title = '';
    category = 'suggestion';
    error = '';
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSubmit() {
    if (!feedback.trim()) return;

    isSubmitting = true;
    error = '';

    const result = await submitFeedback({
      feedback: feedback.trim(),
      title: title.trim() || undefined,
      category,
    });

    isSubmitting = false;

    if (result.kind === 'created') {
      vibrateSuccess();
      toastStore.success(`Thanks! Created issue #${result.issueNumber}`);
      handleClose();
    } else if (result.kind === 'rateLimited') {
      vibrateError();
      error = 'Too many submissions. Please wait a minute.';
    } else {
      vibrateError();
      error = result.message;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') handleClose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" onclick={handleClose} role="presentation">
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events a11y_interactive_supports_focus -->
    <div class="modal" onclick={(e) => e.stopPropagation()} onkeydown={() => {}} role="dialog" aria-modal="true" tabindex="-1">
      <button class="close-btn" onclick={handleClose} aria-label="Close">x</button>

      <h2>Send Feedback</h2>

      <div class="category-row">
        {#each categories as cat}
          <button
            class="category-btn"
            class:selected={category === cat.value}
            onclick={() => (category = cat.value)}
          >
            <span class="cat-icon">{cat.icon}</span>
            <span class="cat-label">{cat.label}</span>
          </button>
        {/each}
      </div>

      <textarea
        bind:value={feedback}
        placeholder="What's on your mind?"
        maxlength="2000"
        rows="5"
      ></textarea>

      <input
        type="text"
        bind:value={title}
        placeholder="Brief title (optional)"
        maxlength="100"
      />

      {#if error}
        <div class="error-msg">{error}</div>
      {/if}

      <button
        class="btn"
        onclick={handleSubmit}
        disabled={!feedback.trim() || isSubmitting}
      >
        {isSubmitting ? 'Sending...' : 'Send Feedback'}
      </button>
    </div>
  </div>
{/if}

<style>
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
    max-width: 480px;
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
    margin-bottom: 20px;
    background: linear-gradient(135deg, var(--accent) 0%, var(--cyan) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .category-row {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .category-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid transparent;
    border-radius: 20px;
    color: var(--text-muted);
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .category-btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .category-btn.selected {
    border-color: var(--cyan);
    color: var(--text);
    background: rgba(0, 212, 255, 0.1);
  }

  .cat-icon {
    font-size: 1rem;
    font-weight: bold;
  }

  textarea {
    width: 100%;
    min-height: 120px;
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    padding: 14px 18px;
    font-size: 1rem;
    font-family: inherit;
    color: var(--text);
    resize: vertical;
    outline: none;
    margin-bottom: 12px;
  }

  textarea:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 4px var(--accent-glow);
  }

  input[type="text"] {
    width: 100%;
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    padding: 14px 18px;
    font-size: 1rem;
    font-family: inherit;
    color: var(--text);
    outline: none;
    margin-bottom: 16px;
  }

  input[type="text"]:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 4px var(--accent-glow);
  }

  input::placeholder,
  textarea::placeholder {
    color: var(--text-muted);
  }

  .error-msg {
    color: var(--warning);
    font-size: 0.9rem;
    text-align: center;
    margin-bottom: 12px;
  }

  .btn {
    width: 100%;
    padding: 14px 20px;
    border-radius: 14px;
    font-size: 1rem;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.2s ease;
    background: linear-gradient(135deg, var(--accent) 0%, #ff8fab 100%);
    border: none;
    color: white;
  }

  .btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 20px var(--accent-glow);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
