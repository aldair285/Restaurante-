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
        try { handler(JSON.parse(e.data)); } catch (err) { console.error("WS payload inválido:", err); }
      };
      ws.onclose = (ev) => {
        if (stop) return;
        retry = Math.min(retry + 1, 6);
        console.warn(`WS cerrado (code=${ev.code}), reintentando en ${500 * retry}ms`);
        setTimeout(connect, 500 * retry);
      };
      ws.onerror = (err) => {
        console.error("WS error:", err);
        try { ws.close(); } catch (e) { console.warn("WS close falló:", e); }
      };
    };
    connect();
    return () => {
      stop = true;
      try { ref.current && ref.current.close(); } catch (e) { console.warn("WS cleanup falló:", e); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
