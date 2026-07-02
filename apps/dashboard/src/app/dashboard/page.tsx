'use client';

import { useEffect, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { api } from '@/lib/api';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { orderStatusLabels } from '@/lib/labels';

const PIE_COLORS = ['rgb(37 99 235)', 'rgb(16 185 129)'];

export default function DashboardHome() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any>(null);
  const [orderStats, setOrderStats] = useState<any>(null);
  const [customerAnalytics, setCustomerAnalytics] = useState<any>(null);
  const [salesTrend, setSalesTrend] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [topCustomers, setTopCustomers] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      api.get('/analytics/overview').then(setOverview).catch(console.error),
      api.get('/orders/stats').then(setOrderStats).catch(console.error),
      api.get('/analytics/customers').then(setCustomerAnalytics).catch(console.error),
      api.get('/analytics/sales-trend?days=14').then(setSalesTrend).catch(console.error),
      api.get('/analytics/top-products?limit=5').then(setTopProducts).catch(console.error),
      api.get('/analytics/top-customers?limit=5').then(setTopCustomers).catch(console.error),
    ]).finally(() => setLoading(false));
  }, []);

  const pieData = customerAnalytics
    ? [
        { name: 'Nuevos', value: customerAnalytics.newOnly },
        { name: 'Recurrentes', value: customerAnalytics.returning },
      ]
    : [];

  if (loading) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Resumen de tu tienda" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Resumen de tu tienda" />

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card interactive>
          <h3 className="text-sm font-medium text-slate-500">Pedidos Hoy</h3>
          <p className="mt-2 text-3xl font-bold tabular-nums text-brand-600">
            {overview?.orders?.today ?? orderStats?.today ?? 0}
          </p>
        </Card>
        <Card interactive>
          <h3 className="text-sm font-medium text-slate-500">Pedidos Este Mes</h3>
          <p className="mt-2 text-3xl font-bold tabular-nums text-success">
            {overview?.orders?.month ?? orderStats?.month ?? 0}
          </p>
        </Card>
        <Card interactive>
          <h3 className="text-sm font-medium text-slate-500">Clientes en Cartera</h3>
          <p className="mt-2 text-3xl font-bold tabular-nums text-brand-700">
            {overview?.customers?.total ?? 0}
          </p>
        </Card>
        <Card interactive>
          <h3 className="text-sm font-medium text-slate-500">Ingresos del Mes</h3>
          <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
            S/ {(overview?.revenue?.month ?? 0).toFixed(0)}
          </p>
        </Card>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card interactive>
          <h3 className="text-sm font-medium text-slate-500">Clientes Nuevos (mes)</h3>
          <p className="mt-2 text-2xl font-bold tabular-nums text-brand-600">
            {overview?.customers?.newThisMonth ?? 0}
          </p>
        </Card>
        <Card interactive>
          <h3 className="text-sm font-medium text-slate-500">Tasa de Recurrencia</h3>
          <p className="mt-2 text-2xl font-bold tabular-nums text-success">
            {((overview?.customers?.returningRate ?? 0) * 100).toFixed(0)}%
          </p>
        </Card>
        <Card interactive>
          <h3 className="text-sm font-medium text-slate-500">Ingresos Hoy</h3>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
            S/ {(overview?.revenue?.today ?? 0).toFixed(2)}
          </p>
        </Card>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-xl font-bold">Pedidos (últimos 14 días)</h2>
          {salesTrend.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title="Sin datos aún"
              description="Los pedidos aparecerán aquí."
            />
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={salesTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="orders" fill="rgb(37 99 235)" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-xl font-bold">Clientes: Nuevos vs Recurrentes</h2>
          {pieData.length === 0 || pieData.every((d) => d.value === 0) ? (
            <EmptyState
              icon={ShoppingCart}
              title="Sin datos aún"
              description="Los pedidos aparecerán aquí."
            />
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden !p-0">
          <div className="border-b border-slate-100 p-4 font-bold">Top 5 Productos Más Vendidos</div>
          {topProducts.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title="Sin datos aún"
              description="Los pedidos aparecerán aquí."
            />
          ) : (
            <table className="min-w-full divide-y divide-slate-100">
              <tbody>
                {topProducts.map((p: any, i: number) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 text-sm tabular-nums text-slate-500">{i + 1}</td>
                    <td className="px-4 py-3 text-sm">{p.nombre}</td>
                    <td className="px-4 py-3 text-sm font-medium tabular-nums">{p.totalSold} uds.</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="overflow-hidden !p-0">
          <div className="border-b border-slate-100 p-4 font-bold">Top 5 Clientes por Gasto</div>
          {topCustomers.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title="Sin datos aún"
              description="Los pedidos aparecerán aquí."
            />
          ) : (
            <table className="min-w-full divide-y divide-slate-100">
              <tbody>
                {topCustomers.map((c: any, i: number) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 text-sm tabular-nums text-slate-500">{i + 1}</td>
                    <td className="px-4 py-3 text-sm">{c.name}</td>
                    <td className="px-4 py-3 text-sm font-medium tabular-nums">
                      S/ {c.totalSpent.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {orderStats?.byStatus && (
        <Card>
          <h2 className="mb-4 text-xl font-bold text-slate-900">Pedidos por Estado</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {orderStats.byStatus.map((s: any) => (
              <div key={s.status} className="rounded-xl bg-surface-muted p-4 text-center">
                <p className="text-sm text-slate-600">{orderStatusLabels[s.status] ?? s.status}</p>
                <p className="text-2xl font-bold tabular-nums text-slate-800">{s._count}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
