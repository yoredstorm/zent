'use client';

import { useEffect, useRef } from 'react';

export type RealtimeEventType =
  | 'order.created'
  | 'order.updated'
  | 'cart.hold.updated'
  | 'stock.changed'
  | 'message.received'
  | 'message.sent';

export interface RealtimeEvent {
  type: RealtimeEventType;
  payload?: Record<string, unknown>;
  at: string;
}

export function useRealtime(onEvent: (event: RealtimeEvent) => void, enabled = true) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const url = `/api/events/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);

    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data) as RealtimeEvent;
        handlerRef.current(data);
      } catch {
        // ignore
      }
    };

    return () => es.close();
  }, [enabled]);
}
