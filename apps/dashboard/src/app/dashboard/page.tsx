'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function DashboardHome() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    api.get('/orders/stats').then(setStats).catch(console.error);
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Pedidos Totales</h3>
          <p className="text-3xl font-bold text-gray-800 mt-2">{stats?.total || 0}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Hoy</h3>
          <p className="text-3xl font-bold text-blue-600 mt-2">{stats?.today || 0}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Esta Semana</h3>
          <p className="text-3xl font-bold text-green-600 mt-2">{stats?.week || 0}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Este Mes</h3>
          <p className="text-3xl font-bold text-purple-600 mt-2">{stats?.month || 0}</p>
        </div>
      </div>
      <div className="mt-8 bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Pedidos por Estado</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {stats?.byStatus?.map((s: any) => (
            <div key={s.status} className="text-center p-4 bg-gray-50 rounded">
              <p className="text-sm text-gray-600">{s.status}</p>
              <p className="text-2xl font-bold text-gray-800">{s._count}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}