export const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export function vibrateSuccess() {
  if (canVibrate) navigator.vibrate([50, 30, 50]);
}

export function vibrateTap() {
  if (canVibrate) navigator.vibrate(10);
}

export function vibrateError() {
  if (canVibrate) navigator.vibrate([100, 50, 100]);
}
