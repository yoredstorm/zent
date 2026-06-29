'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

const STATUS_COLORS: Record<string, string> = {
  NUEVO: 'bg-blue-100 text-blue-800',
  EN_GESTION: 'bg-yellow-100 text-yellow-800',
  CONFIRMADO: 'bg-green-100 text-green-800',
  EN_DELIVERY: 'bg-purple-100 text-purple-800',
  COMPLETADO: 'bg-gray-100 text-gray-800',
  CANCELADO: 'bg-red-100 text-red-800',
};

const STATUS_ORDER = ['NUEVO', 'EN_GESTION', 'CONFIRMADO', 'EN_DELIVERY', 'COMPLETADO', 'CANCELADO'];

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => { loadOrders(); }, [filter]);

  const loadOrders = () => {
    const params = filter ? `?status=${filter}` : '';
    api.get(`/orders${params}`).then(setOrders).catch(console.error);
  };

  const handleStatusChange = async (id: string, status: string) => {
    await api.put(`/orders/${id}/status`, { status });
    toast.success(`Estado cambiado a ${status}`);
    loadOrders();
    if (selected?.id === id) {
      setSelected({ ...selected, status });
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Pedidos / Leads</h1>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md">
          <option value="">Todos los estados</option>
          {STATUS_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {orders.map((o: any) => (
                <tr key={o.id} onClick={() => setSelected(o)} className={`cursor-pointer hover:bg-gray-50 ${selected?.id === o.id ? 'bg-blue-50' : ''}`}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">#{o.id.slice(0, 8)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div>{o.customerName}</div>
                    {o.customerId && (
                      <span className="text-xs text-green-600">En cartera</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">S/ {Number(o.total).toFixed(2)}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[o.status]}`}>{o.status}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(o.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Pedido #{selected.id.slice(0, 8)}</h2>
            <div className="space-y-3 text-sm">
              <div><span className="font-medium">Cliente:</span> {selected.customerName}</div>
              {selected.customerId && (
                <div>
                  <a href={`/dashboard/customers`} className="text-blue-600 text-xs hover:underline">
                    Ver en cartera de clientes
                  </a>
                </div>
              )}
              <div><span className="font-medium">Teléfono:</span> {selected.customerPhone}</div>
              <div><span className="font-medium">Dirección:</span> {selected.address || 'N/A'}</div>
              <div><span className="font-medium">Referencia:</span> {selected.reference || 'N/A'}</div>
              <hr className="my-4" />
              <h3 className="font-bold">Items:</h3>
              {selected.items?.map((item: any) => (
                <div key={item.id} className="flex justify-between">
                  <span>{item.quantity}x {item.product?.nombre}</span>
                  <span>S/ {(Number(item.unitPrice) * item.quantity).toFixed(2)}</span>
                </div>
              ))}
              <hr className="my-4" />
              <div className="flex justify-between font-bold text-lg">
                <span>Total:</span>
                <span>S/ {Number(selected.total).toFixed(2)}</span>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Cambiar Estado:</label>
                <select
                  value={selected.status}
                  onChange={(e) => handleStatusChange(selected.id, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  {STATUS_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}