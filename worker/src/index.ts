import type { Env } from './env.js'
import type { FeedbackRequest } from '@karaoke/types'
import { GUEST_HTML, PLAYER_HTML, ADMIN_HTML, LANDING_HTML } from './views/generated/index.js'
import {
  handleGoogleAuth,
  handleGoogleCallback,
  handleGetSession,
  handleCreateAnonymousSession,
  handleLogout,
} from './auth.js'

// Re-export RoomDO for Cloudflare to find it
export { RoomDO } from './room.js'

const ADMIN_PATH = '/admin'
const DEFAULT_ROOM_ID = 'default'

// Reserved paths that cannot be room IDs
const RESERVED_PATHS = new Set(['api', 'player', 'admin'])

// Active rooms tracking
const ACTIVE_ROOMS_KEY = 'active_rooms'
const ROOM_ACTIVITY_TTL = 60 * 60 * 24 // 24 hours

interface ActiveRoom {
  roomId: string
  lastActivity: number
  queueSize?: number
  nowPlaying?: string
}

async function trackRoomActivity(env: Env, roomId: string, queueSize?: number, nowPlaying?: string): Promise<void> {
  try {
    const existing = await env.KARAOKE_KV.get(ACTIVE_ROOMS_KEY, 'json') as Record<string, ActiveRoom> | null
    const rooms = existing ?? {}

    rooms[roomId] = {
      roomId,
      lastActivity: Date.now(),
      queueSize,
      nowPlaying,
    }

    // Clean up old entries (older than 24h)
    const cutoff = Date.now() - ROOM_ACTIVITY_TTL * 1000
    for (const [id, room] of Object.entries(rooms)) {
      if (room.lastActivity < cutoff) {
        delete rooms[id]
      }
    }

    await env.KARAOKE_KV.put(ACTIVE_ROOMS_KEY, JSON.stringify(rooms))
  } catch {
    // Silent fail - tracking is best-effort
  }
}

async function getActiveRooms(env: Env): Promise<ActiveRoom[]> {
  try {
    const existing = await env.KARAOKE_KV.get(ACTIVE_ROOMS_KEY, 'json') as Record<string, ActiveRoom> | null
    if (!existing) return []

    const cutoff = Date.now() - ROOM_ACTIVITY_TTL * 1000
    return Object.values(existing)
      .filter(room => room.lastActivity > cutoff)
      .sort((a, b) => b.lastActivity - a.lastActivity)
  } catch {
    return []
  }
}

// Room ID validation regex: 2-30 chars, lowercase alphanumeric + hyphens
const ROOM_ID_REGEX = /^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$|^[a-z0-9]{1,2}$/

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Voter-Id, X-Admin, X-User-Name, Authorization, Upgrade, Connection',
}

const securityHeaders: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
}

function addSecurityHeaders(response: Response): Response {
  const newHeaders = new Headers(response.headers)
  for (const [key, value] of Object.entries(securityHeaders)) {
    newHeaders.set(key, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  })
}

function addCorsHeaders(response: Response): Response {
  const newHeaders = new Headers(response.headers)
  for (const [key, value] of Object.entries(corsHeaders)) {
    newHeaders.set(key, value)
  }
  for (const [key, value] of Object.entries(securityHeaders)) {
    newHeaders.set(key, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  })
}

function getRoomStub(env: Env, roomId: string = DEFAULT_ROOM_ID): DurableObjectStub {
  const id = env.ROOM.idFromName(roomId)
  return env.ROOM.get(id)
}

// =============================================================================
// Feedback System
// =============================================================================

// Rate limiting for feedback (in-memory, simple)
const feedbackRateLimits = new Map<string, { count: number; resetAt: number }>()

function checkFeedbackRateLimit(clientIp: string): boolean {
  const now = Date.now()
  const entry = feedbackRateLimits.get(clientIp)

  if (!entry || now > entry.resetAt) {
    feedbackRateLimits.set(clientIp, { count: 1, resetAt: now + 60000 })
    return false
  }

  if (entry.count >= 5) return true // 5 per minute
  entry.count++
  return false
}

function categoryToLabel(category: string): string {
  switch (category) {
    case 'bug': return 'bug'
    case 'suggestion': return 'enhancement'
    case 'question': return 'question'
    default: return 'feedback'
  }
}

function formatIssueBody(req: FeedbackRequest): string {
  const lines = [
    '## User Feedback',
    '',
    req.feedback,
    '',
  ]

  lines.push(
    '---',
    '',
    '| Context | Value |',
    '|---------|-------|',
    `| Category | ${req.category} |`,
    `| Page | \`${req.page}\` |`,
  )

  if (req.roomId) {
    lines.push(`| Room | \`${req.roomId}\` |`)
  }

  lines.push(
    `| Submitted | ${new Date().toISOString()} |`,
    `| User Agent | ${req.userAgent.slice(0, 100)}... |`,
    '',
    '*Created via in-app feedback*'
  )

  return lines.join('\n')
}

async function handleFeedback(request: Request, env: Env): Promise<Response> {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown'

  if (checkFeedbackRateLimit(clientIp)) {
    return addCorsHeaders(Response.json(
      { kind: 'rateLimited' },
      { status: 429 }
    ))
  }

  try {
    const body = await request.json() as FeedbackRequest

    // Validation
    if (!body.feedback?.trim() || body.feedback.length > 2000) {
      return addCorsHeaders(Response.json(
        { kind: 'validationError', message: 'Feedback must be 1-2000 characters' },
        { status: 400 }
      ))
    }
    if (body.title && body.title.length > 100) {
      return addCorsHeaders(Response.json(
        { kind: 'validationError', message: 'Title must be under 100 characters' },
        { status: 400 }
      ))
    }

    // Create GitHub issue
    const title = body.title?.trim() || `[${body.category}] User Feedback`
    const labels = ['feedback', categoryToLabel(body.category)]

    const issueBody = formatIssueBody(body)

    const ghResponse = await fetch('https://api.github.com/repos/adimov-eth/kara/issues', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'karaoke-feedback-bot',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ title, body: issueBody, labels }),
    })

    if (!ghResponse.ok) {
      console.error('GitHub API error:', await ghResponse.text())
      return addCorsHeaders(Response.json(
        { kind: 'error', message: 'Failed to create issue' },
        { status: 502 }
      ))
    }

    const issue = await ghResponse.json() as { html_url: string; number: number }

    return addCorsHeaders(Response.json({
      kind: 'created',
      issueUrl: issue.html_url,
      issueNumber: issue.number,
    }))
  } catch (err) {
    console.error('Feedback error:', err)
    return addCorsHeaders(Response.json(
      { kind: 'error', message: 'Server error' },
      { status: 500 }
    ))
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    const forwardedProto = request.headers.get('X-Forwarded-Proto')
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1'

    if (!isLocalhost && (forwardedProto === 'http' || url.protocol === 'http:')) {
      const httpsUrl = new URL(request.url)
      httpsUrl.protocol = 'https:'
      return addSecurityHeaders(Response.redirect(httpsUrl.toString(), 308))
    }

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    // Migration endpoint - reads from KV and sends to DO
    if (path === '/api/migrate' && request.method === 'POST') {
      try {
        const kvState = await env.KARAOKE_KV.get('state', 'json')
        const kvVotes = await env.KARAOKE_KV.get('votes', 'json')

        if (!kvState) {
          return Response.json({ success: false, reason: 'no_kv_state' })
        }

        const stub = getRoomStub(env, DEFAULT_ROOM_ID)
        const migrateRequest = new Request(request.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: kvState, votes: kvVotes }),
        })
        const newUrl = new URL(migrateRequest.url)
        newUrl.pathname = '/api/import'
        const response = await stub.fetch(new Request(newUrl.toString(), migrateRequest))
        return addCorsHeaders(response)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return addCorsHeaders(Response.json({ error: message }, { status: 500 }))
      }
    }

    // WebSocket upgrade - proxy to DO
    if (request.headers.get('Upgrade') === 'websocket') {
      const roomId = url.searchParams.get('room') ?? DEFAULT_ROOM_ID
      const stub = getRoomStub(env, roomId)
      return stub.fetch(request)
    }

    // API endpoint for active rooms (handled at edge, not in DO)
    if (path === '/api/rooms/active') {
      const rooms = await getActiveRooms(env)
      return addCorsHeaders(Response.json({ rooms }))
    }

    // Feedback endpoint (global, not room-scoped)
    if (path === '/api/feedback' && request.method === 'POST') {
      return handleFeedback(request, env)
    }

    // ==========================================================================
    // Auth Routes
    // ==========================================================================

    // Google OAuth - redirect to Google
    if (path === '/auth/google') {
      return handleGoogleAuth(request, env)
    }

    // Google OAuth callback
    if (path === '/auth/callback') {
      return handleGoogleCallback(request, env)
    }

    // Get current session
    if (path === '/auth/session' && request.method === 'GET') {
      return addCorsHeaders(await handleGetSession(request, env))
    }

    // Create anonymous session
    if (path === '/auth/anonymous' && request.method === 'POST') {
      return addCorsHeaders(await handleCreateAnonymousSession(request, env))
    }

    // Logout
    if (path === '/auth/logout' && request.method === 'POST') {
      return addCorsHeaders(await handleLogout(request))
    }

    // API routes - proxy to DO
    if (path.startsWith('/api/')) {
      const roomId = url.searchParams.get('room') ?? DEFAULT_ROOM_ID
      const stub = getRoomStub(env, roomId)

      try {
        const response = await stub.fetch(request)

        // Track room activity on state requests
        if (path === '/api/state') {
          try {
            const clonedResponse = response.clone()
            const state = await clonedResponse.json() as { queue?: unknown[]; nowPlaying?: { title?: string } }
            ctx.waitUntil(trackRoomActivity(env, roomId, state.queue?.length, state.nowPlaying?.title))
          } catch {
            // Silent fail
          }
        }

        return addCorsHeaders(response)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return addCorsHeaders(Response.json({ error: message }, { status: 500 }))
      }
    }

    // Legacy view routes (for backwards compatibility with default room)
    if (path === '/player') {
      return addSecurityHeaders(new Response(PLAYER_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }))
    }

    if (path === ADMIN_PATH) {
      return addSecurityHeaders(new Response(ADMIN_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }))
    }

    // Room-scoped routes: /{roomId}, /{roomId}/player, /{roomId}/admin
    const segments = path.split('/').filter(Boolean)
    if (segments.length >= 1) {
      const firstSegment = segments[0]!

      // Check if it's a valid room ID (not reserved and matches format)
      if (!RESERVED_PATHS.has(firstSegment) && ROOM_ID_REGEX.test(firstSegment)) {
        const subPath = '/' + segments.slice(1).join('/')

        if (subPath === '/') {
          return addSecurityHeaders(new Response(GUEST_HTML, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          }))
        }
        if (subPath === '/player') {
          return addSecurityHeaders(new Response(PLAYER_HTML, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          }))
        }
        if (subPath === ADMIN_PATH) {
          return addSecurityHeaders(new Response(ADMIN_HTML, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          }))
        }
      }
    }

    // Root path: landing page for room entry
    if (path === '/') {
      return addSecurityHeaders(new Response(LANDING_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }))
    }

    // 404 for unrecognized paths
    return addSecurityHeaders(new Response('Not found', { status: 404 }))
  },
}
