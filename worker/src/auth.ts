import type { Env } from './env.js'
import type {
  User,
  UserSession,
  GetSessionResult,
  AnonymousSessionResult,
  LogoutResult,
} from '@karaoke/types'

// =============================================================================
// Constants
// =============================================================================

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000 // 24 hours
const SESSION_COOKIE_NAME = 'karaoke_session'
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'

// =============================================================================
// JWT Utilities (Simple Implementation)
// =============================================================================

interface JWTPayload {
  sub: string      // User ID
  sid: string      // Session ID
  rid: string      // Room ID
  dn: string       // Display name
  prv: string      // Provider ('google' | 'anonymous')
  iat: number      // Issued at
  exp: number      // Expires at
}

async function signJWT(payload: JWTPayload, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signature = await hmacSign(`${encodedHeader}.${encodedPayload}`, secret)
  return `${encodedHeader}.${encodedPayload}.${signature}`
}

async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [header, payload, signature] = parts
  const expectedSignature = await hmacSign(`${header}.${payload}`, secret)

  if (signature !== expectedSignature) return null

  try {
    const decoded = JSON.parse(base64UrlDecode(payload!)) as JWTPayload
    if (Date.now() > decoded.exp) return null
    return decoded
  } catch {
    return null
  }
}

function base64UrlEncode(str: string): string {
  const base64 = btoa(str)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) base64 += '='
  return atob(base64)
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  return base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)))
}

// =============================================================================
// Session Management
// =============================================================================

export function generateSessionId(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function generateUserId(): string {
  return `anon_${generateSessionId().slice(0, 16)}`
}

export async function createSession(
  user: User,
  roomId: string,
  displayName: string,
  secret: string
): Promise<UserSession> {
  const now = Date.now()
  const sessionId = generateSessionId()

  const payload: JWTPayload = {
    sub: user.id,
    sid: sessionId,
    rid: roomId,
    dn: displayName,
    prv: user.provider,
    iat: now,
    exp: now + SESSION_DURATION_MS,
  }

  const token = await signJWT(payload, secret)

  return {
    id: token,
    userId: user.id,
    roomId,
    displayName,
    createdAt: now,
    expiresAt: now + SESSION_DURATION_MS,
  }
}

export async function verifySession(
  token: string,
  secret: string
): Promise<JWTPayload | null> {
  return verifyJWT(token, secret)
}

// =============================================================================
// Cookie Handling
// =============================================================================

export function getSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie')
  if (!cookieHeader) return null

  const cookies = cookieHeader.split(';').map(c => c.trim())
  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.split('=')
    if (name === SESSION_COOKIE_NAME) {
      return valueParts.join('=')
    }
  }
  return null
}

export function setSessionCookie(token: string, maxAge: number = SESSION_DURATION_MS / 1000): string {
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

// =============================================================================
// Google OAuth Flow
// =============================================================================

interface GoogleAuthState {
  roomId: string
  returnUrl: string
  nonce: string
}

export function getGoogleAuthUrl(
  env: Env,
  roomId: string,
  returnUrl: string
): string {
  const state: GoogleAuthState = {
    roomId,
    returnUrl,
    nonce: generateSessionId().slice(0, 16),
  }

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: getCallbackUrl(env),
    response_type: 'code',
    scope: 'openid email profile',
    state: base64UrlEncode(JSON.stringify(state)),
    prompt: 'select_account',
  })

  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

function getCallbackUrl(_env: Env): string {
  // In production, use the deployed URL
  // For local dev, wrangler uses localhost:8787
  return 'https://bkk.lol/auth/callback'
}

export function parseAuthState(stateParam: string): GoogleAuthState | null {
  try {
    return JSON.parse(base64UrlDecode(stateParam)) as GoogleAuthState
  } catch {
    return null
  }
}

interface GoogleTokenResponse {
  access_token: string
  id_token: string
  expires_in: number
  token_type: string
}

interface GoogleUserInfo {
  sub: string          // Google user ID
  email: string
  email_verified: boolean
  name: string
  picture: string
  given_name?: string
  family_name?: string
}

export async function exchangeGoogleCode(
  code: string,
  env: Env
): Promise<{ user: User } | { error: string }> {
  // Exchange code for tokens
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: getCallbackUrl(env),
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text()
    console.error('Google token exchange failed:', error)
    return { error: 'Failed to authenticate with Google' }
  }

  const tokens = await tokenResponse.json() as GoogleTokenResponse

  // Fetch user info
  const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })

  if (!userInfoResponse.ok) {
    return { error: 'Failed to get user info from Google' }
  }

  const userInfo = await userInfoResponse.json() as GoogleUserInfo

  const user: User = {
    id: `google_${userInfo.sub}`,
    provider: 'google',
    email: userInfo.email,
    displayName: userInfo.name || userInfo.email.split('@')[0]!,
    picture: userInfo.picture,
    createdAt: Date.now(),
  }

  return { user }
}

// =============================================================================
// Anonymous Session
// =============================================================================

export function createAnonymousUser(): User {
  return {
    id: generateUserId(),
    provider: 'anonymous',
    displayName: `Guest ${Math.floor(Math.random() * 9000) + 1000}`,
    createdAt: Date.now(),
  }
}

// =============================================================================
// Auth Handlers
// =============================================================================

export async function handleGoogleAuth(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url)
  const roomId = url.searchParams.get('room') ?? 'default'
  const returnUrl = url.searchParams.get('return') ?? `/${roomId}`

  const authUrl = getGoogleAuthUrl(env, roomId, returnUrl)
  return Response.redirect(authUrl, 302)
}

export async function handleGoogleCallback(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const stateParam = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) {
    return new Response(`Authentication failed: ${error}`, { status: 400 })
  }

  if (!code || !stateParam) {
    return new Response('Missing code or state parameter', { status: 400 })
  }

  const state = parseAuthState(stateParam)
  if (!state) {
    return new Response('Invalid state parameter', { status: 400 })
  }

  const result = await exchangeGoogleCode(code, env)
  if ('error' in result) {
    return new Response(result.error, { status: 400 })
  }

  const session = await createSession(
    result.user,
    state.roomId,
    result.user.displayName,
    env.SESSION_SECRET
  )

  // Redirect back to the room with session cookie
  return new Response(null, {
    status: 302,
    headers: {
      Location: state.returnUrl,
      'Set-Cookie': setSessionCookie(session.id),
    },
  })
}

export async function handleGetSession(
  request: Request,
  env: Env
): Promise<Response> {
  const token = getSessionCookie(request)
  if (!token) {
    const result: GetSessionResult = { kind: 'unauthenticated' }
    return Response.json(result)
  }

  const payload = await verifySession(token, env.SESSION_SECRET)
  if (!payload) {
    const result: GetSessionResult = { kind: 'unauthenticated' }
    return Response.json(result, {
      headers: { 'Set-Cookie': clearSessionCookie() },
    })
  }

  const session: UserSession = {
    id: token,
    userId: payload.sub,
    roomId: payload.rid,
    displayName: payload.dn,
    createdAt: payload.iat,
    expiresAt: payload.exp,
  }

  if (payload.prv === 'anonymous') {
    const result: GetSessionResult = { kind: 'anonymous', session }
    return Response.json(result)
  }

  // For Google users, we'd typically look up the user in storage
  // For now, reconstruct minimal user info from JWT
  const user: User = {
    id: payload.sub,
    provider: payload.prv as 'google',
    displayName: payload.dn,
    createdAt: payload.iat,
  }

  const result: GetSessionResult = { kind: 'authenticated', session, user }
  return Response.json(result)
}

export async function handleCreateAnonymousSession(
  request: Request,
  env: Env
): Promise<Response> {
  const body = await request.json().catch(() => ({})) as { roomId?: string; displayName?: string }
  const roomId = body.roomId ?? 'default'
  const displayName = body.displayName

  const user = createAnonymousUser()
  if (displayName) {
    user.displayName = displayName.trim().substring(0, 30)
  }

  const session = await createSession(
    user,
    roomId,
    user.displayName,
    env.SESSION_SECRET
  )

  const result: AnonymousSessionResult = { kind: 'created', session }
  return Response.json(result, {
    headers: { 'Set-Cookie': setSessionCookie(session.id) },
  })
}

export async function handleLogout(
  _request: Request
): Promise<Response> {
  const result: LogoutResult = { kind: 'loggedOut' }
  return Response.json(result, {
    headers: { 'Set-Cookie': clearSessionCookie() },
  })
}

// =============================================================================
// Middleware Helper
// =============================================================================

export interface AuthContext {
  session: UserSession | null
  userId: string | null
  displayName: string | null
  provider: 'google' | 'anonymous' | null
}

export async function getAuthContext(
  request: Request,
  env: Env
): Promise<AuthContext> {
  const token = getSessionCookie(request)
  if (!token) {
    return { session: null, userId: null, displayName: null, provider: null }
  }

  const payload = await verifySession(token, env.SESSION_SECRET)
  if (!payload) {
    return { session: null, userId: null, displayName: null, provider: null }
  }

  const session: UserSession = {
    id: token,
    userId: payload.sub,
    roomId: payload.rid,
    displayName: payload.dn,
    createdAt: payload.iat,
    expiresAt: payload.exp,
  }

  return {
    session,
    userId: payload.sub,
    displayName: payload.dn,
    provider: payload.prv as 'google' | 'anonymous',
  }
}
