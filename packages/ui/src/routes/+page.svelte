<script lang="ts">
  import { goto } from '$app/navigation';
  import { toastStore } from '$lib/stores/toast.svelte';

  // State
  let roomCode = $state('');
  let step = $state<'enter' | 'notFound' | 'createPin'>('enter');
  let pin = $state('');
  let pinConfirm = $state('');
  let displayName = $state('');
  let isLoading = $state(false);
  let errorMsg = $state('');

  // Recently visited rooms from localStorage
  let recentRooms = $state<string[]>([]);

  $effect(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('karaoke_recent_rooms');
      if (stored) {
        try {
          recentRooms = JSON.parse(stored);
        } catch {
          recentRooms = [];
        }
      }
    }
  });

  function saveRecentRoom(roomId: string) {
    if (typeof localStorage === 'undefined') return;
    const rooms = recentRooms.filter(r => r !== roomId);
    rooms.unshift(roomId);
    const trimmed = rooms.slice(0, 5); // Keep last 5
    localStorage.setItem('karaoke_recent_rooms', JSON.stringify(trimmed));
    recentRooms = trimmed;
  }

  function normalizeRoomCode(code: string): string {
    return code.toLowerCase().trim().replace(/\s+/g, '-');
  }

  function isValidRoomId(id: string): boolean {
    return /^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$|^[a-z0-9]{1,2}$/.test(id);
  }

  async function handleGo() {
    const normalized = normalizeRoomCode(roomCode);
    if (!normalized) {
      errorMsg = 'Enter a room code';
      return;
    }

    if (!isValidRoomId(normalized)) {
      errorMsg = 'Room code must be 2-30 characters (letters, numbers, hyphens)';
      return;
    }

    const reserved = new Set(['api', 'player', 'admin', 'shikashika', 'landing']);
    if (reserved.has(normalized)) {
      errorMsg = `"${normalized}" is reserved`;
      return;
    }

    isLoading = true;
    errorMsg = '';

    try {
      const res = await fetch(`/api/room/check?room=${encodeURIComponent(normalized)}`);
      const result = await res.json();

      if (result.kind === 'exists') {
        saveRecentRoom(normalized);
        goto(`/${normalized}`);
      } else {
        roomCode = normalized;
        step = 'notFound';
      }
    } catch {
      errorMsg = 'Could not check room. Try again.';
    } finally {
      isLoading = false;
    }
  }

  function handleCreateClick() {
    step = 'createPin';
    displayName = roomCode.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  async function handleCreate() {
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      errorMsg = 'PIN must be 6 digits';
      return;
    }
    if (pin !== pinConfirm) {
      errorMsg = 'PINs do not match';
      return;
    }

    isLoading = true;
    errorMsg = '';

    try {
      const res = await fetch(`/api/room/create?room=${encodeURIComponent(roomCode)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: roomCode,
          pin,
          displayName: displayName.trim() || roomCode,
        }),
      });
      const result = await res.json();

      if (result.kind === 'created') {
        saveRecentRoom(roomCode);
        // Store admin token
        if (typeof sessionStorage !== 'undefined') {
          // After creation, auto-login with the PIN
          const verifyRes = await fetch(`/api/admin/verify?room=${encodeURIComponent(roomCode)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin }),
          });
          const verifyResult = await verifyRes.json();
          if (verifyResult.kind === 'verified') {
            sessionStorage.setItem(`karaoke_admin_token_${roomCode}`, verifyResult.token);
          }
        }
        toastStore.success('Room created!');
        goto(`/${roomCode}/admin`);
      } else if (result.kind === 'alreadyExists') {
        errorMsg = 'Room already exists';
        step = 'enter';
      } else if (result.kind === 'invalidRoomId') {
        errorMsg = result.reason;
      } else if (result.kind === 'invalidPin') {
        errorMsg = result.reason;
      } else {
        errorMsg = result.message || 'Failed to create room';
      }
    } catch {
      errorMsg = 'Could not create room. Try again.';
    } finally {
      isLoading = false;
    }
  }

  function handleBack() {
    step = 'enter';
    pin = '';
    pinConfirm = '';
    errorMsg = '';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !isLoading) {
      if (step === 'enter') handleGo();
      else if (step === 'createPin') handleCreate();
    }
  }

  function goToRecent(roomId: string) {
    goto(`/${roomId}`);
  }
</script>

<svelte:head>
  <title>Karaoke - Join a Room</title>
</svelte:head>

<div class="container landing">
  <header>
    <h1>Karaoke</h1>
    <p class="subtitle">Pick a room, pick a song, sing your heart out</p>
  </header>

  <div class="card">
    {#if step === 'enter'}
      <div class="input-group">
        <label class="input-label" for="roomCode">Room code</label>
        <input
          type="text"
          id="roomCode"
          placeholder="e.g. bobs-party"
          maxlength="30"
          autocomplete="off"
          autocapitalize="off"
          bind:value={roomCode}
          onkeydown={handleKeydown}
          disabled={isLoading}
        />
      </div>

      <button class="btn" onclick={handleGo} disabled={isLoading || !roomCode.trim()}>
        {isLoading ? 'Checking...' : 'Go'}
      </button>

      {#if errorMsg}
        <div class="error-msg">{errorMsg}</div>
      {/if}

      {#if recentRooms.length > 0}
        <div class="recent">
          <div class="recent-label">Recent rooms</div>
          <div class="recent-list">
            {#each recentRooms as room}
              <button class="recent-btn" onclick={() => goToRecent(room)}>
                {room}
              </button>
            {/each}
          </div>
        </div>
      {/if}

    {:else if step === 'notFound'}
      <div class="not-found">
        <p class="not-found-msg">Room "<strong>{roomCode}</strong>" doesn't exist yet.</p>
        <button class="btn" onclick={handleCreateClick}>Create it</button>
        <button class="btn btn-secondary" onclick={handleBack}>Back</button>
      </div>

    {:else if step === 'createPin'}
      <div class="create-form">
        <p class="create-msg">Set an admin PIN for "<strong>{roomCode}</strong>"</p>

        <div class="input-group">
          <label class="input-label" for="displayName">Display name (optional)</label>
          <input
            type="text"
            id="displayName"
            placeholder={roomCode}
            maxlength="50"
            bind:value={displayName}
            disabled={isLoading}
          />
        </div>

        <div class="input-group">
          <label class="input-label" for="pin">Admin PIN (6 digits)</label>
          <input
            type="password"
            id="pin"
            inputmode="numeric"
            pattern="[0-9]*"
            maxlength="6"
            placeholder="000000"
            bind:value={pin}
            onkeydown={handleKeydown}
            disabled={isLoading}
          />
        </div>

        <div class="input-group">
          <label class="input-label" for="pinConfirm">Confirm PIN</label>
          <input
            type="password"
            id="pinConfirm"
            inputmode="numeric"
            pattern="[0-9]*"
            maxlength="6"
            placeholder="000000"
            bind:value={pinConfirm}
            onkeydown={handleKeydown}
            disabled={isLoading}
          />
        </div>

        <button class="btn" onclick={handleCreate} disabled={isLoading || pin.length !== 6}>
          {isLoading ? 'Creating...' : 'Create Room'}
        </button>
        <button class="btn btn-secondary" onclick={handleBack} disabled={isLoading}>Back</button>

        {#if errorMsg}
          <div class="error-msg">{errorMsg}</div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .landing {
    max-width: 400px;
    padding-top: 60px;
  }

  header {
    text-align: center;
    margin-bottom: 40px;
  }

  h1 {
    font-size: 3rem;
    font-weight: 800;
    background: linear-gradient(135deg, var(--accent) 0%, var(--cyan) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -0.02em;
    margin-bottom: 12px;
  }

  .subtitle {
    color: var(--text-muted);
    font-size: 1rem;
    font-weight: 300;
  }

  .card {
    background: var(--bg-card);
    border-radius: 24px;
    padding: 32px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }

  .input-group {
    margin-bottom: 20px;
  }

  .input-label {
    display: block;
    font-size: 0.85rem;
    color: var(--text-muted);
    margin-bottom: 8px;
  }

  .btn-secondary {
    background: transparent;
    border: 2px solid rgba(255, 255, 255, 0.2);
    margin-top: 12px;
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.3);
  }

  .error-msg {
    color: var(--warning);
    font-size: 0.85rem;
    margin-top: 16px;
    text-align: center;
  }

  .not-found-msg,
  .create-msg {
    text-align: center;
    margin-bottom: 24px;
    color: var(--text-muted);
  }

  .not-found-msg strong,
  .create-msg strong {
    color: var(--cyan);
  }

  .recent {
    margin-top: 32px;
    padding-top: 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .recent-label {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 12px;
  }

  .recent-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .recent-btn {
    background: rgba(78, 205, 196, 0.1);
    border: 1px solid rgba(78, 205, 196, 0.3);
    color: var(--cyan);
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 0.85rem;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .recent-btn:hover {
    background: rgba(78, 205, 196, 0.2);
    border-color: var(--cyan);
  }
</style>
