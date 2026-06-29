'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const PIE_COLORS = ['#3b82f6', '#10b981'];

export default function DashboardHome() {
  const [overview, setOverview] = useState<any>(null);
  const [orderStats, setOrderStats] = useState<any>(null);
  const [customerAnalytics, setCustomerAnalytics] = useState<any>(null);
  const [salesTrend, setSalesTrend] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [topCustomers, setTopCustomers] = useState<any[]>([]);

  useEffect(() => {
    api.get('/analytics/overview').then(setOverview).catch(console.error);
    api.get('/orders/stats').then(setOrderStats).catch(console.error);
    api.get('/analytics/customers').then(setCustomerAnalytics).catch(console.error);
    api.get('/analytics/sales-trend?days=14').then(setSalesTrend).catch(console.error);
    api.get('/analytics/top-products?limit=5').then(setTopProducts).catch(console.error);
    api.get('/analytics/top-customers?limit=5').then(setTopCustomers).catch(console.error);
  }, []);

  const pieData = customerAnalytics
    ? [
        { name: 'Nuevos', value: customerAnalytics.newOnly },
        { name: 'Recurrentes', value: customerAnalytics.returning },
      ]
    : [];

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Pedidos Hoy</h3>
          <p className="text-3xl font-bold text-blue-600 mt-2">{overview?.orders?.today ?? orderStats?.today ?? 0}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Pedidos Este Mes</h3>
          <p className="text-3xl font-bold text-green-600 mt-2">{overview?.orders?.month ?? orderStats?.month ?? 0}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Clientes en Cartera</h3>
          <p className="text-3xl font-bold text-purple-600 mt-2">{overview?.customers?.total ?? 0}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Ingresos del Mes</h3>
          <p className="text-3xl font-bold text-gray-800 mt-2">S/ {(overview?.revenue?.month ?? 0).toFixed(0)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Clientes Nuevos (mes)</h3>
          <p className="text-2xl font-bold text-blue-600 mt-2">{overview?.customers?.newThisMonth ?? 0}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Tasa de Recurrencia</h3>
          <p className="text-2xl font-bold text-green-600 mt-2">
            {((overview?.customers?.returningRate ?? 0) * 100).toFixed(0)}%
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Ingresos Hoy</h3>
          <p className="text-2xl font-bold text-gray-800 mt-2">S/ {(overview?.revenue?.today ?? 0).toFixed(2)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">Pedidos (últimos 14 días)</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={salesTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="orders" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">Clientes: Nuevos vs Recurrentes</h2>
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
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-4 border-b font-bold">Top 5 Productos Más Vendidos</div>
          <table className="min-w-full divide-y divide-gray-200">
            <tbody>
              {topProducts.map((p: any, i: number) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 text-sm text-gray-500">{i + 1}</td>
                  <td className="px-4 py-3 text-sm">{p.nombre}</td>
                  <td className="px-4 py-3 text-sm font-medium">{p.totalSold} uds.</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-4 border-b font-bold">Top 5 Clientes por Gasto</div>
          <table className="min-w-full divide-y divide-gray-200">
            <tbody>
              {topCustomers.map((c: any, i: number) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 text-sm text-gray-500">{i + 1}</td>
                  <td className="px-4 py-3 text-sm">{c.name}</td>
                  <td className="px-4 py-3 text-sm font-medium">S/ {c.totalSpent.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {orderStats?.byStatus && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Pedidos por Estado</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {orderStats.byStatus.map((s: any) => (
              <div key={s.status} className="text-center p-4 bg-gray-50 rounded">
                <p className="text-sm text-gray-600">{s.status}</p>
                <p className="text-2xl font-bold text-gray-800">{s._count}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
