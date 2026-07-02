'use client';

import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { api } from '@/lib/api';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';

const CHART_COLORS = {
  brand: 'rgb(37 99 235)',
  success: 'rgb(16 185 129)',
} as const;

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [profit, setProfit] = useState<any>(null);
  const [byCategory, setByCategory] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [daily, setDaily] = useState<any[]>([]);
  const [topCustomers, setTopCustomers] = useState<any[]>([]);
  const [newCustomersByMonth, setNewCustomersByMonth] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      api.get('/reports/profit').then(setProfit).catch(console.error),
      api.get('/reports/profit-by-category').then(setByCategory).catch(console.error),
      api.get('/reports/top-products?limit=10').then(setTopProducts).catch(console.error),
      api.get('/reports/daily-profit?days=30').then(setDaily).catch(console.error),
      api.get('/analytics/top-customers?limit=10').then(setTopCustomers).catch(console.error),
      api
        .get('/analytics/new-customers-by-month?months=6')
        .then(setNewCustomersByMonth)
        .catch(console.error),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <PageHeader title="Reportes y Ganancias" subtitle="Análisis de ingresos y clientes" />
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
        <Skeleton className="mb-8 h-64" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  const hasProfitData =
    (profit?.totalRevenue ?? 0) > 0 || (profit?.totalCost ?? 0) > 0 || (profit?.totalProfit ?? 0) > 0;

  return (
    <div>
      <PageHeader title="Reportes y Ganancias" subtitle="Análisis de ingresos y clientes" />

      {!hasProfitData &&
      daily.length === 0 &&
      byCategory.length === 0 &&
      topProducts.length === 0 &&
      topCustomers.length === 0 &&
      newCustomersByMonth.length === 0 ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title="Sin datos aún"
            description="Los reportes aparecerán aquí cuando registres ventas."
          />
        </Card>
      ) : (
        <>
          <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            <Card interactive>
              <h3 className="text-sm font-medium text-slate-500">Ingresos Totales</h3>
              <p className="mt-2 text-3xl font-bold tabular-nums text-brand-600">
                S/ {profit?.totalRevenue?.toFixed(2) ?? '0.00'}
              </p>
            </Card>
            <Card interactive>
              <h3 className="text-sm font-medium text-slate-500">Costos Totales</h3>
              <p className="mt-2 text-3xl font-bold tabular-nums text-danger">
                S/ {profit?.totalCost?.toFixed(2) ?? '0.00'}
              </p>
            </Card>
            <Card interactive>
              <h3 className="text-sm font-medium text-slate-500">Ganancia Neta</h3>
              <p className="mt-2 text-3xl font-bold tabular-nums text-success">
                S/ {profit?.totalProfit?.toFixed(2) ?? '0.00'}
              </p>
            </Card>
          </div>

          <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-4 text-xl font-bold text-slate-900">Ganancia Diaria (últimos 30 días)</h2>
              {daily.length === 0 ? (
                <EmptyState
                  icon={BarChart3}
                  title="Sin datos aún"
                  description="La ganancia diaria aparecerá aquí."
                />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={daily}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="profit"
                      stroke={CHART_COLORS.success}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card>
              <h2 className="mb-4 text-xl font-bold text-slate-900">Ganancia por Categoría</h2>
              {byCategory.length === 0 ? (
                <EmptyState
                  icon={BarChart3}
                  title="Sin datos aún"
                  description="La ganancia por categoría aparecerá aquí."
                />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={byCategory}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="category" tick={{ fontSize: 10 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="profit" fill={CHART_COLORS.brand} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          <div className="mb-8 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
            <div className="border-b border-slate-100 p-6">
              <h2 className="text-xl font-bold text-slate-900">Top 10 Productos Más Vendidos</h2>
            </div>
            {topProducts.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="Sin datos aún"
                description="Los productos más vendidos aparecerán aquí."
              />
            ) : (
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-surface-muted">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">#</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">
                      Producto
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">
                      Vendidos
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">
                      Ingresos
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">
                      Ganancia
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {topProducts.map((p: any, i: number) => (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap px-6 py-4 text-sm tabular-nums text-slate-500">
                        {i + 1}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900">{p.nombre}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium tabular-nums">
                        {p.totalSold}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm tabular-nums text-slate-500">
                        S/ {Number(p.revenue).toFixed(2)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium tabular-nums text-success">
                        S/ {Number(p.profit).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
              <div className="border-b border-slate-100 p-6">
                <h2 className="text-xl font-bold text-slate-900">Top 10 Clientes por Gasto</h2>
              </div>
              {topCustomers.length === 0 ? (
                <EmptyState
                  icon={BarChart3}
                  title="Sin datos aún"
                  description="Los mejores clientes aparecerán aquí."
                />
              ) : (
                <table className="min-w-full divide-y divide-slate-100">
                  <thead className="bg-surface-muted">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">#</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">
                        Cliente
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">
                        Pedidos
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">
                        Total Gastado
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {topCustomers.map((c: any, i: number) => (
                      <tr key={c.id}>
                        <td className="whitespace-nowrap px-6 py-4 text-sm tabular-nums text-slate-500">
                          {i + 1}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900">{c.name}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm tabular-nums">{c.totalOrders}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium tabular-nums text-success">
                          S/ {c.totalSpent.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <Card>
              <h2 className="mb-4 text-xl font-bold text-slate-900">Clientes Nuevos por Mes</h2>
              {newCustomersByMonth.length === 0 ? (
                <EmptyState
                  icon={BarChart3}
                  title="Sin datos aún"
                  description="Los clientes nuevos por mes aparecerán aquí."
                />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={newCustomersByMonth}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill={CHART_COLORS.brand} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
