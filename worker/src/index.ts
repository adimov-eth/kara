import type { Env } from './env.js'
import { GUEST_HTML, PLAYER_HTML, ADMIN_HTML, LANDING_HTML } from './views/generated/index.js'

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

function addCorsHeaders(response: Response): Response {
  const newHeaders = new Headers(response.headers)
  for (const [key, value] of Object.entries(corsHeaders)) {
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

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
      return new Response(PLAYER_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    if (path === ADMIN_PATH) {
      return new Response(ADMIN_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    // Room-scoped routes: /{roomId}, /{roomId}/player, /{roomId}/admin
    const segments = path.split('/').filter(Boolean)
    if (segments.length >= 1) {
      const firstSegment = segments[0]!

      // Check if it's a valid room ID (not reserved and matches format)
      if (!RESERVED_PATHS.has(firstSegment) && ROOM_ID_REGEX.test(firstSegment)) {
        const subPath = '/' + segments.slice(1).join('/')

        if (subPath === '/') {
          return new Response(GUEST_HTML, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          })
        }
        if (subPath === '/player') {
          return new Response(PLAYER_HTML, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          })
        }
        if (subPath === ADMIN_PATH) {
          return new Response(ADMIN_HTML, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          })
        }
      }
    }

    // Root path: landing page for room entry
    if (path === '/') {
      return new Response(LANDING_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    // 404 for unrecognized paths
    return new Response('Not found', { status: 404 })
  },
}
