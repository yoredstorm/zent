'use client';

import { toast } from 'sonner';
import { useRealtime } from '@/lib/useRealtime';

export function RealtimeToasts() {
  useRealtime((event) => {
    if (event.type === 'order.created') {
      const orderId = String(event.payload?.orderId ?? '').slice(0, 8);
      toast.info(`Nuevo pedido #${orderId}`, {
        description: 'Revisa Pedidos para aceptarlo',
        duration: 8000,
      });
    }
  });

  return null;
}
