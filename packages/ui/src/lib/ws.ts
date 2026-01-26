import type { ServerMessage, ClientMessage, ClientType, QueueState } from '@karaoke/types';

type StateHandler = (state: QueueState, extensionConnected?: boolean) => void;
type ExtensionStatusHandler = (connected: boolean) => void;

interface WebSocketManager {
  connect(clientType: ClientType): void;
  disconnect(): void;
  send(message: ClientMessage): void;
  onState(handler: StateHandler): void;
  onExtensionStatus(handler: ExtensionStatusHandler): void;
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

  function getReconnectDelay(): number {
    const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
    return delay + Math.random() * 1000;
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatInterval = setInterval(() => {
      if (ws && connected) {
        ws.send(JSON.stringify({ kind: 'ping' }));
      }
    }, 30000);
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
        stateHandler?.(msg.state, msg.extensionConnected);
        break;
      case 'extensionStatus':
        extensionStatusHandler?.(msg.connected);
        break;
      case 'pong':
        // Heartbeat response
        break;
      case 'error':
        console.error('[WS] Server error:', msg.message);
        break;
    }
  }

  function connect(clientType: ClientType) {
    currentClientType = clientType;

    if (typeof window === 'undefined') return;

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/?upgrade=websocket`;

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WS] Connected');
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
          console.error('[WS] Failed to parse message:', e);
        }
      };

      ws.onclose = () => {
        console.log('[WS] Disconnected');
        connected = false;
        ws = null;
        stopHeartbeat();

        // Reconnect with exponential backoff
        reconnectAttempts++;
        const delay = getReconnectDelay();
        console.log(`[WS] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts})`);
        reconnectTimeout = setTimeout(() => connect(currentClientType), delay);
      };

      ws.onerror = (err) => {
        console.error('[WS] Error:', err);
      };
    } catch (e) {
      console.error('[WS] Failed to connect:', e);
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
    isConnected() {
      return connected;
    },
  };
}
