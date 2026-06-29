'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

export default function ReportsPage() {
  const [profit, setProfit] = useState<any>(null);
  const [byCategory, setByCategory] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [daily, setDaily] = useState<any[]>([]);

  useEffect(() => {
    api.get('/reports/profit').then(setProfit).catch(console.error);
    api.get('/reports/profit-by-category').then(setByCategory).catch(console.error);
    api.get('/reports/top-products?limit=10').then(setTopProducts).catch(console.error);
    api.get('/reports/daily-profit?days=30').then(setDaily).catch(console.error);
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Reportes y Ganancias</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Ingresos Totales</h3>
          <p className="text-3xl font-bold text-blue-600 mt-2">S/ {profit?.totalRevenue?.toFixed(2) || '0.00'}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Costos Totales</h3>
          <p className="text-3xl font-bold text-red-600 mt-2">S/ {profit?.totalCost?.toFixed(2) || '0.00'}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Ganancia Neta</h3>
          <p className="text-3xl font-bold text-green-600 mt-2">S/ {profit?.totalProfit?.toFixed(2) || '0.00'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">Ganancia Diaria (últimos 30 días)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">Ganancia por Categoría</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byCategory}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" tick={{ fontSize: 10 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="profit" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold">Top 10 Productos Más Vendidos</h2>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendidos</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ingresos</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ganancia</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {topProducts.map((p: any, i: number) => (
              <tr key={p.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{i + 1}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{p.nombre}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{p.totalSold}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">S/ {Number(p.revenue).toFixed(2)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">S/ {Number(p.profit).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}