'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useRealtime } from '@/lib/useRealtime';

type Tab = 'stock' | 'carts' | 'alerts' | 'movements';

export default function InventoryPage() {
  const [liveStock, setLiveStock] = useState<any[]>([]);
  const [activeCarts, setActiveCarts] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('stock');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);

  const loadAll = useCallback(() => {
    Promise.all([
      api.get('/inventory/stock/live'),
      api.get('/inventory/active-carts'),
      api.get('/inventory/alerts'),
      api.get('/inventory/movements'),
    ])
      .then(([stock, carts, alertData, movData]) => {
        setLiveStock(stock);
        setActiveCarts(carts);
        setAlerts(alertData);
        setMovements(movData);
        setLastUpdate(new Date());
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useRealtime(
    useCallback(
      (event) => {
        setLiveConnected(true);
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
  );

  return (
    <div>
      <div className="flex flex-wrap gap-3 justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Inventario</h1>
        <div className="text-sm text-gray-500 flex items-center gap-3">
          <span className={`inline-flex items-center gap-1 ${liveConnected ? 'text-green-600' : 'text-gray-400'}`}>
            <span className={`w-2 h-2 rounded-full ${liveConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
            {liveConnected ? 'En vivo' : 'Conectando…'}
          </span>
          {lastUpdate && (
            <span>Actualizado: {lastUpdate.toLocaleTimeString()}</span>
          )}
          <button
            type="button"
            onClick={loadAll}
            className="px-3 py-1 border rounded-md text-xs hover:bg-gray-50"
          >
            Refrescar
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <button
          type="button"
          onClick={() => setTab('stock')}
          className={`px-4 py-2 rounded-lg text-sm ${tab === 'stock' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          Stock en vivo ({liveStock.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('carts')}
          className={`px-4 py-2 rounded-lg text-sm ${tab === 'carts' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          Carritos activos ({activeCarts.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('alerts')}
          className={`px-4 py-2 rounded-lg text-sm ${tab === 'alerts' ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          Alertas ({alerts.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('movements')}
          className={`px-4 py-2 rounded-lg text-sm ${tab === 'movements' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          Movimientos ({movements.length})
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        {tab === 'stock' && (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Físico</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">En carritos</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">En pedidos</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Disponible</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {liveStock.map((p: any) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 text-sm">{p.sku}</td>
                  <td className="px-4 py-3 text-sm">{p.nombre}</td>
                  <td className="px-4 py-3 text-sm font-medium">{p.stockFisico}</td>
                  <td className="px-4 py-3 text-sm text-purple-700">{p.reservadoCarritos}</td>
                  <td className="px-4 py-3 text-sm text-amber-700">{p.reservadoPedidos}</td>
                  <td className="px-4 py-3 text-sm font-bold text-blue-700">{p.disponible}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        p.disponible <= p.minStock ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {p.disponible <= p.minStock ? 'Bajo' : 'OK'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'carts' && (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Teléfono</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ítems</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Desde</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expira</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {activeCarts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500 text-sm">
                    No hay carritos activos reservando stock
                  </td>
                </tr>
              ) : (
                activeCarts.map((c: any) => (
                  <tr key={c.stateKey}>
                    <td className="px-4 py-3 text-sm">{c.customerName || '—'}</td>
                    <td className="px-4 py-3 text-sm font-mono">{c.contactPhone || c.chatId}</td>
                    <td className="px-4 py-3 text-sm">
                      {c.items.map((i: any) => `${i.quantity}x ${i.nombre}`).join(', ')}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">S/ {Number(c.total).toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(c.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          c.minutesLeft <= 5 ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {c.minutesLeft} min
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {tab === 'alerts' && (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Disponible</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Físico</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mínimo</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((p: any) => (
                <tr key={p.id} className="bg-red-50">
                  <td className="px-4 py-3 text-sm">{p.sku}</td>
                  <td className="px-4 py-3 text-sm">{p.nombre}</td>
                  <td className="px-4 py-3 text-sm font-medium text-red-600">{p.stock}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{p.stockFisico}</td>
                  <td className="px-4 py-3 text-sm">{p.minStock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'movements' && (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Razón</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m: any) => (
                <tr key={m.id}>
                  <td className="px-4 py-3 text-sm text-gray-500">{new Date(m.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm">{m.product?.nombre}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        m.type === 'IN' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {m.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium">{m.quantity}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{m.reason || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
