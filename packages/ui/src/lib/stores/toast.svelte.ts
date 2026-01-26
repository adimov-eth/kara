// Toast notification store using Svelte 5 runes

interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
  id: number;
}

let toasts = $state<Toast[]>([]);
let nextId = 0;

function show(message: string, type: 'success' | 'error' | 'info' = 'info', duration = 3000) {
  const id = nextId++;
  toasts = [...toasts, { message, type, id }];

  setTimeout(() => {
    toasts = toasts.filter(t => t.id !== id);
  }, duration);
}

function success(message: string, duration = 3000) {
  show(message, 'success', duration);
}

function error(message: string, duration = 3000) {
  show(message, 'error', duration);
}

function dismiss(id: number) {
  toasts = toasts.filter(t => t.id !== id);
}

export const toastStore = {
  get toasts() { return toasts; },
  show,
  success,
  error,
  dismiss,
};
