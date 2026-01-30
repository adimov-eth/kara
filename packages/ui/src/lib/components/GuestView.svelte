<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { SearchResult, QueueState, Entry, UserSession, User, RoomConfig } from "@karaoke/types";
  import {
    createWebSocket,
    join,
    vote as voteApi,
    remove as removeApi,
    skip as skipApi,
    getRoomId,
    addSong,
    getRoomConfig,
  } from "$lib";
  import { extractVideoId } from "@karaoke/domain";
  import { safeJsonParse } from "$lib/utils";
  import { vibrateSuccess, vibrateTap, vibrateError } from "$lib/haptics";
  import NowPlaying from "$lib/components/NowPlaying.svelte";
  import Search from "$lib/components/Search.svelte";
  import PopularSongs from "$lib/components/PopularSongs.svelte";
  import Queue from "$lib/components/Queue.svelte";
  import PinModal from "$lib/components/PinModal.svelte";
  import { toastStore } from "$lib/stores/toast.svelte";
  import HelpButton from "$lib/components/HelpButton.svelte";
  import LoginButton from "$lib/components/LoginButton.svelte";
  import MyStack from "$lib/components/MyStack.svelte";

  // State
  let room = $state<QueueState>({
    queue: [],
    nowPlaying: null,
    currentEpoch: 0,
  });
  let myName = $state("");
  let voterId = $state("");
  let myVotes = $state<Record<string, number>>({});
  let verifiedNames = $state<Record<string, boolean>>({});

  // Auth state
  let session = $state<UserSession | null>(null);
  let user = $state<User | null>(null);
  let myStackRef = $state<MyStack | null>(null);

  // Room config (for mode display)
  let roomConfig = $state<RoomConfig | null>(null);

  // Form state
  let selectedSong = $state<SearchResult | null>(null);
  let validatedUrl = $state<string | null>(null);
  let validatedTitle = $state<string | null>(null);
  let isJoining = $state(false);
  let joinError = $state<string | null>(null);

  // PIN modal state
  let pinMode = $state<"claim" | "verify" | "closed">("closed");
  let pinName = $state("");
  let pendingJoin = $state<{ name: string; url: string; title: string } | null>(
    null,
  );

  // Cinematic Recap state
  let showRecap = $state(false);
  let recapVotes = $state(0);

  // YouTube validation
  let ytPlayer: YT.Player | null = null;
  let validationStatus = $state<"idle" | "checking" | "valid" | "invalid">(
    "idle",
  );
  let validationMsg = $state("");

  const MAX_DURATION = 420; // 7 minutes

  // WebSocket
  let ws = createWebSocket();
  let previousNowPlaying: typeof room.nowPlaying = null;
  let previousPosition: number | null = null;
  let previousEntry: Entry | null = null;

  // Derived
  const myEntry = $derived(
    room.queue.find((e) => e.name.toLowerCase() === myName.toLowerCase()),
  );
  const isMyTurn = $derived(
    room.nowPlaying?.name.toLowerCase() === myName.toLowerCase(),
  );
  const isInQueue = $derived(!!myEntry);
  const myPosition = $derived(
    myEntry ? room.queue.findIndex((e) => e.id === myEntry.id) + 1 : null,
  );
  const songsUntilTurn = $derived(myPosition);
  const roomId = $derived(getRoomId());
  const isLoggedIn = $derived(!!session);
  const displayName = $derived(session?.displayName ?? myName);
  const roomMode = $derived(roomConfig?.mode ?? 'karaoke');
  const canJoin = $derived(
    validatedUrl && !isMyTurn && (
      // Jukebox mode: just need to be logged in
      (roomMode === 'jukebox' && isLoggedIn) ||
      // Karaoke mode: need name and not already in queue
      (roomMode === 'karaoke' && myName.trim().length > 0 && !isInQueue)
    ),
  );

  // Initialize
  onMount(async () => {
    // Restore from localStorage
    myName = localStorage.getItem("karaoke_name") ?? "";
    voterId = localStorage.getItem("karaoke_voter_id") ?? crypto.randomUUID();
    myVotes = safeJsonParse<Record<string, number>>(localStorage.getItem("karaoke_votes"), {});
    verifiedNames = safeJsonParse<Record<string, boolean>>(localStorage.getItem("karaoke_verified"), {});

    // Save voterId
    localStorage.setItem("karaoke_voter_id", voterId);

    // Connect WebSocket
    ws.onState(handleStateUpdate);
    ws.connect("user");

    // Load YouTube API
    if (typeof window !== "undefined" && !window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }

    // Fetch room config for mode display
    roomConfig = await getRoomConfig();
  });

  onDestroy(() => {
    ws.disconnect();
  });

  function handleStateUpdate(newState: QueueState) {
    const nameLower = myName.toLowerCase();

    // Find my entry in new state
    const newMyEntry = newState.queue.find(
      (e) => e.name.toLowerCase() === nameLower,
    );
    const newPosition = newMyEntry
      ? newState.queue.findIndex((e) => e.id === newMyEntry.id) + 1
      : null;

    // Check if user's song just finished (was playing, now not)
    const wasPlaying = previousNowPlaying?.name.toLowerCase() === nameLower;
    const isNowPlaying = newState.nowPlaying?.name.toLowerCase() === nameLower;

    if (wasPlaying && !isNowPlaying && myName) {
      // Song finished - show stats
      const finalVotes = previousEntry?.votes ?? 0;
      const voteMsg =
        finalVotes > 0
          ? `+${finalVotes}`
          : finalVotes === 0
            ? "0"
            : `${finalVotes}`;

      const isVerified = verifiedNames[nameLower] === true;
      if (!isVerified) {
        toastStore.success(`Nice! You got ${voteMsg} votes`);
        // Show PIN claim modal after a beat
        setTimeout(() => {
          pinName = myName;
          pinMode = "claim";
        }, 1500);
      } else {
        toastStore.success(`You got ${voteMsg} votes! Add another?`);
      }

      // Show cinematic recap
      recapVotes = finalVotes;
      showRecap = true;
      setTimeout(() => (showRecap = false), 4000);
    }

    // Position change notifications (only if we were already in queue)
    if (
      previousPosition !== null &&
      newPosition !== null &&
      previousPosition !== newPosition
    ) {
      if (newPosition < previousPosition) {
        toastStore.success(`You moved up! Now #${newPosition}`);
      } else if (newPosition > previousPosition) {
        toastStore.info(`Slipped to #${newPosition}`);
      }
    }

    // Pre-turn countdown notifications
    if (newPosition !== null && previousPosition !== null) {
      if (newPosition === 2 && previousPosition > 2) {
        toastStore.info("2 songs until you're up!");
      } else if (newPosition === 1 && previousPosition > 1) {
        toastStore.success("You're next! Get ready! 🎤");
      }
    }

    // About to sing notification (just moved to nowPlaying)
    if (!wasPlaying && isNowPlaying) {
      toastStore.success("You're up! Time to shine! ✨");
      vibrateSuccess();
    }

    // Update tracking state
    previousNowPlaying = newState.nowPlaying;
    previousPosition = newPosition;
    previousEntry = newMyEntry ?? null;
    room = newState;
  }

  function handleNameInput(e: Event) {
    const target = e.target as HTMLInputElement;
    myName = target.value;
    localStorage.setItem("karaoke_name", myName);
  }

  function handleSongSelect(result: SearchResult) {
    selectedSong = result;
    const url = `https://www.youtube.com/watch?v=${result.id}`;
    validateUrl(url, result.title);
  }

  function handlePopularSelect(videoId: string, title: string) {
    // Create a minimal SearchResult-like object for display
    selectedSong = {
      id: videoId,
      title,
      channel: "Popular in this room",
      duration: "",
      durationSeconds: 0,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      source: "youtube",
      playable: true,
    };
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    validateUrl(url, title);
  }

  async function validateUrl(url: string, title?: string) {
    validationStatus = "checking";
    validationMsg = "Checking video...";

    const videoId = extractVideoId(url);
    if (!videoId) {
      validationStatus = "invalid";
      validationMsg = "Invalid YouTube URL";
      validatedUrl = null;
      validatedTitle = null;
      return;
    }

    // Use YouTube IFrame API to validate
    if (typeof window !== "undefined" && window.YT) {
      await validateWithYT(videoId, url, title);
    } else {
      // Fallback: trust the URL
      validationStatus = "valid";
      validationMsg = "Ready to add!";
      validatedUrl = url;
      validatedTitle = title ?? "Unknown Song";
    }
  }

  function validateWithYT(
    videoId: string,
    url: string,
    title?: string,
  ): Promise<void> {
    return new Promise((resolve) => {
      const container = document.getElementById("validationPlayer");
      if (!container) {
        validationStatus = "valid";
        validatedUrl = url;
        validatedTitle = title ?? "Unknown Song";
        resolve();
        return;
      }

      container.innerHTML = '<div id="ytPlayer"></div>';

      ytPlayer = new window.YT.Player("ytPlayer", {
        height: "1",
        width: "1",
        videoId,
        playerVars: { autoplay: 0, controls: 0 },
        events: {
          onReady: (event: YT.PlayerEvent) => {
            const duration = event.target.getDuration();
            const data = event.target.getVideoData();

            if (duration === 0) {
              validationStatus = "invalid";
              validationMsg = "Livestreams not allowed";
              validatedUrl = null;
              resolve();
              return;
            }

            if (duration > MAX_DURATION) {
              const mins = Math.floor(duration / 60);
              const secs = Math.round(duration % 60);
              validationStatus = "invalid";
              validationMsg = `Too long (${mins}:${secs.toString().padStart(2, "0")}) - max 7 minutes`;
              validatedUrl = null;
              resolve();
              return;
            }

            validatedUrl = url;
            validatedTitle = title ?? data.title ?? "Unknown Song";
            validationStatus = "valid";
            validationMsg = "Ready to add!";
            resolve();
          },
          onError: () => {
            validationStatus = "invalid";
            validationMsg = "Video not found or unavailable";
            validatedUrl = null;
            resolve();
          },
        },
      });

      // Timeout fallback
      setTimeout(() => {
        if (validationStatus === "checking") {
          validationStatus = "invalid";
          validationMsg = "Could not load video";
          validatedUrl = null;
          resolve();
        }
      }, 10000);
    });
  }

  async function handleJoin() {
    if (!validatedUrl || !validatedTitle) return;

    const videoId = extractVideoId(validatedUrl);
    if (!videoId) {
      joinError = "Invalid video URL";
      return;
    }

    isJoining = true;
    joinError = null;

    // Jukebox mode with auth: use stack/add API
    if (roomMode === 'jukebox' && isLoggedIn) {
      const result = await addSong(videoId, validatedTitle);
      isJoining = false;

      switch (result.kind) {
        case "addedToQueue":
          toastStore.success(`Added to queue at #${result.queuePosition}!`);
          vibrateSuccess();
          resetForm();
          myStackRef?.refresh();
          break;
        case "added":
          toastStore.success(`Added to your stack (#${result.stackPosition} waiting)`);
          vibrateSuccess();
          resetForm();
          myStackRef?.refresh();
          break;
        case "stackFull":
          joinError = `Stack is full (max ${result.maxSize} songs)`;
          break;
        case "unauthenticated":
          joinError = "Please sign in to add songs";
          break;
        case "error":
          vibrateError();
          joinError = result.message;
          break;
      }
      return;
    }

    // Karaoke mode: use join API with name
    if (!myName.trim()) {
      joinError = "Enter your name";
      isJoining = false;
      return;
    }

    const isVerified = verifiedNames[myName.toLowerCase()] === true;

    const result = await join({
      name: myName.trim(),
      videoId,
      title: validatedTitle,
      verified: isVerified,
    });

    isJoining = false;

    switch (result.kind) {
      case "joined":
        toastStore.success(`You're #${result.position} in the queue!`);
        vibrateSuccess();
        resetForm();
        break;
      case "requiresPin":
        pendingJoin = {
          name: myName.trim(),
          url: validatedUrl,
          title: validatedTitle,
        };
        pinName = myName.trim();
        pinMode = "verify";
        break;
      case "alreadyInQueue":
        joinError = `${result.name} is already in the queue`;
        break;
      case "invalidVideo":
        joinError = result.reason;
        break;
      case "error":
        vibrateError();
        joinError = result.message;
        break;
    }
  }

  function resetForm() {
    selectedSong = null;
    validatedUrl = null;
    validatedTitle = null;
    validationStatus = "idle";
    validationMsg = "";
    joinError = null;
  }

  async function handleVote(entryId: string, direction: -1 | 0 | 1) {
    // Optimistic update - apply immediately
    const previousVote = myVotes[entryId] ?? 0;
    const voteDelta = direction - previousVote;

    // Update local vote tracking
    if (direction === 0) {
      const { [entryId]: _, ...rest } = myVotes;
      myVotes = rest;
      vibrateTap();
    } else {
      myVotes = { ...myVotes, [entryId]: direction };
      vibrateTap();
    }
    localStorage.setItem("karaoke_votes", JSON.stringify(myVotes));

    // Optimistic UI update - adjust vote count in queue
    room = {
      ...room,
      queue: room.queue.map((e) =>
        e.id === entryId ? { ...e, votes: e.votes + voteDelta } : e,
      ),
    };

    // Send to server (will reconcile on next state update)
    const result = await voteApi(entryId, direction, voterId);
    if (result.kind !== "voted") {
      // Revert on failure
      if (previousVote === 0) {
        const { [entryId]: _, ...rest } = myVotes;
        myVotes = rest;
      } else {
        myVotes = { ...myVotes, [entryId]: previousVote };
      }
      localStorage.setItem("karaoke_votes", JSON.stringify(myVotes));
      const errorMsg = result.kind === "error" ? result.message : "Vote failed";
      toastStore.error(errorMsg);
    }
  }

  async function handleRemove(entryId: string) {
    if (!confirm("Remove your song from the queue?")) return;
    const result = await removeApi(entryId, myName);
    if (result.kind !== "removed") {
      const errorMsg =
        result.kind === "error"
          ? result.message
          : result.kind === "entryNotFound"
            ? "Song not found"
            : result.kind === "unauthorized"
              ? "Not authorized"
              : "Failed to remove";
      toastStore.error(errorMsg);
    }
  }

  async function handleSkip() {
    if (!confirm("Skip your song?")) return;
    const result = await skipApi(myName);
    if (result.kind === "skipped") {
      toastStore.success("Song skipped");
    } else {
      const errorMsg =
        result.kind === "error"
          ? result.message
          : result.kind === "nothingPlaying"
            ? "Nothing is playing"
            : result.kind === "unauthorized"
              ? "Not authorized"
              : "Failed to skip";
      toastStore.error(errorMsg);
    }
  }

  function handlePinSuccess() {
    verifiedNames = { ...verifiedNames, [pinName.toLowerCase()]: true };
    localStorage.setItem("karaoke_verified", JSON.stringify(verifiedNames));

    if (pinMode === "verify" && pendingJoin) {
      // Retry the join
      validatedUrl = pendingJoin.url;
      validatedTitle = pendingJoin.title;
      myName = pendingJoin.name;
      pendingJoin = null;
      pinMode = "closed";
      handleJoin();
    } else {
      toastStore.success("Your name is locked in!");
      pinMode = "closed";
    }
  }

  function handlePinClose() {
    pinMode = "closed";
    pendingJoin = null;
  }

  function handleChangeName() {
    pinMode = "closed";
    pendingJoin = null;
    myName = "";
    document.getElementById("nameInput")?.focus();
  }

  function handleSessionChange(newSession: UserSession | null, newUser: User | null) {
    session = newSession;
    user = newUser;
    if (newSession) {
      myName = newSession.displayName;
    }
  }
</script>

<div class="container">
  <header>
    <div class="header-top">
      <h1>Karaoke</h1>
      <LoginButton onSessionChange={handleSessionChange} />
    </div>
    <p class="subtitle">Pick a song, join the queue, sing your heart out</p>
    <div class="header-actions">
      {#if roomConfig}
        <span class="mode-badge" class:jukebox={roomMode === 'jukebox'} class:karaoke={roomMode === 'karaoke'}>
          {roomMode === 'jukebox' ? '🎵 Jukebox' : '🎤 Karaoke'}
        </span>
      {/if}
      <a href="/{roomId}/player" target="_blank" rel="noopener" class="player-link">
        Open Player
      </a>
    </div>
  </header>

  {#if room.nowPlaying}
    <NowPlaying
      entry={room.nowPlaying}
      canSkip={isMyTurn}
      onSkip={handleSkip}
    />
  {/if}

  {#if myPosition === 1 && !isMyTurn}
    <div class="on-deck-banner on-deck-next">
      <div class="deck-icon">🎙️</div>
      <div class="deck-text">
        <strong>You're up next!</strong><br />
        Get ready to take the mic!
      </div>
    </div>
  {:else if myPosition === 2}
    <div class="on-deck-banner on-deck-soon">
      <div class="deck-icon">👀</div>
      <div class="deck-text">
        <strong>On deck</strong><br />
        One song until your turn
      </div>
    </div>
  {/if}

  {#if myEntry}
    <div class="my-song-card">
      <div class="my-song-header">
        <span class="my-song-label">Your song</span>
        <span class="my-song-position"
          >#{room.queue.findIndex((e) => e.id === myEntry.id) + 1} in queue</span
        >
      </div>
      <div class="my-song-title">{myEntry.title}</div>
      <button class="btn btn-change" onclick={() => handleRemove(myEntry.id)}>
        Change Song
      </button>
    </div>
  {:else if isMyTurn}
    <div class="my-turn-card">
      <div class="my-turn-label">You're up!</div>
      <div class="my-turn-song">{room.nowPlaying?.title}</div>
      <button class="btn btn-warning" onclick={handleSkip}>
        Skip My Song
      </button>
    </div>
  {:else}
    <div class="join-card">
      <div class="input-group">
        <label class="input-label" for="nameInput">Your name</label>
        <input
          type="text"
          id="nameInput"
          placeholder="Enter your name"
          maxlength="30"
          autocomplete="off"
          value={myName}
          oninput={handleNameInput}
        />
      </div>

      <div class="input-group">
        <span class="input-label">Search for a song</span>
        <Search maxDuration={MAX_DURATION} onSelect={handleSongSelect} />

        {#if !selectedSong}
          <PopularSongs onSelect={handlePopularSelect} />
        {/if}

        {#if selectedSong}
          <div class="selected-song">
            <div class="selected-song-title">{selectedSong.title}</div>
            <div class="selected-song-meta">
              {selectedSong.channel} · {selectedSong.duration}
            </div>
          </div>
        {/if}

        {#if validationStatus !== "idle"}
          <div class="validation-status {validationStatus}">
            {#if validationStatus === "checking"}
              <div class="validation-spinner"></div>
            {/if}
            {validationMsg}
          </div>
        {/if}
      </div>

      <button class="btn" onclick={handleJoin} disabled={!canJoin || isJoining}>
        Add to Queue
      </button>

      {#if joinError}
        <div class="error-msg">{joinError}</div>
      {/if}
    </div>
  {/if}

  <Queue
    entries={room.queue}
    {myName}
    {myVotes}
    onVote={handleVote}
    onRemove={handleRemove}
  />

  {#if isLoggedIn}
    <div class="my-stack-section">
      <MyStack bind:this={myStackRef} />
    </div>
  {/if}
</div>

<div id="validationPlayer" style="display: none;"></div>

<PinModal
  mode={pinMode}
  name={pinName}
  onSuccess={handlePinSuccess}
  onClose={handlePinClose}
  onChangeName={handleChangeName}
/>

{#if showRecap}
  <div class="recap-overlay">
    <div class="recap-content">
      <div class="recap-applause">👏 APPLAUSE! 👏</div>
      <div class="recap-votes">
        {recapVotes > 0 ? "+" : ""}{recapVotes}
      </div>
      <div class="recap-label">VOTES RECEIVED</div>
    </div>
  </div>
{/if}

<HelpButton />

<style>
  header {
    text-align: center;
    margin-bottom: 32px;
  }

  .header-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  h1 {
    font-size: 2.5rem;
    font-weight: 800;
    background: linear-gradient(135deg, var(--accent) 0%, var(--cyan) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -0.02em;
    margin: 0;
  }

  .my-stack-section {
    margin-top: 24px;
  }

  .subtitle {
    color: var(--text-muted);
    font-size: 0.95rem;
    font-weight: 300;
  }

  .header-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-top: 12px;
  }

  .mode-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: 500;
  }

  .mode-badge.jukebox {
    background: rgba(78, 205, 196, 0.15);
    color: var(--cyan);
    border: 1px solid rgba(78, 205, 196, 0.2);
  }

  .mode-badge.karaoke {
    background: rgba(255, 107, 157, 0.15);
    color: var(--accent);
    border: 1px solid rgba(255, 107, 157, 0.2);
  }

  .player-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    color: var(--text-muted);
    font-size: 0.85rem;
    text-decoration: none;
    transition: all 0.2s ease;
  }

  .player-link:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .join-card,
  .my-song-card,
  .my-turn-card {
    background: var(--bg-card);
    border-radius: 20px;
    padding: 24px;
    margin-bottom: 24px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }

  .my-song-card {
    border-color: rgba(78, 205, 196, 0.3);
    background: linear-gradient(
      135deg,
      rgba(78, 205, 196, 0.1) 0%,
      var(--bg-card) 100%
    );
  }

  .my-song-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .my-song-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--cyan);
    font-weight: 600;
  }

  .my-song-position {
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .my-song-title {
    font-size: 1.1rem;
    font-weight: 600;
    margin-bottom: 16px;
    line-height: 1.4;
  }

  .btn-change {
    background: transparent;
    border: 2px solid var(--cyan);
    color: var(--cyan);
  }

  .btn-change:hover {
    background: rgba(78, 205, 196, 0.1);
    box-shadow: 0 4px 16px var(--cyan-glow);
  }

  .my-turn-card {
    border-color: rgba(255, 107, 157, 0.3);
    background: linear-gradient(
      135deg,
      rgba(255, 107, 157, 0.15) 0%,
      var(--bg-card) 100%
    );
    text-align: center;
  }

  .my-turn-label {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--accent);
    margin-bottom: 8px;
  }

  .my-turn-song {
    font-size: 1.1rem;
    margin-bottom: 16px;
    color: var(--text-muted);
  }

  .input-group {
    margin-bottom: 16px;
  }

  .input-label {
    display: block;
    font-size: 0.85rem;
    color: var(--text-muted);
    margin-bottom: 8px;
  }

  .selected-song {
    background: rgba(78, 205, 196, 0.1);
    border: 1px solid rgba(78, 205, 196, 0.3);
    border-radius: 12px;
    padding: 16px;
    margin-top: 16px;
  }

  .selected-song-title {
    font-weight: 600;
    margin-bottom: 4px;
  }

  .selected-song-meta {
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .validation-status {
    font-size: 0.85rem;
    margin-top: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .validation-status.checking {
    color: var(--cyan);
  }

  .validation-status.valid {
    color: var(--success);
  }

  .validation-status.invalid {
    color: var(--warning);
  }

  .validation-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(78, 205, 196, 0.3);
    border-top-color: var(--cyan);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .error-msg {
    color: var(--warning);
    font-size: 0.85rem;
    margin-top: 12px;
    text-align: center;
    animation: shake 0.4s ease;
  }

  /* On-Deck Banner */
  .on-deck-banner {
    border-radius: 16px;
    padding: 16px;
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    gap: 16px;
    animation: slideDown 0.4s ease-out;
  }

  .on-deck-next {
    background: linear-gradient(
      135deg,
      rgba(123, 237, 159, 0.2) 0%,
      rgba(123, 237, 159, 0.05) 100%
    );
    border: 1px solid rgba(123, 237, 159, 0.3);
  }

  .on-deck-soon {
    background: linear-gradient(
      135deg,
      rgba(255, 165, 2, 0.2) 0%,
      rgba(255, 165, 2, 0.05) 100%
    );
    border: 1px solid rgba(255, 165, 2, 0.3);
  }

  .deck-icon {
    font-size: 1.8rem;
  }

  .deck-text {
    font-size: 0.95rem;
    color: var(--text);
    line-height: 1.3;
  }

  .deck-text strong {
    font-size: 1.05rem;
    display: block;
    margin-bottom: 2px;
  }

  /* Cinematic Recap */
  .recap-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    animation: fadeIn 0.3s ease;
    backdrop-filter: blur(8px);
  }

  .recap-content {
    text-align: center;
    animation: zoomIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .recap-applause {
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--yellow);
    letter-spacing: 0.1em;
    margin-bottom: 24px;
    text-shadow: 0 0 20px rgba(255, 165, 2, 0.5);
  }

  .recap-votes {
    font-size: 5rem;
    font-weight: 900;
    line-height: 1;
    margin-bottom: 12px;
    background: linear-gradient(135deg, #fff 0%, #ccc 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.5));
  }

  .recap-label {
    font-size: 0.8rem;
    color: var(--text-muted);
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes zoomIn {
    from {
      opacity: 0;
      transform: scale(0.8);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
