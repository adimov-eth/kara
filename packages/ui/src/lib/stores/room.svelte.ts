import type { Entry, QueueState } from '@karaoke/types';

// Reactive state using Svelte 5 runes
let room = $state<QueueState>({
  queue: [],
  nowPlaying: null,
  currentEpoch: 0
});

let extensionConnected = $state(false);

// Identity state
let myName = $state(
  typeof localStorage !== 'undefined' ? localStorage.getItem('karaoke_name') ?? '' : ''
);

let voterId = $state(
  typeof localStorage !== 'undefined'
    ? localStorage.getItem('karaoke_voter_id') ?? crypto.randomUUID()
    : crypto.randomUUID()
);

let myVotes = $state<Record<string, number>>(
  typeof localStorage !== 'undefined'
    ? JSON.parse(localStorage.getItem('karaoke_votes') ?? '{}')
    : {}
);

let verifiedNames = $state<Record<string, boolean>>(
  typeof localStorage !== 'undefined'
    ? JSON.parse(localStorage.getItem('karaoke_verified') ?? '{}')
    : {}
);

// Note: localStorage persistence is handled by the routes themselves
// $effect cannot be used at module level in Svelte 5

// Derived values
function getMyEntry(): Entry | undefined {
  return room.queue.find(e => e.name.toLowerCase() === myName.toLowerCase());
}

function getIsMyTurn(): boolean {
  return room.nowPlaying?.name.toLowerCase() === myName.toLowerCase();
}

function getIsInQueue(): boolean {
  return room.queue.some(e => e.name.toLowerCase() === myName.toLowerCase());
}

function getMyVote(entryId: string): number {
  return myVotes[entryId] ?? 0;
}

function getIsNameVerified(name: string): boolean {
  return verifiedNames[name.toLowerCase()] === true;
}

// Actions
function setRoom(newRoom: QueueState) {
  room = newRoom;
}

function setExtensionConnected(connected: boolean) {
  extensionConnected = connected;
}

function setMyName(name: string) {
  myName = name;
}

function setMyVote(entryId: string, direction: number) {
  if (direction === 0) {
    const { [entryId]: _, ...rest } = myVotes;
    myVotes = rest;
  } else {
    myVotes = { ...myVotes, [entryId]: direction };
  }
}

function setNameVerified(name: string, verified: boolean) {
  verifiedNames = { ...verifiedNames, [name.toLowerCase()]: verified };
}

// Export everything
export const roomStore = {
  get room() { return room; },
  get extensionConnected() { return extensionConnected; },
  get myName() { return myName; },
  get voterId() { return voterId; },
  get myVotes() { return myVotes; },
  get verifiedNames() { return verifiedNames; },

  // Derived
  get myEntry() { return getMyEntry(); },
  get isMyTurn() { return getIsMyTurn(); },
  get isInQueue() { return getIsInQueue(); },
  getMyVote,
  getIsNameVerified,

  // Actions
  setRoom,
  setExtensionConnected,
  setMyName,
  setMyVote,
  setNameVerified,
};
