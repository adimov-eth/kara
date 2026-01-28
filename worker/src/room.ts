import {
  assertNever,
  type QueueState,
  type Entry,
  type LegacyQueueState,
  type LegacyEntry,
  type LegacyPerformance,
  type VoteRecord,
  type ServerMessage,
  type ClientMessage,
  type Performance,
  type PerformanceOutcome,
  type Identity,
  type RoomConfig,
  type RoomAdmin,
  type AdminSession,
  type JoinResult,
  type VoteResult,
  type RemoveResult,
  type SkipResult,
  type NextResult,
  type ClaimResult,
  type VerifyResult,
  type SearchQueryResult,
  type ReorderResult,
  type PopularSongsResult,
  type CreateRoomResult,
  type CheckRoomResult,
  type AdminVerifyResult,
} from '@karaoke/types'
import {
  sortQueue,
  createEntry,
  canJoinQueue,
  applyVote,
  advanceQueue,
  removeFromQueue,
  canRemoveEntry,
  canSkipCurrent,
  reorderEntry,
  extractVideoId,
  parseSearchResponse,
  generateId,
  createPerformance,
  isFirstPerformance,
  getPerformanceHistory,
  calculateSingerStats,
  getPopularSongs,
  generateSalt,
  hashPin,
  verifyPin,
  isValidPin,
  normalizeName,
} from '@karaoke/domain'

const STATE_KEY = 'state'
const VOTES_KEY = 'votes'
const PERFORMANCES_KEY = 'performances'
const CONFIG_KEY = 'config'
const ADMIN_KEY = 'admin'

const ADMIN_SESSION_DURATION_MS = 4 * 60 * 60 * 1000 // 4 hours
const PIN_RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute
const PIN_RATE_LIMIT_MAX_ATTEMPTS = 5

interface RateLimitEntry {
  attempts: number
  windowStart: number
}

export class RoomDO implements DurableObject {
  private state: DurableObjectState
  private queueState: QueueState | null = null
  private votes: VoteRecord | null = null
  private performances: Performance[] | null = null
  private roomConfig: RoomConfig | null = null
  private roomAdmin: RoomAdmin | null = null
  // Admin sessions (in-memory, not persisted - sessions clear on DO restart)
  private adminSessions: Map<string, AdminSession> = new Map()
  // Rate limiting for PIN attempts (in-memory)
  private pinRateLimits: Map<string, RateLimitEntry> = new Map()
  // Track extension WebSockets separately (tags can't be updated after acceptWebSocket)
  private extensionSockets: Set<WebSocket> = new Set()

  constructor(state: DurableObjectState) {
    this.state = state
    // WebSocket connections are automatically restored from hibernation
    // via state.getWebSockets() - no explicit initialization needed
  }

  private async getQueueState(): Promise<QueueState> {
    if (!this.queueState) {
      const stored = await this.state.storage.get<QueueState | LegacyQueueState>(STATE_KEY)
      this.queueState = stored ? this.migrateState(stored) : { queue: [], currentEpoch: 0, nowPlaying: null }
    }
    return this.queueState
  }

  private migrateState(stored: QueueState | LegacyQueueState): QueueState {
    // Detect legacy format by checking first entry or nowPlaying
    const firstEntry = stored.queue[0] ?? stored.nowPlaying
    const needsMigration = firstEntry && 'youtubeUrl' in firstEntry
    if (!needsMigration) return stored as QueueState

    const legacy = stored as LegacyQueueState
    return {
      queue: legacy.queue.map((e) => this.migrateEntry(e)),
      currentEpoch: legacy.currentEpoch,
      nowPlaying: legacy.nowPlaying ? this.migrateEntry(legacy.nowPlaying) : null,
    }
  }

  private migrateEntry(legacy: LegacyEntry): Entry {
    return {
      id: legacy.id,
      name: legacy.name,
      videoId: extractVideoId(legacy.youtubeUrl) ?? '',
      title: legacy.youtubeTitle,
      source: 'youtube',
      votes: legacy.votes,
      epoch: legacy.epoch,
      joinedAt: legacy.joinedAt,
    }
  }

  private async saveQueueState(state: QueueState): Promise<void> {
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
      const stored = await this.state.storage.get<Performance[] | LegacyPerformance[]>(PERFORMANCES_KEY)
      this.performances = stored ? this.migratePerformances(stored) : []
    }
    return this.performances
  }

  private migratePerformances(stored: Performance[] | LegacyPerformance[]): Performance[] {
    if (stored.length === 0) return []
    // Detect legacy format by checking first entry for 'completed' boolean
    const first = stored[0]!
    if ('completed' in first && typeof first.completed === 'boolean') {
      // Migrate legacy format
      return (stored as LegacyPerformance[]).map((legacy): Performance => ({
        id: legacy.id,
        name: legacy.name,
        videoId: legacy.videoId,
        title: legacy.title,
        performedAt: legacy.performedAt,
        votes: legacy.votes,
        outcome: legacy.completed
          ? { kind: 'completed' }
          : { kind: 'skipped', by: 'admin' } // Can't distinguish who skipped in legacy data
      }))
    }
    return stored as Performance[]
  }

  private async savePerformances(performances: Performance[]): Promise<void> {
    this.performances = performances
    await this.state.storage.put(PERFORMANCES_KEY, performances)
  }

  private async getIdentity(name: string): Promise<Identity | null> {
    const key = `identity:${normalizeName(name)}`
    return await this.state.storage.get<Identity>(key) ?? null
  }

  private async saveIdentity(name: string, identity: Identity): Promise<void> {
    const key = `identity:${normalizeName(name)}`
    await this.state.storage.put(key, identity)
  }

  // =========================================================================
  // Room Config & Admin Methods
  // =========================================================================

  private async getRoomConfig(): Promise<RoomConfig | null> {
    if (this.roomConfig === null) {
      this.roomConfig = await this.state.storage.get<RoomConfig>(CONFIG_KEY) ?? null
    }
    return this.roomConfig
  }

  private async saveRoomConfig(config: RoomConfig): Promise<void> {
    this.roomConfig = config
    await this.state.storage.put(CONFIG_KEY, config)
  }

  private async getRoomAdmin(): Promise<RoomAdmin | null> {
    if (this.roomAdmin === null) {
      this.roomAdmin = await this.state.storage.get<RoomAdmin>(ADMIN_KEY) ?? null
    }
    return this.roomAdmin
  }

  private async saveRoomAdmin(admin: RoomAdmin): Promise<void> {
    this.roomAdmin = admin
    await this.state.storage.put(ADMIN_KEY, admin)
  }

  private createAdminSession(): AdminSession {
    // Generate random 64-char hex token
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    const token = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    const now = Date.now()
    const session: AdminSession = {
      token,
      createdAt: now,
      expiresAt: now + ADMIN_SESSION_DURATION_MS,
    }

    this.adminSessions.set(token, session)
    return session
  }

  private isValidAdminToken(token: string | null): boolean {
    if (!token) return false
    const session = this.adminSessions.get(token)
    if (!session) return false
    if (Date.now() > session.expiresAt) {
      this.adminSessions.delete(token)
      return false
    }
    return true
  }

  private extractAdminToken(request: Request): string | null {
    const authHeader = request.headers.get('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7)
    }
    return null
  }

  /**
   * Check if request is authorized as admin.
   * Requires valid token if room has admin configured.
   * Allows X-Admin header only for rooms without admin (legacy/default room).
   */
  private async isAdminRequest(request: Request): Promise<boolean> {
    const token = this.extractAdminToken(request)
    if (this.isValidAdminToken(token)) {
      return true
    }
    // Allow X-Admin header only for rooms without admin configured
    const admin = await this.getRoomAdmin()
    if (!admin && request.headers.get('X-Admin') === 'true') {
      return true
    }
    return false
  }

  /**
   * Check rate limit for PIN attempts. Returns true if request should be blocked.
   */
  private checkPinRateLimit(clientId: string): boolean {
    const now = Date.now()
    const entry = this.pinRateLimits.get(clientId)

    if (!entry || now - entry.windowStart > PIN_RATE_LIMIT_WINDOW_MS) {
      // New window
      this.pinRateLimits.set(clientId, { attempts: 1, windowStart: now })
      return false
    }

    if (entry.attempts >= PIN_RATE_LIMIT_MAX_ATTEMPTS) {
      return true // Blocked
    }

    entry.attempts++
    return false
  }

  /**
   * Get client identifier for rate limiting (IP or fallback)
   */
  private getClientId(request: Request): string {
    return request.headers.get('CF-Connecting-IP') ||
           request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
           'unknown'
  }

  /**
   * Record a performance (when song completes or is skipped)
   * Returns { firstSong: boolean } indicating if this was the first completed song
   */
  private async recordPerformance(
    entry: Entry,
    outcome: PerformanceOutcome
  ): Promise<{ firstSong: boolean }> {
    const now = Date.now()
    const performances = await this.getPerformances()
    const wasFirst = outcome.kind === 'completed' && isFirstPerformance(performances, entry.name)

    const performance = createPerformance(
      entry,
      outcome,
      generateId(),
      now
    )

    performances.push(performance)
    await this.savePerformances(performances)

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
        kind: 'state',
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

      // Room management endpoints
      if (path === '/api/room/check' && request.method === 'GET') {
        return this.handleCheckRoom()
      }
      if (path === '/api/room/create' && request.method === 'POST') {
        return this.handleCreateRoom(request)
      }
      if (path === '/api/room/config' && request.method === 'GET') {
        return this.handleGetConfig()
      }
      if (path === '/api/admin/verify' && request.method === 'POST') {
        return this.handleAdminVerify(request)
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
      this.send(ws, { kind: 'error', message: 'Invalid message format' })
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    // Check if this was an extension
    const wasExtension = this.extensionSockets.has(ws)
    this.extensionSockets.delete(ws)

    // WebSocket is automatically removed from state.getWebSockets()
    // Notify clients if no extensions remain connected
    if (wasExtension && !this.hasExtensionConnected()) {
      this.broadcast({ kind: 'extensionStatus', connected: false })
    }
  }

  async webSocketError(_ws: WebSocket): Promise<void> {
    // WebSocket is automatically removed from state.getWebSockets()
  }

  private async handleClientMessage(ws: WebSocket, msg: ClientMessage): Promise<void> {
    switch (msg.kind) {
      case 'subscribe': {
        // Track extension connections separately
        if (msg.clientType === 'extension') {
          this.extensionSockets.add(ws)
        }

        const state = await this.getQueueState()
        this.send(ws, {
          kind: 'state',
          state,
          extensionConnected: this.hasExtensionConnected(),
        })

        // If extension just connected, notify all other clients
        if (msg.clientType === 'extension') {
          this.broadcast({ kind: 'extensionStatus', connected: true }, ws)
        }
        break
      }

      case 'ping': {
        this.send(ws, { kind: 'pong' })
        break
      }

      case 'join': {
        const state = await this.getQueueState()
        const error = canJoinQueue(state, msg.name)
        if (error) {
          this.send(ws, { kind: 'error', message: error })
          return
        }

        if (!msg.videoId) {
          this.send(ws, { kind: 'error', message: 'Video ID required' })
          return
        }

        const entry = createEntry({
          id: generateId(),
          name: msg.name,
          videoId: msg.videoId,
          title: msg.title,
          source: 'youtube',
          currentEpoch: state.currentEpoch,
          timestamp: Date.now(),
        })

        state.queue.push(entry)
        state.queue = sortQueue(state.queue)
        await this.saveQueueState(state)

        const position = state.queue.findIndex((e) => e.id === entry.id) + 1
        this.send(ws, { kind: 'joined', entry, position })
        this.broadcastState()
        break
      }

      case 'vote': {
        const state = await this.getQueueState()
        const entryIndex = state.queue.findIndex((e) => e.id === msg.entryId)
        if (entryIndex === -1) {
          this.send(ws, { kind: 'error', message: 'Entry not found' })
          return
        }

        const entry = state.queue[entryIndex]!
        const votes = await this.getVotes()
        const result = applyVote(entry, votes, msg.voterId, msg.direction)

        state.queue[entryIndex] = result.entry
        state.queue = sortQueue(state.queue)

        await this.saveQueueState(state)
        await this.saveVotes(result.votes)

        this.broadcast({ kind: 'voted', entryId: msg.entryId, votes: result.entry.votes })
        this.broadcastState()
        break
      }

      case 'remove': {
        const state = await this.getQueueState()
        const entry = state.queue.find((e) => e.id === msg.entryId)
        if (!entry) {
          this.send(ws, { kind: 'error', message: 'Entry not found' })
          return
        }

        if (!canRemoveEntry(entry, msg.isAdmin ?? false, msg.userName ?? null)) {
          this.send(ws, { kind: 'error', message: 'Unauthorized' })
          return
        }

        const newState = removeFromQueue(state, msg.entryId)
        if (!newState) {
          this.send(ws, { kind: 'error', message: 'Entry not found' })
          return
        }

        const votes = await this.getVotes()
        delete votes[msg.entryId]

        await this.saveQueueState(newState)
        await this.saveVotes(votes)

        this.broadcast({ kind: 'removed', entryId: msg.entryId })
        this.broadcastState()
        break
      }

      case 'skip': {
        const state = await this.getQueueState()
        const isAdmin = msg.isAdmin ?? false
        if (!canSkipCurrent(state.nowPlaying, isAdmin, msg.userName ?? null)) {
          if (!state.nowPlaying) {
            this.send(ws, { kind: 'error', message: 'Nothing is playing' })
          } else {
            this.send(ws, { kind: 'error', message: 'Unauthorized' })
          }
          return
        }

        const skippedBy = isAdmin ? 'admin' : 'singer' as const
        await this.doAdvanceQueue(state, { kind: 'skipped', by: skippedBy })
        break
      }

      case 'next': {
        const state = await this.getQueueState()
        const actualId = state.nowPlaying?.id ?? null
        if (msg.currentId !== actualId) {
          // State mismatch - don't advance, send current state
          this.send(ws, { kind: 'state', state })
          return
        }

        await this.doAdvanceQueue(state, { kind: 'completed' })
        break
      }

      case 'reorder': {
        const state = await this.getQueueState()

        if (typeof msg.newEpoch === 'number') {
          const entry = state.queue.find((e) => e.id === msg.entryId)
          if (!entry) {
            this.send(ws, { kind: 'error', message: 'Entry not found' })
            return
          }
          entry.epoch = msg.newEpoch
          state.queue = sortQueue(state.queue)
        } else if (typeof msg.newPosition === 'number') {
          const newQueue = reorderEntry(state.queue, msg.entryId, msg.newPosition)
          if (!newQueue) {
            this.send(ws, { kind: 'error', message: 'Entry not found' })
            return
          }
          state.queue = newQueue
        } else {
          this.send(ws, { kind: 'error', message: 'newEpoch or newPosition required' })
          return
        }

        await this.saveQueueState(state)
        this.broadcastState()
        break
      }

      case 'adminAdd': {
        if (!msg.videoId) {
          this.send(ws, { kind: 'error', message: 'Video ID required' })
          return
        }

        const state = await this.getQueueState()
        const entry = createEntry({
          id: generateId(),
          name: msg.name,
          videoId: msg.videoId,
          title: msg.title,
          source: 'youtube',
          currentEpoch: -1, // Plays next
          timestamp: Date.now(),
        })

        state.queue.unshift(entry)
        await this.saveQueueState(state)

        this.broadcast({ kind: 'joined', entry, position: 1 })
        this.broadcastState()
        break
      }

      case 'ended': {
        // Extension reports video end - trigger queue advance
        const state = await this.getQueueState()
        const currentVideoId = state.nowPlaying?.videoId ?? null

        // Only advance if video ID matches (idempotency)
        if (currentVideoId === msg.videoId) {
          await this.doAdvanceQueue(state, { kind: 'completed' })
        }
        // If mismatch, state broadcast will correct extension
        break
      }

      case 'error': {
        // Extension reports video error - log and advance to next
        console.log(`[RoomDO] Extension reported video error: ${msg.videoId} - ${msg.reason}`)
        const state = await this.getQueueState()
        const currentVideoId = state.nowPlaying?.videoId ?? null

        // Only advance if video ID matches
        if (currentVideoId === msg.videoId) {
          await this.doAdvanceQueue(state, { kind: 'errored', reason: msg.reason })
        }
        break
      }

      default:
        assertNever(msg)
    }
  }

  /**
   * Core queue advancement logic - shared by WebSocket and HTTP handlers
   * Records performance, advances queue, cleans up votes, broadcasts
   */
  private async doAdvanceQueueCore(
    state: QueueState,
    outcome: PerformanceOutcome
  ): Promise<{ newState: QueueState; firstSong: boolean }> {
    // Record performance before advancing
    let firstSong = false
    if (state.nowPlaying) {
      const recordResult = await this.recordPerformance(state.nowPlaying, outcome)
      firstSong = recordResult.firstSong
    }

    const { state: newState, completed } = advanceQueue(state)

    if (completed) {
      const votes = await this.getVotes()
      delete votes[completed.id]
      await this.saveVotes(votes)
    }

    await this.saveQueueState(newState)
    this.broadcast({ kind: 'advanced', nowPlaying: newState.nowPlaying, currentEpoch: newState.currentEpoch })
    this.broadcastState()

    return { newState, firstSong }
  }

  private async doAdvanceQueue(state: QueueState, outcome: PerformanceOutcome): Promise<void> {
    await this.doAdvanceQueueCore(state, outcome)
  }

  // HTTP handlers for backwards compatibility
  private async handleGetState(): Promise<Response> {
    const state = await this.getQueueState()
    return Response.json(state)
  }

  private async handleJoin(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      name?: string
      videoId?: string
      title?: string
      verified?: boolean  // Client claims they've verified PIN
    }
    const { name, videoId, title, verified } = body

    if (!name || name.trim() === '') {
      const result: JoinResult = { kind: 'error', message: 'Name required' }
      return Response.json(result, { status: 400 })
    }
    if (!videoId) {
      const result: JoinResult = { kind: 'invalidVideo', reason: 'Video ID required' }
      return Response.json(result, { status: 400 })
    }

    const trimmedName = name.trim()

    // Check if name is claimed with PIN
    const identity = await this.getIdentity(trimmedName)
    if (identity && !verified) {
      const result: JoinResult = { kind: 'requiresPin' }
      return Response.json(result)
    }

    const state = await this.getQueueState()
    const joinError = canJoinQueue(state, name)
    if (joinError) {
      // Check if the error is about already being in queue
      if (joinError.includes('already in queue')) {
        const result: JoinResult = { kind: 'alreadyInQueue', name: trimmedName }
        return Response.json(result, { status: 400 })
      }
      const result: JoinResult = { kind: 'error', message: joinError }
      return Response.json(result, { status: 400 })
    }

    const entry = createEntry({
      id: generateId(),
      name: trimmedName,
      videoId,
      title: title ?? 'Unknown Song',
      source: 'youtube',
      currentEpoch: state.currentEpoch,
      timestamp: Date.now(),
    })

    state.queue.push(entry)
    state.queue = sortQueue(state.queue)
    await this.saveQueueState(state)

    const position = state.queue.findIndex((e) => e.id === entry.id) + 1
    this.broadcastState()
    const result: JoinResult = { kind: 'joined', entry, position }
    return Response.json(result)
  }

  private async handleVote(request: Request): Promise<Response> {
    const body = (await request.json()) as { entryId?: string; direction?: number }
    const { entryId, direction } = body
    const voterId = request.headers.get('X-Voter-Id')

    if (!voterId) {
      const result: VoteResult = { kind: 'error', message: 'Voter ID required' }
      return Response.json(result, { status: 400 })
    }
    if (!entryId) {
      const result: VoteResult = { kind: 'error', message: 'Entry ID required' }
      return Response.json(result, { status: 400 })
    }
    if (direction !== 1 && direction !== -1 && direction !== 0) {
      const result: VoteResult = { kind: 'error', message: 'Direction must be 1, -1, or 0' }
      return Response.json(result, { status: 400 })
    }

    const state = await this.getQueueState()
    const entryIndex = state.queue.findIndex((e) => e.id === entryId)

    if (entryIndex === -1) {
      const result: VoteResult = { kind: 'entryNotFound' }
      return Response.json(result, { status: 404 })
    }

    const entry = state.queue[entryIndex]!
    const votes = await this.getVotes()
    const voteResult = applyVote(entry, votes, voterId, direction as 1 | -1 | 0)

    state.queue[entryIndex] = voteResult.entry
    state.queue = sortQueue(state.queue)

    await this.saveQueueState(state)
    await this.saveVotes(voteResult.votes)

    this.broadcastState()
    const result: VoteResult = { kind: 'voted', entryId, newVotes: voteResult.entry.votes }
    return Response.json(result)
  }

  private async handleRemove(request: Request): Promise<Response> {
    const body = (await request.json()) as { entryId?: string }
    const { entryId } = body
    const isAdmin = await this.isAdminRequest(request)
    const userName = request.headers.get('X-User-Name')

    if (!entryId) {
      const result: RemoveResult = { kind: 'error', message: 'Entry ID required' }
      return Response.json(result, { status: 400 })
    }

    const state = await this.getQueueState()
    const entry = state.queue.find((e) => e.id === entryId)

    if (!entry) {
      const result: RemoveResult = { kind: 'entryNotFound' }
      return Response.json(result, { status: 404 })
    }

    if (!canRemoveEntry(entry, isAdmin, userName)) {
      const result: RemoveResult = { kind: 'unauthorized' }
      return Response.json(result, { status: 401 })
    }

    const newState = removeFromQueue(state, entryId)
    if (!newState) {
      const result: RemoveResult = { kind: 'entryNotFound' }
      return Response.json(result, { status: 404 })
    }

    const votes = await this.getVotes()
    delete votes[entryId]

    await this.saveQueueState(newState)
    await this.saveVotes(votes)

    this.broadcastState()
    const result: RemoveResult = { kind: 'removed', entryId }
    return Response.json(result)
  }

  private async handleSkip(request: Request): Promise<Response> {
    const isAdmin = await this.isAdminRequest(request)
    const userName = request.headers.get('X-User-Name')

    const state = await this.getQueueState()

    if (!canSkipCurrent(state.nowPlaying, isAdmin, userName)) {
      if (!state.nowPlaying) {
        const result: SkipResult = { kind: 'nothingPlaying' }
        return Response.json(result, { status: 400 })
      }
      const result: SkipResult = { kind: 'unauthorized' }
      return Response.json(result, { status: 401 })
    }

    const skippedBy = isAdmin ? 'admin' : 'singer' as const
    return this.doAdvanceQueueHttpSkip(state, skippedBy)
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
      const result: NextResult = { kind: 'stateMismatch', nowPlaying: state.nowPlaying }
      return Response.json(result)
    }

    return this.doAdvanceQueueHttpNext(state)
  }

  private async doAdvanceQueueHttpNext(state: QueueState): Promise<Response> {
    const { newState, firstSong } = await this.doAdvanceQueueCore(state, { kind: 'completed' })
    const result: NextResult = {
      kind: 'advanced',
      nowPlaying: newState.nowPlaying,
      currentEpoch: newState.currentEpoch,
      firstSong,
    }
    return Response.json(result)
  }

  private async doAdvanceQueueHttpSkip(state: QueueState, skippedBy: 'singer' | 'admin'): Promise<Response> {
    const { newState } = await this.doAdvanceQueueCore(state, { kind: 'skipped', by: skippedBy })
    const result: SkipResult = {
      kind: 'skipped',
      nowPlaying: newState.nowPlaying,
      currentEpoch: newState.currentEpoch,
    }
    return Response.json(result)
  }

  private async handleReorder(request: Request): Promise<Response> {
    const isAdmin = await this.isAdminRequest(request)
    if (!isAdmin) {
      const result: ReorderResult = { kind: 'unauthorized' }
      return Response.json(result, { status: 401 })
    }

    const body = (await request.json()) as { entryId?: string; newEpoch?: number; newPosition?: number }
    const { entryId, newEpoch, newPosition } = body

    if (!entryId) {
      const result: ReorderResult = { kind: 'error', message: 'Entry ID required' }
      return Response.json(result, { status: 400 })
    }

    const state = await this.getQueueState()

    if (typeof newEpoch === 'number') {
      const entry = state.queue.find((e) => e.id === entryId)
      if (!entry) {
        const result: ReorderResult = { kind: 'entryNotFound' }
        return Response.json(result, { status: 404 })
      }
      entry.epoch = newEpoch
      state.queue = sortQueue(state.queue)
    } else if (typeof newPosition === 'number') {
      const newQueue = reorderEntry(state.queue, entryId, newPosition)
      if (!newQueue) {
        const result: ReorderResult = { kind: 'entryNotFound' }
        return Response.json(result, { status: 404 })
      }
      state.queue = newQueue
    } else {
      const result: ReorderResult = { kind: 'error', message: 'newEpoch or newPosition required' }
      return Response.json(result, { status: 400 })
    }

    await this.saveQueueState(state)
    this.broadcastState()
    const result: ReorderResult = { kind: 'reordered', queue: state.queue }
    return Response.json(result)
  }

  private async handleAdminAdd(request: Request): Promise<Response> {
    const isAdmin = await this.isAdminRequest(request)
    if (!isAdmin) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as { name?: string; videoId?: string; title?: string }
    const { name, videoId, title } = body

    if (!name || name.trim() === '') {
      return Response.json({ error: 'Name required' }, { status: 400 })
    }
    if (!videoId) {
      return Response.json({ error: 'Video ID required' }, { status: 400 })
    }

    const state = await this.getQueueState()

    const entry = createEntry({
      id: generateId(),
      name,
      videoId,
      title: title ?? 'Unknown Song',
      source: 'youtube',
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
      const result: SearchQueryResult = { kind: 'error', message: 'Query required' }
      return Response.json(result, { status: 400 })
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
        const result: SearchQueryResult = { kind: 'error', message: 'Search failed' }
        return Response.json(result, { status: 502 })
      }

      const data: unknown = await response.json()
      const videos = parseSearchResponse(data)

      const result: SearchQueryResult = { kind: 'results', results: videos }
      return Response.json(result)
    } catch {
      const result: SearchQueryResult = { kind: 'error', message: 'Search request failed' }
      return Response.json(result, { status: 502 })
    }
  }

  private async handleImport(request: Request): Promise<Response> {
    const body = (await request.json()) as { state?: QueueState | LegacyQueueState; votes?: VoteRecord }
    const { state: importState, votes: importVotes } = body

    if (!importState) {
      return Response.json({ error: 'State required' }, { status: 400 })
    }

    // Only import if DO is currently empty
    const currentState = await this.getQueueState()
    if (currentState.queue.length > 0 || currentState.nowPlaying || currentState.currentEpoch > 0) {
      return Response.json({ success: false, reason: 'do_not_empty' })
    }

    // Migrate the imported state if needed
    const migratedState = this.migrateState(importState)
    await this.saveQueueState(migratedState)
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

    // Derive from performance history
    const performances = await this.getPerformances()
    const songs = getPopularSongs(performances, limit)

    const result: PopularSongsResult = { kind: 'songs', songs }
    return Response.json(result)
  }

  private async handleClaim(request: Request): Promise<Response> {
    const body = (await request.json()) as { name?: string; pin?: string }
    const { name, pin } = body

    if (!name || name.trim() === '') {
      const result: ClaimResult = { kind: 'error', message: 'Name required' }
      return Response.json(result, { status: 400 })
    }
    if (!pin || !isValidPin(pin)) {
      const result: ClaimResult = { kind: 'invalidPin', reason: 'PIN must be 6 digits' }
      return Response.json(result, { status: 400 })
    }

    const trimmedName = name.trim()

    // Check if already claimed
    const existing = await this.getIdentity(trimmedName)
    if (existing) {
      const result: ClaimResult = { kind: 'alreadyClaimed' }
      return Response.json(result, { status: 409 })
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

    const result: ClaimResult = { kind: 'claimed' }
    return Response.json(result)
  }

  private async handleVerify(request: Request): Promise<Response> {
    const body = (await request.json()) as { name?: string; pin?: string }
    const { name, pin } = body

    if (!name || name.trim() === '') {
      const result: VerifyResult = { kind: 'error', message: 'Name required' }
      return Response.json(result, { status: 400 })
    }
    if (!pin) {
      const result: VerifyResult = { kind: 'error', message: 'PIN required' }
      return Response.json(result, { status: 400 })
    }

    const trimmedName = name.trim()

    const identity = await this.getIdentity(trimmedName)
    if (!identity) {
      const result: VerifyResult = { kind: 'nameNotFound' }
      return Response.json(result, { status: 404 })
    }

    const valid = await verifyPin(pin, identity.salt, identity.pinHash)
    if (!valid) {
      const result: VerifyResult = { kind: 'invalidPin' }
      return Response.json(result, { status: 401 })
    }

    const result: VerifyResult = { kind: 'verified', name: identity.name }
    return Response.json(result)
  }

  private async handleGetIdentity(name: string): Promise<Response> {
    if (!name || name.trim() === '') {
      return Response.json({ error: 'Name required' }, { status: 400 })
    }

    const identity = await this.getIdentity(name)
    return Response.json({ claimed: identity !== null })
  }

  // =========================================================================
  // Room Management Endpoints
  // =========================================================================

  private async handleCheckRoom(): Promise<Response> {
    const config = await this.getRoomConfig()
    if (!config) {
      const result: CheckRoomResult = { kind: 'notFound' }
      return Response.json(result)
    }
    const result: CheckRoomResult = { kind: 'exists', config }
    return Response.json(result)
  }

  private async handleCreateRoom(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      roomId?: string
      displayName?: string
      pin?: string
    }
    const { roomId, displayName, pin } = body

    if (!roomId) {
      const result: CreateRoomResult = { kind: 'invalidRoomId', reason: 'Room ID required' }
      return Response.json(result, { status: 400 })
    }

    // Validate room ID format: 2-30 chars, lowercase alphanumeric + hyphens
    if (!/^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$|^[a-z0-9]{1,2}$/.test(roomId)) {
      const result: CreateRoomResult = {
        kind: 'invalidRoomId',
        reason: 'Room ID must be 2-30 characters, lowercase letters, numbers, and hyphens only (no leading/trailing hyphens)',
      }
      return Response.json(result, { status: 400 })
    }

    // Check reserved names
    const reserved = new Set(['api', 'player', 'admin', 'shikashika'])
    if (reserved.has(roomId)) {
      const result: CreateRoomResult = {
        kind: 'invalidRoomId',
        reason: `"${roomId}" is a reserved name`,
      }
      return Response.json(result, { status: 400 })
    }

    // Validate PIN
    if (!pin || !isValidPin(pin)) {
      const result: CreateRoomResult = { kind: 'invalidPin', reason: 'PIN must be 6 digits' }
      return Response.json(result, { status: 400 })
    }

    // Check if room already exists
    const existingConfig = await this.getRoomConfig()
    if (existingConfig) {
      const result: CreateRoomResult = { kind: 'alreadyExists' }
      return Response.json(result, { status: 409 })
    }

    // Create room config
    const config: RoomConfig = {
      id: roomId,
      displayName: displayName?.trim() || roomId,
      createdAt: Date.now(),
      maxQueueSize: 50,
      allowVoting: true,
    }

    // Create admin
    const salt = generateSalt()
    const pinHash = await hashPin(pin, salt)
    const admin: RoomAdmin = {
      pinHash,
      salt,
      createdAt: Date.now(),
    }

    await this.saveRoomConfig(config)
    await this.saveRoomAdmin(admin)

    const result: CreateRoomResult = { kind: 'created', roomId, config }
    return Response.json(result)
  }

  private async handleGetConfig(): Promise<Response> {
    const config = await this.getRoomConfig()
    if (!config) {
      return Response.json({ error: 'Room not found' }, { status: 404 })
    }
    return Response.json(config)
  }

  private async handleAdminVerify(request: Request): Promise<Response> {
    // Rate limit PIN attempts
    const clientId = this.getClientId(request)
    if (this.checkPinRateLimit(clientId)) {
      const result: AdminVerifyResult = { kind: 'error', message: 'Too many attempts. Try again in 1 minute.' }
      return Response.json(result, { status: 429 })
    }

    const body = (await request.json()) as { pin?: string }
    const { pin } = body

    if (!pin) {
      const result: AdminVerifyResult = { kind: 'error', message: 'PIN required' }
      return Response.json(result, { status: 400 })
    }

    const admin = await this.getRoomAdmin()
    if (!admin) {
      const result: AdminVerifyResult = { kind: 'roomNotFound' }
      return Response.json(result, { status: 404 })
    }

    const valid = await verifyPin(pin, admin.salt, admin.pinHash)
    if (!valid) {
      const result: AdminVerifyResult = { kind: 'invalidPin' }
      return Response.json(result, { status: 401 })
    }

    // Success - clear rate limit for this client
    this.pinRateLimits.delete(clientId)

    const session = this.createAdminSession()
    const result: AdminVerifyResult = { kind: 'verified', token: session.token }
    return Response.json(result)
  }
}
