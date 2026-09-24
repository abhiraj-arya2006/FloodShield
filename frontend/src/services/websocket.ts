import { useSimulationStore } from '../store/useSimulationStore';

class LiveWebSocketClient {
  private socket: WebSocket | null = null;
  private reconnectTimeout: number | null = null;
  private backoffMs = 1000;
  private isExplicitlyClosed = false;

  connect() {
    this.isExplicitlyClosed = false;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    // In dev mode with Vite proxy, /ws/live goes to backend
    const wsUrl = `${protocol}//${host}/ws/live`;

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        useSimulationStore.getState().setWsConnected(true);
        this.backoffMs = 1000; // Reset backoff
      };

      this.socket.onmessage = (event) => {
        try {
          const envelope = JSON.parse(event.data);
          useSimulationStore.getState().setLastUpdateTimestamp(envelope.timestamp);

          if (envelope.type === 'simulation_state') {
            useSimulationStore.getState().setSimulationState(envelope.payload);
          }
        } catch {
          // Ignore malformed JSON
        }
      };

      this.socket.onclose = () => {
        useSimulationStore.getState().setWsConnected(false);
        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      };

      this.socket.onerror = () => {
        useSimulationStore.getState().setWsConnected(false);
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) return;
    this.reconnectTimeout = window.setTimeout(() => {
      this.reconnectTimeout = null;
      this.backoffMs = Math.min(this.backoffMs * 1.5, 10000);
      this.connect();
    }, this.backoffMs);
  }

  disconnect() {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}

export const liveWsClient = new LiveWebSocketClient();
