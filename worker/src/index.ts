import type { Env } from './env.js'
import { GUEST_HTML, PLAYER_HTML, ADMIN_HTML } from './views/generated/index.js'

// Re-export RoomDO for Cloudflare to find it
export { RoomDO } from './room.js'

const ADMIN_PATH = '/shikashika'
const DEFAULT_ROOM_ID = 'default'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Voter-Id, X-Admin, X-User-Name, Upgrade, Connection',
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
  async fetch(request: Request, env: Env): Promise<Response> {
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

    // API routes - proxy to DO
    if (path.startsWith('/api/')) {
      const roomId = url.searchParams.get('room') ?? DEFAULT_ROOM_ID
      const stub = getRoomStub(env, roomId)

      try {
        const response = await stub.fetch(request)
        return addCorsHeaders(response)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return addCorsHeaders(Response.json({ error: message }, { status: 500 }))
      }
    }

    // View routes
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

    // Default: guest view
    return new Response(GUEST_HTML, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  },
}
