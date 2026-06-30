'use client';

import { useEffect, useRef } from 'react';

export type RealtimeEventType =
  | 'order.created'
  | 'order.updated'
  | 'cart.hold.updated'
  | 'stock.changed'
  | 'message.received'
  | 'message.sent'
  | 'connected'
  | 'ping';

export interface RealtimeEvent {
  type: RealtimeEventType;
  payload?: Record<string, unknown>;
  at: string;
}

export type RealtimeConnectionStatus = 'connecting' | 'connected' | 'disconnected';

interface UseRealtimeOptions {
  enabled?: boolean;
  onStatus?: (status: RealtimeConnectionStatus) => void;
}

export function useRealtime(onEvent: (event: RealtimeEvent) => void, options: UseRealtimeOptions = {}) {
  const { enabled = true, onStatus } = options;
  const handlerRef = useRef(onEvent);
  const onStatusRef = useRef(onStatus);
  handlerRef.current = onEvent;
  onStatusRef.current = onStatus;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const token = localStorage.getItem('accessToken');
    if (!token) {
      onStatusRef.current?.('disconnected');
      return;
    }

    onStatusRef.current?.('connecting');
    const url = `/api/events/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);

    es.onopen = () => onStatusRef.current?.('connected');

    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data) as RealtimeEvent;
        if (data.type === 'connected') {
          onStatusRef.current?.('connected');
          return;
        }
        if (data.type === 'ping') return;
        handlerRef.current(data);
      } catch {
        // ignore
      }
    };

    es.onerror = () => onStatusRef.current?.('disconnected');

    return () => es.close();
  }, [enabled]);
}
