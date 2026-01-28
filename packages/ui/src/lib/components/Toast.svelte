<script lang="ts">
  import { toastStore } from '../stores/toast.svelte';
</script>

<div class="toast-container">
  {#each toastStore.toasts as toast (toast.id)}
    <div class="toast {toast.type}" role="alert">
      {toast.message}
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .toast {
    background: var(--bg-card);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 16px 24px;
    border-radius: 14px;
    font-size: 0.95rem;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    animation: slideUp 0.3s ease;
  }

  .toast.success {
    border-color: rgba(123, 237, 159, 0.3);
  }

  .toast.error {
    border-color: rgba(255, 107, 157, 0.3);
  }

  .toast.info {
    border-color: rgba(78, 205, 196, 0.3);
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
