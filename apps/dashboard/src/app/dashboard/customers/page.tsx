'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const TYPE_BADGE: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  returning: 'bg-green-100 text-green-800',
  vip: 'bg-purple-100 text-purple-800',
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    loadCustomers();
    api.get('/customers/stats').then(setStats).catch(console.error);
  }, [search, typeFilter]);

  const loadCustomers = () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (typeFilter) params.set('type', typeFilter);
    const qs = params.toString() ? `?${params}` : '';
    api.get(`/customers${qs}`).then(setCustomers).catch(console.error);
  };

  const loadDetail = async (id: string) => {
    const detail = await api.get(`/customers/${id}`);
    setSelected(detail);
  };

  const customerType = (c: any) => {
    if (c.isVip) return { label: 'VIP', key: 'vip' };
    if (c.isReturning) return { label: 'Recurrente', key: 'returning' };
    return { label: 'Nuevo', key: 'new' };
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Cartera de Clientes</h1>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-sm text-gray-500">Total clientes</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-sm text-gray-500">Recurrentes</p>
            <p className="text-2xl font-bold text-green-600">{stats.returning}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-sm text-gray-500">Nuevos este mes</p>
            <p className="text-2xl font-bold text-blue-600">{stats.newThisMonth}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-sm text-gray-500">Tasa recurrencia</p>
            <p className="text-2xl font-bold text-purple-600">{(stats.returningRate * 100).toFixed(0)}%</p>
          </div>
        </div>
      )}

      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Buscar por nombre o teléfono..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md"
        >
          <option value="">Todos</option>
          <option value="new">Nuevos (1 pedido)</option>
          <option value="returning">Recurrentes (2+)</option>
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pedidos</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total gastado</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ticket prom.</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {customers.map((c) => {
                const t = customerType(c);
                return (
                  <tr
                    key={c.id}
                    onClick={() => loadDetail(c.id)}
                    className={`cursor-pointer hover:bg-gray-50 ${selected?.id === c.id ? 'bg-blue-50' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm">{c.name}</div>
                      <div className="text-xs text-gray-500">{c.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">{c.totalOrders}</td>
                    <td className="px-4 py-3 text-sm font-medium">S/ {c.totalSpent.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm">S/ {c.avgOrderValue.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${TYPE_BADGE[t.key]}`}>{t.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {selected && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">{selected.name}</h2>
            <div className="space-y-2 text-sm mb-4">
              <div><span className="font-medium">Teléfono:</span> {selected.phone}</div>
              <div><span className="font-medium">Dirección:</span> {selected.address || 'N/A'}</div>
              <div><span className="font-medium">Referencia:</span> {selected.reference || 'N/A'}</div>
              <div><span className="font-medium">Pedidos lifetime:</span> {selected.totalOrders}</div>
              <div><span className="font-medium">Total gastado:</span> S/ {selected.totalSpent?.toFixed(2)}</div>
            </div>

            {selected.topProducts?.length > 0 && (
              <div className="mb-4">
                <h3 className="font-bold text-sm mb-2">Productos más comprados</h3>
                {selected.topProducts.map((p: any, i: number) => (
                  <div key={i} className="text-sm text-gray-600">{p.nombre} — {p.quantity} uds.</div>
                ))}
              </div>
            )}

            <h3 className="font-bold text-sm mb-2">Historial de pedidos</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {selected.orders?.map((o: any) => (
                <div key={o.id} className="text-sm border-b pb-2">
                  <div className="flex justify-between">
                    <span className="font-mono">#{o.id.slice(0, 8)}</span>
                    <span className="font-medium">S/ {Number(o.total).toFixed(2)}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(o.createdAt).toLocaleDateString()} — {o.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
