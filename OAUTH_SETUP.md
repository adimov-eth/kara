# OAuth Setup Progress

## Current State
Project "Jukebox" created in Google Cloud Console (Project ID: `jukebox-485908`)

## Next Steps

### 1. Configure OAuth Consent Screen
1. Go to APIs & Services → OAuth consent screen
2. Select "External" user type
3. Fill in:
   - App name: "Jukebox"
   - User support email: your email
   - Developer contact: your email
4. Add scopes: `email`, `profile`, `openid`
5. Save and continue through all steps

### 2. Create OAuth Credentials
1. Go to APIs & Services → Credentials
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: "Web application"
4. Name: "Jukebox Web Client"
5. Add Authorized redirect URIs:
   - `https://bkk.lol/auth/callback`
   - `https://karaoke-queue.boris-47d.workers.dev/auth/callback`
   - `http://localhost:8787/auth/callback` (for local dev)
6. Copy the **Client ID** and **Client Secret**

### 3. Set Cloudflare Secrets
```bash
cd worker
npx wrangler secret put GOOGLE_CLIENT_ID
# paste the client ID

npx wrangler secret put GOOGLE_CLIENT_SECRET
# paste the client secret

npx wrangler secret put SESSION_SECRET
# generate with: openssl rand -hex 32
```

### 4. Local Development
Create `worker/.dev.vars`:
```
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
SESSION_SECRET=dev-secret-minimum-32-characters-long
```

### 5. Deploy and Test
```bash
cd worker
npx wrangler deploy
```

Then visit the app and test:
1. Click "Sign in with Google"
2. Should redirect to Google, then back with session cookie
3. Check that session persists on refresh

## Implementation Complete
All code for jukebox mode is written:
- Types: `packages/types/src/index.ts`
- Auth: `worker/src/auth.ts`
- Routes: `worker/src/index.ts`
- Stack logic: `worker/src/room.ts`, `packages/domain/src/queue.ts`
- UI: `LoginButton.svelte`, `MyStack.svelte`, updated `GuestView.svelte`

Build passes: `pnpm build` ✓
