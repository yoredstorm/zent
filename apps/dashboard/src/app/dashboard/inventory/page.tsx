'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Archive, History, Package, ShoppingCart } from 'lucide-react';
import { api } from '@/lib/api';
import { useRealtime } from '@/lib/useRealtime';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs } from '@/components/ui/Tabs';

type Tab = 'stock' | 'carts' | 'abandoned' | 'alerts' | 'movements';

export default function InventoryPage() {
  const [liveStock, setLiveStock] = useState<any[]>([]);
  const [activeCarts, setActiveCarts] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [abandonedCarts, setAbandonedCarts] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('stock');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [liveStatus, setLiveStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  const loadAll = useCallback((showLoading = false) => {
    if (showLoading) setListLoading(true);
    Promise.all([
      api.get('/inventory/stock/live'),
      api.get('/inventory/active-carts'),
      api.get('/inventory/alerts'),
      api.get('/inventory/movements'),
      api.get('/inventory/abandoned-carts'),
    ])
      .then(([stock, carts, alertData, movData, abandoned]) => {
        setLiveStock(stock);
        setActiveCarts(carts);
        setAlerts(alertData);
        setMovements(movData);
        setAbandonedCarts(abandoned);
        setLastUpdate(new Date());
      })
      .catch(console.error)
      .finally(() => setListLoading(false));
  }, []);

  useEffect(() => {
    loadAll(true);
  }, [loadAll]);

  useRealtime(
    useCallback(
      (event) => {
        if (
          event.type === 'stock.changed' ||
          event.type === 'cart.hold.updated' ||
          event.type === 'order.created' ||
          event.type === 'order.updated'
        ) {
          loadAll();
        }
      },
      [loadAll],
    ),
    { onStatus: setLiveStatus },
  );

  const liveStatusLabel =
    liveStatus === 'connected'
      ? 'En vivo'
      : liveStatus === 'disconnected'
        ? 'Sin conexión en vivo'
        : 'Conectando…';

  const liveStatusTone =
    liveStatus === 'connected'
      ? 'text-emerald-600'
      : liveStatus === 'disconnected'
        ? 'text-amber-600'
        : 'text-slate-400';

  const tabItems = [
    { id: 'stock', label: `Stock en vivo (${liveStock.length})` },
    { id: 'carts', label: `Carritos activos (${activeCarts.length})` },
    { id: 'abandoned', label: `Abandonados (${abandonedCarts.length})` },
    { id: 'alerts', label: `Alertas (${alerts.length})` },
    { id: 'movements', label: `Movimientos (${movements.length})` },
  ];

  return (
    <div>
      <PageHeader
        title="Inventario"
        subtitle={lastUpdate ? `Actualizado: ${lastUpdate.toLocaleTimeString()}` : undefined}
        actions={
          <>
            <span className={`inline-flex items-center gap-1.5 text-sm ${liveStatusTone}`}>
              <span
                className={`h-2 w-2 rounded-full ${
                  liveStatus === 'connected'
                    ? 'animate-pulse bg-emerald-500'
                    : liveStatus === 'disconnected'
                      ? 'bg-amber-400'
                      : 'bg-slate-300'
                }`}
              />
              {liveStatusLabel}
            </span>
            <Button type="button" variant="secondary" onClick={() => loadAll()}>
              Refrescar
            </Button>
          </>
        }
      />

      <div className="mb-6">
        <Tabs value={tab} onChange={(id) => setTab(id as Tab)} items={tabItems} />
      </div>

      {listLoading ? (
        <div className="zent-card space-y-3 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
          {tab === 'stock' &&
            (liveStock.length === 0 ? (
              <EmptyState
                icon={Package}
                title="Sin productos en stock"
                description="No hay productos registrados o el inventario está vacío."
              />
            ) : (
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">SKU</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Producto</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Físico</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">En carritos</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">En pedidos</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Disponible</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {liveStock.map((p: any) => (
                    <tr key={p.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 text-sm text-slate-900">{p.sku}</td>
                      <td className="px-4 py-3 text-sm text-slate-900">{p.nombre}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">{p.stockFisico}</td>
                      <td className="px-4 py-3 text-sm text-brand-700">{p.reservadoCarritos}</td>
                      <td className="px-4 py-3 text-sm text-amber-700">{p.reservadoPedidos}</td>
                      <td className="px-4 py-3 text-sm font-bold text-brand-700">{p.disponible}</td>
                      <td className="px-4 py-3">
                        <Badge tone={p.disponible <= p.minStock ? 'danger' : 'success'}>
                          {p.disponible <= p.minStock ? 'Bajo' : 'OK'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}

          {tab === 'carts' && (
            <>
              <p className="border-b border-slate-100 bg-brand-50 px-4 py-2 text-xs text-slate-600">
                Carritos de WhatsApp con stock reservado. También en{' '}
                <Link href="/dashboard/whatsapp" className="font-medium text-brand-700 hover:underline">
                  WhatsApp → Carritos activos
                </Link>
                .
              </p>
              {activeCarts.length === 0 ? (
                <EmptyState
                  icon={ShoppingCart}
                  title="Sin carritos activos"
                  description="No hay carritos de WhatsApp reservando stock en este momento."
                />
              ) : (
                <table className="min-w-full divide-y divide-slate-100">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Cliente</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Teléfono</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Ítems</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Total</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Desde</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Expira</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeCarts.map((c: any) => (
                      <tr key={c.stateKey} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 text-sm text-slate-900">{c.customerName || '—'}</td>
                        <td className="px-4 py-3 font-mono text-sm text-slate-700">{c.contactPhone || c.chatId}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {c.items.map((i: any) => `${i.quantity}x ${i.nombre}`).join(', ')}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">
                          S/ {Number(c.total).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500">
                          {new Date(c.createdAt).toLocaleTimeString()}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={c.minutesLeft <= 5 ? 'danger' : 'default'}>
                            {c.minutesLeft} min
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {tab === 'abandoned' &&
            (abandonedCarts.length === 0 ? (
              <EmptyState
                icon={Archive}
                title="Sin carritos abandonados"
                description="Los carritos expirados aparecerán aquí. El cliente puede escribir RETOMAR para recuperarlos."
              />
            ) : (
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Cliente</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Teléfono</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Total</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Expiró</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Follow-up</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {abandonedCarts.map((c: any) => (
                    <tr key={c.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 text-sm text-slate-900">{c.customerName || '—'}</td>
                      <td className="px-4 py-3 font-mono text-sm text-slate-700">{c.customerPhone || c.chatId}</td>
                      <td className="px-4 py-3 text-sm font-medium">S/ {Number(c.total).toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {new Date(c.expiredAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={c.followUpSentAt ? 'success' : 'warning'}>
                          {c.followUpSentAt ? 'Enviado' : 'Pendiente'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={c.recoveredAt ? 'brand' : 'default'}>
                          {c.recoveredAt ? 'Recuperado' : 'Expirado'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}

          {tab === 'alerts' &&
            (alerts.length === 0 ? (
              <EmptyState
                icon={AlertTriangle}
                title="Sin alertas de stock"
                description="Todos los productos están por encima del stock mínimo."
              />
            ) : (
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">SKU</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Producto</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Disponible</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Físico</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Mínimo</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((p: any) => (
                    <tr key={p.id} className="bg-danger-soft/30">
                      <td className="px-4 py-3 text-sm text-slate-900">{p.sku}</td>
                      <td className="px-4 py-3 text-sm text-slate-900">{p.nombre}</td>
                      <td className="px-4 py-3 text-sm font-medium text-red-600">{p.stock}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{p.stockFisico}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{p.minStock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}

          {tab === 'movements' &&
            (movements.length === 0 ? (
              <EmptyState
                icon={History}
                title="Sin movimientos"
                description="Aún no hay entradas ni salidas registradas en el inventario."
              />
            ) : (
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Fecha</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Producto</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Cantidad</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Razón</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {movements.map((m: any) => (
                    <tr key={m.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 text-sm text-slate-500">{new Date(m.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-slate-900">{m.product?.nombre}</td>
                      <td className="px-4 py-3">
                        <Badge tone={m.type === 'IN' ? 'success' : 'danger'}>{m.type}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">{m.quantity}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{m.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
        </div>
      )}
    </div>
  );
}
