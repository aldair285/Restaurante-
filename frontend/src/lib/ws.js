import { useEffect, useRef } from "react";
import { wsUrl } from "@/lib/api";

// Subscribe to POS websocket events. handler receives {event, payload}
export function useOrdersWS(handler) {
  const ref = useRef(null);
  const handlerRef = useRef(handler);
  // Siempre mantener la referencia al handler más reciente (evita stale closures)
  useEffect(() => { handlerRef.current = handler; });

  useEffect(() => {
    let stop = false;
    let retry = 0;
    let pingInterval = null;

    const connect = () => {
      if (stop) return;
      const ws = new WebSocket(wsUrl());
      ref.current = ws;

      ws.onopen = () => {
        retry = 0;
        // Send ping every 20 seconds to keep connection alive
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ event: "ping" }));
          }
        }, 20000);
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.event === "pong") return; // ignore pong
          handlerRef.current(data);
        } catch (err) {
          console.error("WS payload inválido:", err);
        }
      };

      ws.onclose = (ev) => {
        clearInterval(pingInterval);
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
      clearInterval(pingInterval);
      try { ref.current && ref.current.close(); } catch (e) { console.warn("WS cleanup falló:", e); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
