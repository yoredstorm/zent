'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function InventoryPage() {
  const [stock, setStock] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [tab, setTab] = useState<'stock' | 'alerts' | 'movements'>('stock');

  useEffect(() => {
    api.get('/inventory/stock').then(setStock).catch(console.error);
    api.get('/inventory/alerts').then(setAlerts).catch(console.error);
    api.get('/inventory/movements').then(setMovements).catch(console.error);
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Inventario</h1>

      <div className="flex gap-4 mb-6">
        <button onClick={() => setTab('stock')} className={`px-4 py-2 rounded-lg ${tab === 'stock' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
          Stock Actual ({stock.length})
        </button>
        <button onClick={() => setTab('alerts')} className={`px-4 py-2 rounded-lg ${tab === 'alerts' ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
          Alertas ({alerts.length})
        </button>
        <button onClick={() => setTab('movements')} className={`px-4 py-2 rounded-lg ${tab === 'movements' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
          Movimientos ({movements.length})
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {tab === 'stock' && (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoría</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mínimo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stock.map((p: any) => (
                <tr key={p.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{p.sku}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{p.nombre}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.categoryNombre}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{p.stock}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.minStock}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${p.stock <= p.minStock ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                      {p.stock <= p.minStock ? 'Bajo' : 'OK'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'alerts' && (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock Actual</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock Mínimo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Faltante</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {alerts.map((p: any) => (
                <tr key={p.id} className="bg-red-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{p.sku}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{p.nombre}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600">{p.stock}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.minStock}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600">{p.minStock - p.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'movements' && (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Razón</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {movements.map((m: any) => (
                <tr key={m.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(m.createdAt).toLocaleString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{m.product?.nombre}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${m.type === 'IN' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{m.type}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{m.quantity}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{m.reason || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}