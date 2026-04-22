import { useEffect, useRef } from "react";
import { wsUrl } from "@/lib/api";

// Subscribe to POS websocket events. handler receives {event, payload}
export function useOrdersWS(handler) {
  const ref = useRef(null);
  useEffect(() => {
    let stop = false;
    let retry = 0;
    const connect = () => {
      if (stop) return;
      const ws = new WebSocket(wsUrl());
      ref.current = ws;
      ws.onmessage = (e) => {
        try { handler(JSON.parse(e.data)); } catch { /* ignore */ }
      };
      ws.onclose = () => {
        if (stop) return;
        retry = Math.min(retry + 1, 6);
        setTimeout(connect, 500 * retry);
      };
      ws.onerror = () => { try { ws.close(); } catch { /* noop */ } };
    };
    connect();
    return () => { stop = true; try { ref.current && ref.current.close(); } catch { /* noop */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
