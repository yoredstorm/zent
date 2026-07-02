'use client';

import { useCallback, useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';

const TYPE_TONES: Record<string, 'brand' | 'success' | 'default'> = {
  vip: 'brand',
  returning: 'success',
  new: 'default',
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (typeFilter) params.set('type', typeFilter);
    const qs = params.toString() ? `?${params}` : '';

    Promise.all([
      api.get(`/customers${qs}`).then(setCustomers).catch(console.error),
      api.get('/customers/stats').then(setStats).catch(console.error),
    ]).finally(() => setLoading(false));
  }, [search, typeFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadDetail = async (id: string) => {
    const detail = await api.get(`/customers/${id}`);
    setSelected(detail);
  };

  const customerType = (c: any) => {
    if (c.isVip) return { label: 'VIP', key: 'vip' };
    if (c.isReturning) return { label: 'Recurrente', key: 'returning' };
    return { label: 'Nuevo', key: 'new' };
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Cartera de clientes" />
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="mb-4 flex gap-3">
          <Skeleton className="h-11 flex-1" />
          <Skeleton className="h-11 w-48" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Skeleton className="h-96 lg:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Cartera de clientes" />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card interactive>
          <p className="text-sm font-medium text-slate-500">Total clientes</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{stats?.total ?? 0}</p>
        </Card>
        <Card interactive>
          <p className="text-sm font-medium text-slate-500">Recurrentes</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-success">{stats?.returning ?? 0}</p>
        </Card>
        <Card interactive>
          <p className="text-sm font-medium text-slate-500">Nuevos este mes</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-brand-600">{stats?.newThisMonth ?? 0}</p>
        </Card>
        <Card interactive>
          <p className="text-sm font-medium text-slate-500">Tasa recurrencia</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-brand-700">
            {((stats?.returningRate ?? 0) * 100).toFixed(0)}%
          </p>
        </Card>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          placeholder="Buscar por nombre o teléfono..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="zent-input flex-1"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="zent-input w-full sm:w-auto sm:min-w-[200px]"
        >
          <option value="">Todos</option>
          <option value="new">Nuevos (1 pedido)</option>
          <option value="returning">Recurrentes (2+)</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="zent-card overflow-hidden lg:col-span-2">
          {customers.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Sin clientes aún"
              description="Los clientes aparecerán aquí cuando registres pedidos."
            />
          ) : (
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-surface-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">
                    Cliente
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">
                    Pedidos
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">
                    Total gastado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">
                    Ticket prom.
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">
                    Tipo
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {customers.map((c) => {
                  const t = customerType(c);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => loadDetail(c.id)}
                      className={`cursor-pointer transition-colors hover:bg-slate-50 ${
                        selected?.id === c.id ? 'bg-brand-50' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-slate-900">{c.name}</div>
                        <div className="text-xs text-slate-500">{c.phone}</div>
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums">{c.totalOrders}</td>
                      <td className="px-4 py-3 text-sm font-medium tabular-nums">
                        S/ {c.totalSpent.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums">
                        S/ {c.avgOrderValue.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={TYPE_TONES[t.key] ?? 'default'}>{t.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {selected && (
          <Card>
            <h2 className="mb-4 text-xl font-bold text-slate-900">{selected.name}</h2>
            <div className="mb-4 space-y-2 text-sm text-slate-700">
              <div>
                <span className="font-medium text-slate-900">Teléfono:</span> {selected.phone}
              </div>
              <div>
                <span className="font-medium text-slate-900">Dirección:</span>{' '}
                {selected.address || 'N/A'}
              </div>
              <div>
                <span className="font-medium text-slate-900">Referencia:</span>{' '}
                {selected.reference || 'N/A'}
              </div>
              <div>
                <span className="font-medium text-slate-900">Pedidos lifetime:</span>{' '}
                {selected.totalOrders}
              </div>
              <div>
                <span className="font-medium text-slate-900">Total gastado:</span> S/{' '}
                {selected.totalSpent?.toFixed(2)}
              </div>
            </div>

            {selected.topProducts?.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-2 text-sm font-bold text-slate-900">Productos más comprados</h3>
                {selected.topProducts.map((p: any, i: number) => (
                  <div key={i} className="text-sm text-slate-600">
                    {p.nombre} — {p.quantity} uds.
                  </div>
                ))}
              </div>
            )}

            <h3 className="mb-2 text-sm font-bold text-slate-900">Historial de pedidos</h3>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {selected.orders?.map((o: any) => (
                <div key={o.id} className="border-b border-slate-100 pb-2 text-sm">
                  <div className="flex justify-between">
                    <span className="font-mono text-slate-700">#{o.id.slice(0, 8)}</span>
                    <span className="font-medium tabular-nums text-slate-900">
                      S/ {Number(o.total).toFixed(2)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(o.createdAt).toLocaleDateString()} — {o.status}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
