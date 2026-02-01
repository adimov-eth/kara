import type {
  ServerMessage,
  ClientMessage,
  ClientType,
  QueueState,
  PlaybackState,
  Reaction,
  ChatMessage,
  EnergyState,
} from '@karaoke/types';
import { getRoomId } from './api';

type StateHandler = (state: QueueState, playback?: PlaybackState, extensionConnected?: boolean) => void;
type ExtensionStatusHandler = (connected: boolean) => void;
type SyncHandler = (playback: PlaybackState, serverTimeOffset: number) => void;
type ReactionHandler = (reaction: Reaction) => void;
type ChatHandler = (message: ChatMessage) => void;
type ChatPinnedHandler = (message: ChatMessage) => void;
type ChatUnpinnedHandler = (messageId: string) => void;
type EnergyHandler = (state: EnergyState) => void;
type EnergySkipHandler = () => void;

// Conditional logging - only in development
const isDev = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

function log(...args: unknown[]) {
  if (isDev) {
    console.log('[WS]', ...args);
  }
}

function logError(...args: unknown[]) {
  // Always log errors
  console.error('[WS]', ...args);
}

interface WebSocketManager {
  connect(clientType: ClientType): void;
  disconnect(): void;
  send(message: ClientMessage): void;
  onState(handler: StateHandler): void;
  onExtensionStatus(handler: ExtensionStatusHandler): void;
  onSync(handler: SyncHandler): void;
  onReaction(handler: ReactionHandler): void;
  onChat(handler: ChatHandler): void;
  onChatPinned(handler: ChatPinnedHandler): void;
  onChatUnpinned(handler: ChatUnpinnedHandler): void;
  onEnergy(handler: EnergyHandler): void;
  onEnergySkip(handler: EnergySkipHandler): void;
  requestSync(): void;
  getServerTimeOffset(): number;
  isConnected(): boolean;
}

export function createWebSocket(): WebSocketManager {
  let ws: WebSocket | null = null;
  let connected = false;
  let reconnectAttempts = 0;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let currentClientType: ClientType = 'user';

  const MAX_RECONNECT_DELAY = 30000;
  const BASE_RECONNECT_DELAY = 1000;

  let stateHandler: StateHandler | null = null;
  let extensionStatusHandler: ExtensionStatusHandler | null = null;
  let syncHandler: SyncHandler | null = null;
  let reactionHandler: ReactionHandler | null = null;
  let chatHandler: ChatHandler | null = null;
  let chatPinnedHandler: ChatPinnedHandler | null = null;
  let chatUnpinnedHandler: ChatUnpinnedHandler | null = null;
  let energyHandler: EnergyHandler | null = null;
  let energySkipHandler: EnergySkipHandler | null = null;

  // Server time offset for synchronized playback (serverTime - clientTime)
  let serverTimeOffset = 0;
  let pingStartTime = 0;

  function getReconnectDelay(): number {
    const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
    return delay + Math.random() * 1000;
  }

  function startHeartbeat() {
    stopHeartbeat();
    // Send initial ping for clock sync
    sendPing();
    heartbeatInterval = setInterval(() => {
      if (ws && connected) {
        sendPing();
      }
    }, 30000);
  }

  function sendPing() {
    if (ws && connected) {
      pingStartTime = Date.now();
      ws.send(JSON.stringify({ kind: 'ping', clientTime: pingStartTime }));
    }
  }

  function stopHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }

  function handleMessage(msg: ServerMessage) {
    switch (msg.kind) {
      case 'state':
        stateHandler?.(msg.state, msg.playback, msg.extensionConnected);
        break;
      case 'extensionStatus':
        extensionStatusHandler?.(msg.connected);
        break;
      case 'pong':
        // Calculate server time offset for sync
        if (msg.serverTime && msg.clientTime) {
          const now = Date.now();
          const roundTrip = now - msg.clientTime;
          // Estimate server time at the moment we receive this message
          // Server time when it sent = msg.serverTime
          // Approximate network latency = roundTrip / 2
          serverTimeOffset = msg.serverTime - msg.clientTime - (roundTrip / 2);
          log('Clock sync: offset', serverTimeOffset, 'ms, RTT', roundTrip, 'ms');
        }
        break;
      case 'sync':
        syncHandler?.(msg.playback, serverTimeOffset);
        break;
      case 'reaction':
        reactionHandler?.(msg.reaction);
        break;
      case 'chat':
        chatHandler?.(msg.message);
        break;
      case 'chatPinned':
        chatPinnedHandler?.(msg.message);
        break;
      case 'chatUnpinned':
        chatUnpinnedHandler?.(msg.messageId);
        break;
      case 'energy':
        energyHandler?.(msg.state);
        break;
      case 'energySkip':
        energySkipHandler?.();
        break;
      case 'error':
        logError('Server error:', msg.message);
        break;
    }
  }

  function connect(clientType: ClientType) {
    currentClientType = clientType;

    if (typeof window === 'undefined') return;

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const roomId = getRoomId();
    const wsUrl = `${protocol}//${location.host}/?upgrade=websocket&room=${encodeURIComponent(roomId)}`;

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        log('Connected');
        connected = true;
        reconnectAttempts = 0;
        ws!.send(JSON.stringify({ kind: 'subscribe', clientType }));
        startHeartbeat();
      };

      ws.onmessage = (event) => {
        try {
          const msg: ServerMessage = JSON.parse(event.data);
          handleMessage(msg);
        } catch (e) {
          logError('Failed to parse message:', e);
        }
      };

      ws.onclose = () => {
        log('Disconnected');
        connected = false;
        ws = null;
        stopHeartbeat();

        // Reconnect with exponential backoff
        reconnectAttempts++;
        const delay = getReconnectDelay();
        log(`Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts})`);
        reconnectTimeout = setTimeout(() => connect(currentClientType), delay);
      };

      ws.onerror = (err) => {
        logError('Error:', err);
      };
    } catch (e) {
      logError('Failed to connect:', e);
    }
  }

  function disconnect() {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    stopHeartbeat();
    if (ws) {
      ws.close();
      ws = null;
    }
    connected = false;
  }

  function send(message: ClientMessage) {
    if (ws && connected) {
      ws.send(JSON.stringify(message));
    }
  }

  return {
    connect,
    disconnect,
    send,
    onState(handler: StateHandler) {
      stateHandler = handler;
    },
    onExtensionStatus(handler: ExtensionStatusHandler) {
      extensionStatusHandler = handler;
    },
    onSync(handler: SyncHandler) {
      syncHandler = handler;
    },
    onReaction(handler: ReactionHandler) {
      reactionHandler = handler;
    },
    onChat(handler: ChatHandler) {
      chatHandler = handler;
    },
    onChatPinned(handler: ChatPinnedHandler) {
      chatPinnedHandler = handler;
    },
    onChatUnpinned(handler: ChatUnpinnedHandler) {
      chatUnpinnedHandler = handler;
    },
    onEnergy(handler: EnergyHandler) {
      energyHandler = handler;
    },
    onEnergySkip(handler: EnergySkipHandler) {
      energySkipHandler = handler;
    },
    requestSync() {
      send({ kind: 'syncRequest' });
    },
    getServerTimeOffset() {
      return serverTimeOffset;
    },
    isConnected() {
      return connected;
    },
  };
}
