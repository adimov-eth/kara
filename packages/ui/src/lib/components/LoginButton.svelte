<script lang="ts">
  import {
    getSession,
    loginWithGoogle,
    createAnonymousSession,
    logout,
    type GetSessionResult,
    type UserSession,
    type User,
  } from '$lib/api';

  // Props
  interface Props {
    onSessionChange?: (session: UserSession | null, user: User | null) => void;
  }
  let { onSessionChange }: Props = $props();

  // State
  let session = $state<UserSession | null>(null);
  let user = $state<User | null>(null);
  let isAnonymous = $state(false);
  let loading = $state(true);
  let menuOpen = $state(false);
  let nameInput = $state('');
  let showNameInput = $state(false);

  // Check session on mount
  $effect(() => {
    checkSession();
  });

  async function checkSession() {
    loading = true;
    const result = await getSession();

    if (result.kind === 'authenticated') {
      session = result.session;
      user = result.user;
      isAnonymous = false;
    } else if (result.kind === 'anonymous') {
      session = result.session;
      user = null;
      isAnonymous = true;
    } else {
      session = null;
      user = null;
      isAnonymous = false;
    }

    loading = false;
    onSessionChange?.(session, user);
  }

  function handleGoogleLogin() {
    loginWithGoogle();
  }

  async function handleAnonymousLogin() {
    if (!nameInput.trim()) {
      showNameInput = true;
      return;
    }

    loading = true;
    const result = await createAnonymousSession(nameInput.trim());
    if (result.kind === 'created') {
      session = result.session;
      isAnonymous = true;
      showNameInput = false;
      nameInput = '';
      onSessionChange?.(session, null);
    }
    loading = false;
  }

  async function handleLogout() {
    await logout();
    session = null;
    user = null;
    isAnonymous = false;
    menuOpen = false;
    onSessionChange?.(null, null);
  }

  function toggleMenu() {
    menuOpen = !menuOpen;
  }

  function closeMenu() {
    menuOpen = false;
  }
</script>

<svelte:window onclick={closeMenu} />

<div class="login-container">
  {#if loading}
    <div class="loading-skeleton"></div>
  {:else if session}
    <button class="user-button" onclick={(e) => { e.stopPropagation(); toggleMenu(); }}>
      {#if user?.picture}
        <img src={user.picture} alt="" class="avatar" />
      {:else}
        <div class="avatar-placeholder">
          {session.displayName.charAt(0).toUpperCase()}
        </div>
      {/if}
      <span class="display-name">{session.displayName}</span>
      <span class="dropdown-arrow">{menuOpen ? '▲' : '▼'}</span>
    </button>

    {#if menuOpen}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="dropdown-menu" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
        <div class="menu-header">
          <span class="provider-badge">{isAnonymous ? 'Guest' : 'Google'}</span>
          {#if user?.email}
            <span class="email">{user.email}</span>
          {/if}
        </div>
        {#if isAnonymous}
          <button class="menu-item" onclick={handleGoogleLogin}>
            <svg viewBox="0 0 24 24" class="google-icon">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </button>
        {/if}
        <button class="menu-item logout" onclick={handleLogout}>
          Sign Out
        </button>
      </div>
    {/if}
  {:else}
    <div class="login-options">
      {#if showNameInput}
        <div class="name-input-container">
          <input
            type="text"
            placeholder="Your name"
            bind:value={nameInput}
            maxlength="30"
            class="name-input"
            onkeydown={(e) => e.key === 'Enter' && handleAnonymousLogin()}
          />
          <button class="go-btn" onclick={handleAnonymousLogin}>Go</button>
        </div>
      {:else}
        <button class="login-btn google" onclick={handleGoogleLogin}>
          <svg viewBox="0 0 24 24" class="google-icon">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign in
        </button>
        <button class="login-btn guest" onclick={() => showNameInput = true}>
          Continue as Guest
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .login-container {
    position: relative;
  }

  .loading-skeleton {
    width: 120px;
    height: 40px;
    border-radius: 20px;
    background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.05) 25%,
      rgba(255, 255, 255, 0.1) 50%,
      rgba(255, 255, 255, 0.05) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  .user-button {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 14px 6px 6px;
    background: var(--bg-card);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 25px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: inherit;
    color: var(--text);
  }

  .user-button:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;
  }

  .avatar-placeholder {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--accent) 0%, var(--cyan) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 0.9rem;
    color: white;
  }

  .display-name {
    font-size: 0.9rem;
    font-weight: 500;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dropdown-arrow {
    font-size: 0.6rem;
    color: var(--text-muted);
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    background: var(--bg-card);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 16px;
    padding: 8px;
    min-width: 200px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    z-index: 100;
    animation: fadeIn 0.15s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .menu-header {
    padding: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    margin-bottom: 8px;
  }

  .provider-badge {
    display: inline-block;
    padding: 2px 8px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-bottom: 4px;
  }

  .email {
    display: block;
    font-size: 0.8rem;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 12px;
    background: none;
    border: none;
    border-radius: 10px;
    color: var(--text);
    font-size: 0.9rem;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s ease;
    text-align: left;
  }

  .menu-item:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .menu-item.logout {
    color: #ff6b6b;
  }

  .login-options {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .name-input-container {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .name-input {
    padding: 10px 16px;
    background: var(--bg-card);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 20px;
    color: var(--text);
    font-size: 0.9rem;
    font-family: inherit;
    width: 150px;
    transition: all 0.2s ease;
  }

  .name-input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-glow);
  }

  .go-btn {
    padding: 10px 18px;
    background: linear-gradient(135deg, var(--accent) 0%, #ff8fab 100%);
    border: none;
    border-radius: 20px;
    color: white;
    font-weight: 600;
    font-size: 0.9rem;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .go-btn:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 16px var(--accent-glow);
  }

  .login-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    border: none;
    border-radius: 20px;
    font-size: 0.9rem;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .login-btn.google {
    background: white;
    color: #333;
  }

  .login-btn.google:hover {
    background: #f5f5f5;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  }

  .login-btn.guest {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: var(--text-muted);
  }

  .login-btn.guest:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.3);
    color: var(--text);
  }

  .google-icon {
    width: 18px;
    height: 18px;
  }

  @media (max-width: 480px) {
    .login-options {
      flex-direction: column;
      width: 100%;
    }

    .login-btn {
      width: 100%;
      justify-content: center;
    }

    .name-input-container {
      width: 100%;
    }

    .name-input {
      flex: 1;
    }
  }
</style>
