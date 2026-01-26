import type {
  LegacyQueueState,
  VoteRecord,
  ServerMessage,
  ClientMessage,
  Performance,
  Song,
  Identity,
} from '@karaoke/types'
import {
  sortQueue,
  createLegacyEntry,
  canJoinQueue,
  applyVote,
  advanceQueue,
  removeFromQueue,
  canRemoveEntry,
  canSkipCurrent,
  extractVideoId,
  parseSearchResponse,
  generateId,
  createPerformance,
  updateSongStats,
  calculatePopularity,
  isFirstPerformance,
  getPerformanceHistory,
  calculateSingerStats,
  generateSalt,
  hashPin,
  verifyPin,
  isValidPin,
  normalizeName,
} from '@karaoke/domain'

const STATE_KEY = 'state'
const VOTES_KEY = 'votes'
const PERFORMANCES_KEY = 'performances'

export class RoomDO implements DurableObject {
  private state: DurableObjectState
  private queueState: LegacyQueueState | null = null
  private votes: VoteRecord | null = null
  private performances: Performance[] | null = null
  // Track extension WebSockets separately (tags can't be updated after acceptWebSocket)
  private extensionSockets: Set<WebSocket> = new Set()

  constructor(state: DurableObjectState) {
    this.state = state
    // WebSocket connections are automatically restored from hibernation
    // via state.getWebSockets() - no explicit initialization needed
  }

  private async getQueueState(): Promise<LegacyQueueState> {
    if (!this.queueState) {
      const stored = await this.state.storage.get<LegacyQueueState>(STATE_KEY)
      this.queueState = stored ?? { queue: [], currentEpoch: 0, nowPlaying: null }
    }
    return this.queueState
  }

  private async saveQueueState(state: LegacyQueueState): Promise<void> {
    this.queueState = state
    await this.state.storage.put(STATE_KEY, state)
  }

  private async getVotes(): Promise<VoteRecord> {
    if (!this.votes) {
      const stored = await this.state.storage.get<VoteRecord>(VOTES_KEY)
      this.votes = stored ?? {}
    }
    return this.votes
  }

  private async saveVotes(votes: VoteRecord): Promise<void> {
    this.votes = votes
    await this.state.storage.put(VOTES_KEY, votes)
  }

  private async getPerformances(): Promise<Performance[]> {
    if (!this.performances) {
      const stored = await this.state.storage.get<Performance[]>(PERFORMANCES_KEY)
      this.performances = stored ?? []
    }
    return this.performances
  }

  private async savePerformances(performances: Performance[]): Promise<void> {
    this.performances = performances
    await this.state.storage.put(PERFORMANCES_KEY, performances)
  }

  private async getSong(videoId: string): Promise<Song | null> {
    return await this.state.storage.get<Song>(`song:${videoId}`) ?? null
  }

  private async saveSong(song: Song): Promise<void> {
    await this.state.storage.put(`song:${song.videoId}`, song)
  }

  private async getIdentity(name: string): Promise<Identity | null> {
    const key = `identity:${normalizeName(name)}`
    return await this.state.storage.get<Identity>(key) ?? null
  }

  private async saveIdentity(name: string, identity: Identity): Promise<void> {
    const key = `identity:${normalizeName(name)}`
    await this.state.storage.put(key, identity)
  }

  /**
   * Record a performance (when song completes or is skipped)
   * Returns { firstSong: boolean } indicating if this was the first completed song
   */
  private async recordPerformance(
    entry: { name: string; youtubeUrl: string; youtubeTitle: string; votes: number },
    completed: boolean
  ): Promise<{ firstSong: boolean }> {
    const now = Date.now()
    const performances = await this.getPerformances()
    const wasFirst = completed && isFirstPerformance(performances, entry.name)

    const performance = createPerformance(
      entry as any, // LegacyEntry compatible
      completed,
      generateId(),
      now
    )

    performances.push(performance)
    await this.savePerformances(performances)

    // Update song stats
    const videoId = extractVideoId(entry.youtubeUrl)
    if (videoId) {
      const existingSong = await this.getSong(videoId)
      const updatedSong = updateSongStats(existingSong, performance)
      await this.saveSong(updatedSong)
    }

    return { firstSong: wasFirst }
  }

  private getConnections(): WebSocket[] {
    // Use state.getWebSockets() for hibernation support
    return this.state.getWebSockets()
  }

  private hasExtensionConnected(): boolean {
    // Clean up any stale references first
    for (const ws of this.extensionSockets) {
      if (ws.readyState !== WebSocket.OPEN) {
        this.extensionSockets.delete(ws)
      }
    }
    return this.extensionSockets.size > 0
  }

  private broadcast(message: ServerMessage, exclude?: WebSocket): void {
    const data = JSON.stringify(message)
    for (const ws of this.getConnections()) {
      if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(data)
        } catch {
          // Connection dead, will be cleaned up
        }
      }
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message))
      } catch {
        // Ignore send errors
      }
    }
  }

  private broadcastState(): void {
    if (this.queueState) {
      this.broadcast({
        type: 'state',
        state: this.queueState,
        extensionConnected: this.hasExtensionConnected(),
      })
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request)
    }

    // HTTP API fallback (for compatibility)
    const path = url.pathname

    try {
      if (path === '/api/state') {
        return this.handleGetState()
      }
      if (path === '/api/join' && request.method === 'POST') {
        return this.handleJoin(request)
      }
      if (path === '/api/vote' && request.method === 'POST') {
        return this.handleVote(request)
      }
      if (path === '/api/remove' && request.method === 'POST') {
        return this.handleRemove(request)
      }
      if (path === '/api/skip' && request.method === 'POST') {
        return this.handleSkip(request)
      }
      if (path === '/api/next' && request.method === 'POST') {
        return this.handleNext(request)
      }
      if (path === '/api/reorder' && request.method === 'POST') {
        return this.handleReorder(request)
      }
      if (path === '/api/add' && request.method === 'POST') {
        return this.handleAdminAdd(request)
      }
      if (path === '/api/search' && request.method === 'GET') {
        return this.handleSearch(request)
      }
      if (path === '/api/import' && request.method === 'POST') {
        return this.handleImport(request)
      }

      // Identity & Performance endpoints
      if (path.startsWith('/api/history/') && request.method === 'GET') {
        const name = decodeURIComponent(path.slice('/api/history/'.length))
        return this.handleGetHistory(name)
      }
      if (path === '/api/songs/popular' && request.method === 'GET') {
        return this.handleGetPopularSongs(request)
      }
      if (path === '/api/claim' && request.method === 'POST') {
        return this.handleClaim(request)
      }
      if (path === '/api/verify' && request.method === 'POST') {
        return this.handleVerify(request)
      }
      if (path.startsWith('/api/identity/') && request.method === 'GET') {
        const name = decodeURIComponent(path.slice('/api/identity/'.length))
        return this.handleGetIdentity(name)
      }

      return new Response('Not found', { status: 404 })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return Response.json({ error: message }, { status: 500 })
    }
  }

  private handleWebSocket(_request: Request): Response {
    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]

    // Accept with default tag (will be updated on subscribe)
    this.state.acceptWebSocket(server, ['type:user'])

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return

    try {
      const msg = JSON.parse(message) as ClientMessage
      await this.handleClientMessage(ws, msg)
    } catch {
      this.send(ws, { type: 'error', message: 'Invalid message format' })
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    // Check if this was an extension
    const wasExtension = this.extensionSockets.has(ws)
    this.extensionSockets.delete(ws)

    // WebSocket is automatically removed from state.getWebSockets()
    // Notify clients if no extensions remain connected
    if (wasExtension && !this.hasExtensionConnected()) {
      this.broadcast({ type: 'extensionStatus', connected: false })
    }
  }

  async webSocketError(_ws: WebSocket): Promise<void> {
    // WebSocket is automatically removed from state.getWebSockets()
  }

  private async handleClientMessage(ws: WebSocket, msg: ClientMessage): Promise<void> {
    switch (msg.type) {
      case 'subscribe': {
        // Track extension connections separately
        if (msg.clientType === 'extension') {
          this.extensionSockets.add(ws)
        }

        const state = await this.getQueueState()
        this.send(ws, {
          type: 'state',
          state,
          extensionConnected: this.hasExtensionConnected(),
        })

        // If extension just connected, notify all other clients
        if (msg.clientType === 'extension') {
          this.broadcast({ type: 'extensionStatus', connected: true }, ws)
        }
        break
      }

      case 'ping': {
        this.send(ws, { type: 'pong' })
        break
      }

      case 'join': {
        const state = await this.getQueueState()
        const error = canJoinQueue(state, msg.name)
        if (error) {
          this.send(ws, { type: 'error', message: error })
          return
        }

        if (!extractVideoId(msg.youtubeUrl)) {
          this.send(ws, { type: 'error', message: 'Valid YouTube URL required' })
          return
        }

        const entry = createLegacyEntry({
          id: generateId(),
          name: msg.name,
          youtubeUrl: msg.youtubeUrl,
          youtubeTitle: msg.youtubeTitle,
          currentEpoch: state.currentEpoch,
          timestamp: Date.now(),
        })

        state.queue.push(entry)
        state.queue = sortQueue(state.queue)
        await this.saveQueueState(state)

        const position = state.queue.findIndex((e) => e.id === entry.id) + 1
        this.send(ws, { type: 'joined', entry, position })
        this.broadcastState()
        break
      }

      case 'vote': {
        const state = await this.getQueueState()
        const entryIndex = state.queue.findIndex((e) => e.id === msg.entryId)
        if (entryIndex === -1) {
          this.send(ws, { type: 'error', message: 'Entry not found' })
          return
        }

        const entry = state.queue[entryIndex]!
        const votes = await this.getVotes()
        const result = applyVote(entry, votes, msg.voterId, msg.direction)

        state.queue[entryIndex] = result.entry
        state.queue = sortQueue(state.queue)

        await this.saveQueueState(state)
        await this.saveVotes(result.votes)

        this.broadcast({ type: 'voted', entryId: msg.entryId, votes: result.entry.votes })
        this.broadcastState()
        break
      }

      case 'remove': {
        const state = await this.getQueueState()
        const entry = state.queue.find((e) => e.id === msg.entryId)
        if (!entry) {
          this.send(ws, { type: 'error', message: 'Entry not found' })
          return
        }

        if (!canRemoveEntry(entry, msg.isAdmin ?? false, msg.userName ?? null)) {
          this.send(ws, { type: 'error', message: 'Unauthorized' })
          return
        }

        const newState = removeFromQueue(state, msg.entryId)
        if (!newState) {
          this.send(ws, { type: 'error', message: 'Entry not found' })
          return
        }

        const votes = await this.getVotes()
        delete votes[msg.entryId]

        await this.saveQueueState(newState)
        await this.saveVotes(votes)

        this.broadcast({ type: 'removed', entryId: msg.entryId })
        this.broadcastState()
        break
      }

      case 'skip': {
        const state = await this.getQueueState()
        if (!canSkipCurrent(state.nowPlaying, msg.isAdmin ?? false, msg.userName ?? null)) {
          if (!state.nowPlaying) {
            this.send(ws, { type: 'error', message: 'Nothing is playing' })
          } else {
            this.send(ws, { type: 'error', message: 'Unauthorized' })
          }
          return
        }

        await this.doAdvanceQueue(state)
        break
      }

      case 'next': {
        const state = await this.getQueueState()
        const actualId = state.nowPlaying?.id ?? null
        if (msg.currentId !== actualId) {
          // State mismatch - don't advance, send current state
          this.send(ws, { type: 'state', state })
          return
        }

        await this.doAdvanceQueue(state)
        break
      }

      case 'reorder': {
        const state = await this.getQueueState()
        const entryIndex = state.queue.findIndex((e) => e.id === msg.entryId)
        if (entryIndex === -1) {
          this.send(ws, { type: 'error', message: 'Entry not found' })
          return
        }

        const entry = state.queue[entryIndex]!

        if (typeof msg.newEpoch === 'number') {
          entry.epoch = msg.newEpoch
        }

        if (typeof msg.newPosition === 'number') {
          state.queue.splice(entryIndex, 1)
          const targetIndex = Math.min(Math.max(0, msg.newPosition), state.queue.length)
          state.queue.splice(targetIndex, 0, entry)

          if (targetIndex > 0) {
            const prevEntry = state.queue[targetIndex - 1]
            if (prevEntry) {
              entry.epoch = prevEntry.epoch
              entry.joinedAt = prevEntry.joinedAt - 1
            }
          } else if (state.queue.length > 1) {
            const nextEntry = state.queue[1]
            if (nextEntry) {
              entry.epoch = nextEntry.epoch
              entry.joinedAt = nextEntry.joinedAt - 1
            }
          }
        } else {
          state.queue = sortQueue(state.queue)
        }

        await this.saveQueueState(state)
        this.broadcastState()
        break
      }

      case 'adminAdd': {
        if (!extractVideoId(msg.youtubeUrl)) {
          this.send(ws, { type: 'error', message: 'Valid YouTube URL required' })
          return
        }

        const state = await this.getQueueState()
        const entry = createLegacyEntry({
          id: generateId(),
          name: msg.name,
          youtubeUrl: msg.youtubeUrl,
          youtubeTitle: msg.youtubeTitle,
          currentEpoch: -1, // Plays next
          timestamp: Date.now(),
        })

        state.queue.unshift(entry)
        await this.saveQueueState(state)

        this.broadcast({ type: 'joined', entry, position: 1 })
        this.broadcastState()
        break
      }

      case 'ended': {
        // Extension reports video end - trigger queue advance
        const state = await this.getQueueState()
        const currentVideoId = state.nowPlaying
          ? extractVideoId(state.nowPlaying.youtubeUrl)
          : null

        // Only advance if video ID matches (idempotency)
        if (currentVideoId === msg.videoId) {
          await this.doAdvanceQueue(state)
        }
        // If mismatch, state broadcast will correct extension
        break
      }

      case 'error': {
        // Extension reports video error - log and advance to next
        console.log(`[RoomDO] Extension reported video error: ${msg.videoId} - ${msg.reason}`)
        const state = await this.getQueueState()
        const currentVideoId = state.nowPlaying
          ? extractVideoId(state.nowPlaying.youtubeUrl)
          : null

        // Only advance if video ID matches
        if (currentVideoId === msg.videoId) {
          await this.doAdvanceQueue(state)
        }
        break
      }
    }
  }

  private async doAdvanceQueue(state: LegacyQueueState): Promise<void> {
    const { state: newState, completed } = advanceQueue(state)

    if (completed) {
      const votes = await this.getVotes()
      delete votes[completed.id]
      await this.saveVotes(votes)
    }

    await this.saveQueueState(newState)
    this.broadcast({ type: 'advanced', nowPlaying: newState.nowPlaying, currentEpoch: newState.currentEpoch })
    this.broadcastState()
  }

  // HTTP handlers for backwards compatibility
  private async handleGetState(): Promise<Response> {
    const state = await this.getQueueState()
    return Response.json(state)
  }

  private async handleJoin(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      name?: string
      youtubeUrl?: string
      youtubeTitle?: string
      verified?: boolean  // Client claims they've verified PIN
    }
    const { name, youtubeUrl, youtubeTitle, verified } = body

    if (!name || name.trim() === '') {
      return Response.json({ error: 'Name required' }, { status: 400 })
    }
    if (!youtubeUrl || !extractVideoId(youtubeUrl)) {
      return Response.json({ error: 'Valid YouTube URL required' }, { status: 400 })
    }

    const trimmedName = name.trim()

    // Check if name is claimed with PIN
    const identity = await this.getIdentity(trimmedName)
    if (identity && !verified) {
      return Response.json({ requiresPin: true }, { status: 200 })
    }

    const state = await this.getQueueState()
    const joinError = canJoinQueue(state, name)
    if (joinError) {
      return Response.json({ error: joinError }, { status: 400 })
    }

    const entry = createLegacyEntry({
      id: generateId(),
      name: trimmedName,
      youtubeUrl,
      youtubeTitle: youtubeTitle ?? 'Unknown Song',
      currentEpoch: state.currentEpoch,
      timestamp: Date.now(),
    })

    state.queue.push(entry)
    state.queue = sortQueue(state.queue)
    await this.saveQueueState(state)

    const position = state.queue.findIndex((e) => e.id === entry.id) + 1
    this.broadcastState()
    return Response.json({ success: true, entry, position })
  }

  private async handleVote(request: Request): Promise<Response> {
    const body = (await request.json()) as { entryId?: string; direction?: number }
    const { entryId, direction } = body
    const voterId = request.headers.get('X-Voter-Id')

    if (!voterId) {
      return Response.json({ error: 'Voter ID required' }, { status: 400 })
    }
    if (!entryId) {
      return Response.json({ error: 'Entry ID required' }, { status: 400 })
    }
    if (direction !== 1 && direction !== -1 && direction !== 0) {
      return Response.json({ error: 'Direction must be 1, -1, or 0' }, { status: 400 })
    }

    const state = await this.getQueueState()
    const entryIndex = state.queue.findIndex((e) => e.id === entryId)

    if (entryIndex === -1) {
      return Response.json({ error: 'Entry not found' }, { status: 404 })
    }

    const entry = state.queue[entryIndex]!
    const votes = await this.getVotes()
    const result = applyVote(entry, votes, voterId, direction as 1 | -1 | 0)

    state.queue[entryIndex] = result.entry
    state.queue = sortQueue(state.queue)

    await this.saveQueueState(state)
    await this.saveVotes(result.votes)

    this.broadcastState()
    return Response.json({ success: true, newVotes: result.entry.votes })
  }

  private async handleRemove(request: Request): Promise<Response> {
    const body = (await request.json()) as { entryId?: string }
    const { entryId } = body
    const isAdmin = request.headers.get('X-Admin') === 'true'
    const userName = request.headers.get('X-User-Name')

    if (!entryId) {
      return Response.json({ error: 'Entry ID required' }, { status: 400 })
    }

    const state = await this.getQueueState()
    const entry = state.queue.find((e) => e.id === entryId)

    if (!entry) {
      return Response.json({ error: 'Entry not found' }, { status: 404 })
    }

    if (!canRemoveEntry(entry, isAdmin, userName)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const newState = removeFromQueue(state, entryId)
    if (!newState) {
      return Response.json({ error: 'Entry not found' }, { status: 404 })
    }

    const votes = await this.getVotes()
    delete votes[entryId]

    await this.saveQueueState(newState)
    await this.saveVotes(votes)

    this.broadcastState()
    return Response.json({ success: true })
  }

  private async handleSkip(request: Request): Promise<Response> {
    const isAdmin = request.headers.get('X-Admin') === 'true'
    const userName = request.headers.get('X-User-Name')

    const state = await this.getQueueState()

    if (!canSkipCurrent(state.nowPlaying, isAdmin, userName)) {
      if (!state.nowPlaying) {
        return Response.json({ error: 'Nothing is playing' }, { status: 400 })
      }
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Record as skipped performance
    if (state.nowPlaying) {
      await this.recordPerformance(state.nowPlaying, false)
    }

    return this.doAdvanceQueueHttp(state)
  }

  private async handleNext(request: Request): Promise<Response> {
    let expectedId: string | null = null
    try {
      const body = (await request.json()) as { currentId?: string | null }
      expectedId = body.currentId ?? null
    } catch {
      // No body is fine for backwards compatibility
    }

    const state = await this.getQueueState()
    const actualId = state.nowPlaying?.id ?? null

    if (expectedId !== actualId) {
      return Response.json({ success: false, reason: 'state_mismatch', nowPlaying: state.nowPlaying })
    }

    // Record as completed performance (song finished normally)
    let firstSong = false
    if (state.nowPlaying) {
      const result = await this.recordPerformance(state.nowPlaying, true)
      firstSong = result.firstSong
    }

    return this.doAdvanceQueueHttp(state, firstSong)
  }

  private async doAdvanceQueueHttp(state: LegacyQueueState, firstSong = false): Promise<Response> {
    const { state: newState, completed } = advanceQueue(state)

    if (completed) {
      const votes = await this.getVotes()
      delete votes[completed.id]
      await this.saveVotes(votes)
    }

    await this.saveQueueState(newState)
    this.broadcastState()
    return Response.json({
      success: true,
      nowPlaying: newState.nowPlaying,
      currentEpoch: newState.currentEpoch,
      firstSong, // Tell UI to show PIN prompt if this was their first completed song
    })
  }

  private async handleReorder(request: Request): Promise<Response> {
    const isAdmin = request.headers.get('X-Admin') === 'true'
    if (!isAdmin) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as { entryId?: string; newEpoch?: number; newPosition?: number }
    const { entryId, newEpoch, newPosition } = body

    if (!entryId) {
      return Response.json({ error: 'Entry ID required' }, { status: 400 })
    }

    const state = await this.getQueueState()
    const entryIndex = state.queue.findIndex((e) => e.id === entryId)

    if (entryIndex === -1) {
      return Response.json({ error: 'Entry not found' }, { status: 404 })
    }

    const entry = state.queue[entryIndex]!

    if (typeof newEpoch === 'number') {
      entry.epoch = newEpoch
    }

    if (typeof newPosition === 'number') {
      state.queue.splice(entryIndex, 1)
      const targetIndex = Math.min(Math.max(0, newPosition), state.queue.length)
      state.queue.splice(targetIndex, 0, entry)

      if (targetIndex > 0) {
        const prevEntry = state.queue[targetIndex - 1]
        if (prevEntry) {
          entry.epoch = prevEntry.epoch
          entry.joinedAt = prevEntry.joinedAt - 1
        }
      } else if (state.queue.length > 1) {
        const nextEntry = state.queue[1]
        if (nextEntry) {
          entry.epoch = nextEntry.epoch
          entry.joinedAt = nextEntry.joinedAt - 1
        }
      }
    } else {
      state.queue = sortQueue(state.queue)
    }

    await this.saveQueueState(state)
    this.broadcastState()
    return Response.json({ success: true, queue: state.queue })
  }

  private async handleAdminAdd(request: Request): Promise<Response> {
    const isAdmin = request.headers.get('X-Admin') === 'true'
    if (!isAdmin) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as { name?: string; youtubeUrl?: string; youtubeTitle?: string }
    const { name, youtubeUrl, youtubeTitle } = body

    if (!name || name.trim() === '') {
      return Response.json({ error: 'Name required' }, { status: 400 })
    }
    if (!youtubeUrl || !extractVideoId(youtubeUrl)) {
      return Response.json({ error: 'Valid YouTube URL required' }, { status: 400 })
    }

    const state = await this.getQueueState()

    const entry = createLegacyEntry({
      id: generateId(),
      name,
      youtubeUrl,
      youtubeTitle: youtubeTitle ?? 'Unknown Song',
      currentEpoch: -1,
      timestamp: Date.now(),
    })

    state.queue.unshift(entry)
    await this.saveQueueState(state)

    this.broadcastState()
    return Response.json({ success: true, entry })
  }

  private async handleSearch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const query = url.searchParams.get('q')

    if (!query || query.trim() === '') {
      return Response.json({ error: 'Query required' }, { status: 400 })
    }

    try {
      const response = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            client: { clientName: 'WEB', clientVersion: '2.20240101.00.00' },
          },
          query: query.trim(),
        }),
      })

      if (!response.ok) {
        return Response.json({ error: 'Search failed' }, { status: 502 })
      }

      const data: unknown = await response.json()
      const videos = parseSearchResponse(data)

      return Response.json({ results: videos })
    } catch {
      return Response.json({ error: 'Search request failed' }, { status: 502 })
    }
  }

  private async handleImport(request: Request): Promise<Response> {
    const body = (await request.json()) as { state?: LegacyQueueState; votes?: VoteRecord }
    const { state: importState, votes: importVotes } = body

    if (!importState) {
      return Response.json({ error: 'State required' }, { status: 400 })
    }

    // Only import if DO is currently empty
    const currentState = await this.getQueueState()
    if (currentState.queue.length > 0 || currentState.nowPlaying || currentState.currentEpoch > 0) {
      return Response.json({ success: false, reason: 'do_not_empty' })
    }

    await this.saveQueueState(importState)
    if (importVotes) {
      await this.saveVotes(importVotes)
    }

    this.broadcastState()
    return Response.json({ success: true, imported: true })
  }

  // =========================================================================
  // Identity & Performance Endpoints
  // =========================================================================

  private async handleGetHistory(name: string): Promise<Response> {
    if (!name || name.trim() === '') {
      return Response.json({ error: 'Name required' }, { status: 400 })
    }

    const performances = await this.getPerformances()
    const history = getPerformanceHistory(performances, name)
    const stats = calculateSingerStats(performances, name)
    const identity = await this.getIdentity(name)

    return Response.json({
      performances: history,
      totalSongs: stats.totalSongs,
      totalVotes: stats.totalVotes,
      completedSongs: stats.completedSongs,
      claimed: identity !== null,
    })
  }

  private async handleGetPopularSongs(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const limitParam = url.searchParams.get('limit')
    const limit = Math.min(Math.max(1, parseInt(limitParam ?? '20', 10) || 20), 100)

    // Get all songs from storage
    const allKeys = await this.state.storage.list<Song>({ prefix: 'song:' })
    const songs: Song[] = []

    for (const [, song] of allKeys) {
      songs.push(song)
    }

    // Sort by popularity
    songs.sort((a, b) => calculatePopularity(b) - calculatePopularity(a))

    return Response.json({
      songs: songs.slice(0, limit),
    })
  }

  private async handleClaim(request: Request): Promise<Response> {
    const body = (await request.json()) as { name?: string; pin?: string }
    const { name, pin } = body

    if (!name || name.trim() === '') {
      return Response.json({ error: 'Name required' }, { status: 400 })
    }
    if (!pin || !isValidPin(pin)) {
      return Response.json({ error: 'PIN must be 6 digits' }, { status: 400 })
    }

    const trimmedName = name.trim()

    // Check if already claimed
    const existing = await this.getIdentity(trimmedName)
    if (existing) {
      return Response.json({ error: 'Name already claimed' }, { status: 409 })
    }

    // Create identity
    const salt = generateSalt()
    const pinHash = await hashPin(pin, salt)
    const identity: Identity = {
      name: trimmedName,
      pinHash,
      salt,
      createdAt: Date.now(),
    }

    await this.saveIdentity(trimmedName, identity)

    return Response.json({ success: true })
  }

  private async handleVerify(request: Request): Promise<Response> {
    const body = (await request.json()) as { name?: string; pin?: string }
    const { name, pin } = body

    if (!name || name.trim() === '') {
      return Response.json({ error: 'Name required' }, { status: 400 })
    }
    if (!pin) {
      return Response.json({ error: 'PIN required' }, { status: 400 })
    }

    const trimmedName = name.trim()

    const identity = await this.getIdentity(trimmedName)
    if (!identity) {
      return Response.json({ error: 'Name not found' }, { status: 404 })
    }

    const valid = await verifyPin(pin, identity.salt, identity.pinHash)
    if (!valid) {
      return Response.json({ error: 'Invalid PIN' }, { status: 401 })
    }

    return Response.json({ success: true, name: identity.name })
  }

  private async handleGetIdentity(name: string): Promise<Response> {
    if (!name || name.trim() === '') {
      return Response.json({ error: 'Name required' }, { status: 400 })
    }

    const identity = await this.getIdentity(name)
    return Response.json({ claimed: identity !== null })
  }
}
