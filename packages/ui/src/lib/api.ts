import type {
  QueueState,
  JoinResult,
  VoteResult,
  RemoveResult,
  SkipResult,
  ClaimResult,
  VerifyResult,
  SearchQueryResult,
  ReorderResult,
  PopularSongsResult,
  CreateRoomResult,
  CheckRoomResult,
  AdminVerifyResult,
  SetConfigResult,
  RoomConfig,
  RoomMode,
  SocialConfig,
  FeedbackRequest,
  FeedbackResult,
  GetSessionResult,
  AnonymousSessionResult,
  LogoutResult,
  GetMyStackResult,
  AddToStackResult,
  RemoveFromStackResult,
  ReorderStackResult,
  UserSession,
  User,
  StackedSong,
  Entry,
} from '@karaoke/types';

const API = '/api';

// Re-export result types for convenience
export type {
  JoinResult,
  VoteResult,
  RemoveResult,
  SkipResult,
  ClaimResult,
  VerifyResult,
  SearchQueryResult,
  ReorderResult,
  PopularSongsResult,
  CreateRoomResult,
  CheckRoomResult,
  AdminVerifyResult,
  SetConfigResult,
  RoomConfig,
  RoomMode,
  SocialConfig,
  FeedbackResult,
  GetSessionResult,
  AnonymousSessionResult,
  LogoutResult,
  GetMyStackResult,
  AddToStackResult,
  RemoveFromStackResult,
  ReorderStackResult,
  UserSession,
  User,
  StackedSong,
  Entry,
};

// =============================================================================
// Room ID Extraction
// =============================================================================

const RESERVED_PATHS = new Set(['player', 'admin', 'api', 'shikashika']);

/**
 * Extract room ID from the current URL path.
 * URL pattern: /{roomId}/... or /{roomId}
 * Returns 'default' for legacy routes without room ID.
 */
export function getRoomId(): string {
  if (typeof window === 'undefined') return 'default';

  const segments = window.location.pathname.split('/').filter(Boolean);
  if (segments.length > 0 && !RESERVED_PATHS.has(segments[0]!)) {
    return segments[0]!;
  }
  return 'default';
}

// =============================================================================
// Generic API Helper
// =============================================================================

type HasErrorKind = { kind: 'error'; message: string };

interface ApiOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  skipRoom?: boolean; // For endpoints that don't need room param
}

async function api<T extends HasErrorKind>(
  path: string,
  options: ApiOptions = {}
): Promise<T> {
  const { method = 'GET', headers = {}, body, skipRoom = false } = options;

  // Add room param to path
  let fullPath = `${API}${path}`;
  if (!skipRoom) {
    const roomId = getRoomId();
    const separator = path.includes('?') ? '&' : '?';
    fullPath = `${fullPath}${separator}room=${encodeURIComponent(roomId)}`;
  }

  try {
    const res = await fetch(fullPath, {
      method,
      headers: body ? { 'Content-Type': 'application/json', ...headers } : headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return await res.json() as T;
  } catch {
    return { kind: 'error', message: 'Network error' } as T;
  }
}

// =============================================================================
// Join Queue
// =============================================================================

export interface JoinParams {
  name: string;
  videoId: string;
  title: string;
  verified?: boolean;
}

export const join = (params: JoinParams): Promise<JoinResult> =>
  api('/join', { method: 'POST', body: params });

// =============================================================================
// Vote
// =============================================================================

export const vote = (entryId: string, direction: 1 | -1 | 0, voterId: string): Promise<VoteResult> =>
  api('/vote', {
    method: 'POST',
    headers: { 'X-Voter-Id': voterId },
    body: { entryId, direction },
  });

// =============================================================================
// Remove Entry
// =============================================================================

export const remove = (entryId: string, userName: string): Promise<RemoveResult> =>
  api('/remove', {
    method: 'POST',
    headers: { 'X-User-Name': userName },
    body: { entryId },
  });

// =============================================================================
// Skip (User's Own Song)
// =============================================================================

export const skip = (userName: string): Promise<SkipResult> =>
  api('/skip', { method: 'POST', headers: { 'X-User-Name': userName } });

// =============================================================================
// Search
// =============================================================================

export const search = (query: string): Promise<SearchQueryResult> =>
  api(`/search?q=${encodeURIComponent(query)}`);

// =============================================================================
// Get State (Fallback Polling)
// =============================================================================

export async function getState(): Promise<QueueState | null> {
  try {
    const roomId = getRoomId();
    const res = await fetch(`${API}/state?room=${encodeURIComponent(roomId)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// =============================================================================
// Identity - Claim Name with PIN
// =============================================================================

export const claimName = (name: string, pin: string): Promise<ClaimResult> =>
  api('/claim', { method: 'POST', body: { name, pin } });

// =============================================================================
// Identity - Verify PIN
// =============================================================================

export const verifyPin = (name: string, pin: string): Promise<VerifyResult> =>
  api('/verify', { method: 'POST', body: { name, pin } });

// =============================================================================
// Identity - Check if Name is Claimed
// =============================================================================

export async function checkIdentity(name: string): Promise<{ claimed: boolean }> {
  try {
    const res = await fetch(`${API}/identity/${encodeURIComponent(name)}`);
    const data = await res.json();
    return { claimed: data.claimed ?? false };
  } catch {
    return { claimed: false };
  }
}


// =============================================================================
// Popular Songs (Room History)
// =============================================================================

export const getPopularSongs = (limit = 10): Promise<PopularSongsResult> =>
  api(`/songs/popular?limit=${limit}`);

// =============================================================================
// Room Management
// =============================================================================

export const checkRoom = (roomId: string): Promise<CheckRoomResult> =>
  api('/room/check', { skipRoom: true, headers: {} }).then(async () => {
    // Need to call with specific room ID
    try {
      const res = await fetch(`${API}/room/check?room=${encodeURIComponent(roomId)}`);
      return await res.json() as CheckRoomResult;
    } catch {
      return { kind: 'error', message: 'Network error' } as CheckRoomResult;
    }
  });

export async function createRoom(
  roomId: string,
  pin: string,
  displayName?: string
): Promise<CreateRoomResult> {
  try {
    const res = await fetch(`${API}/room/create?room=${encodeURIComponent(roomId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, pin, displayName }),
    });
    return await res.json() as CreateRoomResult;
  } catch {
    return { kind: 'error', message: 'Network error' };
  }
}

export async function getRoomConfig(): Promise<RoomConfig | null> {
  try {
    const roomId = getRoomId();
    const res = await fetch(`${API}/room/config?room=${encodeURIComponent(roomId)}`);
    if (!res.ok) return null;
    return await res.json() as RoomConfig;
  } catch {
    return null;
  }
}

// =============================================================================
// Admin Authentication
// =============================================================================

export async function verifyAdminPin(pin: string): Promise<AdminVerifyResult> {
  const roomId = getRoomId();
  try {
    const res = await fetch(`${API}/admin/verify?room=${encodeURIComponent(roomId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    return await res.json() as AdminVerifyResult;
  } catch {
    return { kind: 'error', message: 'Network error' };
  }
}

/**
 * Get stored admin token from sessionStorage
 */
export function getAdminToken(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  const roomId = getRoomId();
  return sessionStorage.getItem(`karaoke_admin_token_${roomId}`);
}

/**
 * Store admin token in sessionStorage
 */
export function setAdminToken(token: string): void {
  if (typeof sessionStorage === 'undefined') return;
  const roomId = getRoomId();
  sessionStorage.setItem(`karaoke_admin_token_${roomId}`, token);
}

/**
 * Clear admin token from sessionStorage
 */
export function clearAdminToken(): void {
  if (typeof sessionStorage === 'undefined') return;
  const roomId = getRoomId();
  sessionStorage.removeItem(`karaoke_admin_token_${roomId}`);
}

/**
 * Get Authorization header for admin requests.
 * Uses Bearer token if available, falls back to X-Admin for legacy rooms.
 */
function getAdminAuthHeaders(): Record<string, string> {
  const token = getAdminToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  // Fallback for rooms without admin configured (legacy/default)
  return { 'X-Admin': 'true' };
}

// =============================================================================
// Admin Operations (Token Auth Required)
// =============================================================================

export const adminSkip = (): Promise<SkipResult> =>
  api('/skip', { method: 'POST', headers: getAdminAuthHeaders() });

export const adminRemove = (entryId: string): Promise<RemoveResult> =>
  api('/remove', {
    method: 'POST',
    headers: getAdminAuthHeaders(),
    body: { entryId },
  });

export const adminAdd = (params: JoinParams): Promise<JoinResult> =>
  api('/add', {
    method: 'POST',
    headers: getAdminAuthHeaders(),
    body: params,
  });

export const adminReorder = (entryId: string, newPosition: number): Promise<ReorderResult> =>
  api('/reorder', {
    method: 'POST',
    headers: getAdminAuthHeaders(),
    body: { entryId, newPosition },
  });

export const setRoomMode = (mode: RoomMode): Promise<SetConfigResult> =>
  api('/room/config', {
    method: 'POST',
    headers: getAdminAuthHeaders(),
    body: { mode },
  });

export const setRoomSocialConfig = (social: Partial<SocialConfig>): Promise<SetConfigResult> =>
  api('/room/config', {
    method: 'POST',
    headers: getAdminAuthHeaders(),
    body: { social },
  });

// =============================================================================
// Feedback
// =============================================================================

export async function submitFeedback(
  req: Omit<FeedbackRequest, 'page' | 'userAgent'>
): Promise<FeedbackResult> {
  const fullReq: FeedbackRequest = {
    ...req,
    page: window.location.pathname,
    userAgent: navigator.userAgent,
    roomId: getRoomId() !== 'default' ? getRoomId() : undefined,
  };
  return api('/feedback', { method: 'POST', body: fullReq, skipRoom: true });
}

// =============================================================================
// Authentication (Google OAuth + Anonymous)
// =============================================================================

/**
 * Redirect to Google OAuth login
 * @param returnUrl Where to redirect after login (defaults to current path)
 */
export function loginWithGoogle(returnUrl?: string): void {
  const roomId = getRoomId();
  const returnPath = returnUrl ?? window.location.pathname;
  const params = new URLSearchParams({
    room: roomId,
    return: returnPath,
  });
  window.location.href = `/auth/google?${params.toString()}`;
}

/**
 * Get current session from cookie
 */
export async function getSession(): Promise<GetSessionResult> {
  try {
    const res = await fetch('/auth/session', { credentials: 'include' });
    return await res.json() as GetSessionResult;
  } catch {
    return { kind: 'error', message: 'Network error' };
  }
}

/**
 * Create an anonymous session
 */
export async function createAnonymousSession(displayName?: string): Promise<AnonymousSessionResult> {
  const roomId = getRoomId();
  try {
    const res = await fetch('/auth/anonymous', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ roomId, displayName }),
    });
    return await res.json() as AnonymousSessionResult;
  } catch {
    return { kind: 'error', message: 'Network error' };
  }
}

/**
 * Logout (clear session)
 */
export async function logout(): Promise<LogoutResult> {
  try {
    const res = await fetch('/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
    return await res.json() as LogoutResult;
  } catch {
    return { kind: 'error', message: 'Network error' };
  }
}

// =============================================================================
// Stack Management (Jukebox Mode)
// =============================================================================

/**
 * Get my personal stack and current queue entry
 */
export async function getMyStack(): Promise<GetMyStackResult> {
  try {
    const roomId = getRoomId();
    const res = await fetch(`${API}/stack?room=${encodeURIComponent(roomId)}`, {
      credentials: 'include',
    });
    return await res.json() as GetMyStackResult;
  } catch {
    return { kind: 'error', message: 'Network error' };
  }
}

/**
 * Add a song (to queue if slot available, otherwise to personal stack)
 */
export async function addSong(videoId: string, title: string): Promise<AddToStackResult> {
  try {
    const roomId = getRoomId();
    const res = await fetch(`${API}/stack/add?room=${encodeURIComponent(roomId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ videoId, title }),
    });
    return await res.json() as AddToStackResult;
  } catch {
    return { kind: 'error', message: 'Network error' };
  }
}

/**
 * Remove a song from my personal stack
 */
export async function removeFromStack(songId: string): Promise<RemoveFromStackResult> {
  try {
    const roomId = getRoomId();
    const res = await fetch(`${API}/stack/remove?room=${encodeURIComponent(roomId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ songId }),
    });
    return await res.json() as RemoveFromStackResult;
  } catch {
    return { kind: 'error', message: 'Network error' };
  }
}

/**
 * Reorder my personal stack
 */
export async function reorderStack(songIds: string[]): Promise<ReorderStackResult> {
  try {
    const roomId = getRoomId();
    const res = await fetch(`${API}/stack/reorder?room=${encodeURIComponent(roomId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ songIds }),
    });
    return await res.json() as ReorderStackResult;
  } catch {
    return { kind: 'error', message: 'Network error' };
  }
}
