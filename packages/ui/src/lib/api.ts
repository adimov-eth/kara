import type { Entry, QueueState, SearchResult } from '@karaoke/types';

const API = '/api';

// Join queue
export interface JoinParams {
  name: string;
  videoId: string;
  title: string;
  verified?: boolean;
}

export interface JoinResult {
  success: boolean;
  entry?: Entry;
  position?: number;
  error?: string;
  requiresPin?: boolean;
}

export async function join(params: JoinParams): Promise<JoinResult> {
  const res = await fetch(`${API}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await res.json();

  if (data.requiresPin) {
    return { success: false, requiresPin: true };
  }

  if (!res.ok) {
    return { success: false, error: data.error || 'Failed to join queue' };
  }

  return { success: true, entry: data.entry, position: data.position };
}

// Vote
export interface VoteResult {
  success: boolean;
  newVotes?: number;
  error?: string;
}

export async function vote(
  entryId: string,
  direction: 1 | -1 | 0,
  voterId: string
): Promise<VoteResult> {
  const res = await fetch(`${API}/vote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Voter-Id': voterId,
    },
    body: JSON.stringify({ entryId, direction }),
  });

  const data = await res.json();

  if (!res.ok) {
    return { success: false, error: data.error || 'Failed to vote' };
  }

  return { success: true, newVotes: data.newVotes };
}

// Remove entry
export interface RemoveResult {
  success: boolean;
  error?: string;
}

export async function remove(entryId: string, userName: string): Promise<RemoveResult> {
  const res = await fetch(`${API}/remove`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Name': userName,
    },
    body: JSON.stringify({ entryId }),
  });

  const data = await res.json();

  if (!res.ok) {
    return { success: false, error: data.error || 'Failed to remove' };
  }

  return { success: true };
}

// Skip (user's own song)
export async function skip(userName: string): Promise<RemoveResult> {
  const res = await fetch(`${API}/skip`, {
    method: 'POST',
    headers: { 'X-User-Name': userName },
  });

  const data = await res.json();

  if (!res.ok) {
    return { success: false, error: data.error || 'Failed to skip' };
  }

  return { success: true };
}

// Search
export interface SearchResponse {
  results: SearchResult[];
  error?: string;
}

export async function search(query: string): Promise<SearchResponse> {
  const res = await fetch(`${API}/search?q=${encodeURIComponent(query)}`);
  const data = await res.json();

  if (!res.ok) {
    return { results: [], error: data.error || 'Search failed' };
  }

  return { results: data.results || [] };
}

// Get state (fallback polling)
export async function getState(): Promise<QueueState | null> {
  try {
    const res = await fetch(`${API}/state`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Identity - claim name with PIN
export interface ClaimResult {
  success: boolean;
  error?: string;
}

export async function claimName(name: string, pin: string): Promise<ClaimResult> {
  const res = await fetch(`${API}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, pin }),
  });

  const data = await res.json();

  if (!res.ok) {
    return { success: false, error: data.error || 'Failed to claim name' };
  }

  return { success: true };
}

// Identity - verify PIN
export async function verifyPin(name: string, pin: string): Promise<ClaimResult> {
  const res = await fetch(`${API}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, pin }),
  });

  const data = await res.json();

  if (!res.ok) {
    return { success: false, error: data.error || 'Invalid PIN' };
  }

  return { success: true };
}

// Identity - check if name is claimed
export async function checkIdentity(name: string): Promise<{ claimed: boolean }> {
  const res = await fetch(`${API}/identity/${encodeURIComponent(name)}`);
  const data = await res.json();
  return { claimed: data.claimed ?? false };
}

// Admin - skip any song
export async function adminSkip(): Promise<RemoveResult> {
  const res = await fetch(`${API}/skip`, {
    method: 'POST',
    headers: { 'X-Admin': 'true' },
  });

  const data = await res.json();

  if (!res.ok) {
    return { success: false, error: data.error || 'Failed to skip' };
  }

  return { success: true };
}

// Admin - remove any entry
export async function adminRemove(entryId: string): Promise<RemoveResult> {
  const res = await fetch(`${API}/remove`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin': 'true',
    },
    body: JSON.stringify({ entryId }),
  });

  const data = await res.json();

  if (!res.ok) {
    return { success: false, error: data.error || 'Failed to remove' };
  }

  return { success: true };
}

// Admin - add entry to front
export async function adminAdd(params: JoinParams): Promise<JoinResult> {
  const res = await fetch(`${API}/add`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin': 'true',
    },
    body: JSON.stringify(params),
  });

  const data = await res.json();

  if (!res.ok) {
    return { success: false, error: data.error || 'Failed to add' };
  }

  return { success: true, entry: data.entry };
}

// Admin - reorder
export async function adminReorder(
  entryId: string,
  newPosition: number
): Promise<RemoveResult> {
  const res = await fetch(`${API}/reorder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin': 'true',
    },
    body: JSON.stringify({ entryId, newPosition }),
  });

  const data = await res.json();

  if (!res.ok) {
    return { success: false, error: data.error || 'Failed to reorder' };
  }

  return { success: true };
}
