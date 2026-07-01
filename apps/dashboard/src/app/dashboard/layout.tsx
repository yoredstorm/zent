'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const navItems = [
  { href: '/dashboard', label: 'Inicio', icon: '🏠' },
  { href: '/dashboard/products', label: 'Productos', icon: '📦' },
  { href: '/dashboard/categories', label: 'Categorías', icon: '📂' },
  { href: '/dashboard/catalog', label: 'Catálogo PDF', icon: '📋' },
  { href: '/dashboard/inventory', label: 'Inventario', icon: '📊' },
  { href: '/dashboard/customers', label: 'Clientes', icon: '👥' },
  { href: '/dashboard/orders', label: 'Pedidos', icon: '🛒' },
  { href: '/dashboard/reports', label: 'Reportes', icon: '📈' },
  { href: '/dashboard/whatsapp', label: 'WhatsApp', icon: '💬' },
  { href: '/dashboard/settings/whatsapp', label: 'Configuración', icon: '⚙️' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [whatsappLinked, setWhatsappLinked] = useState<boolean>(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.push('/login');
      return;
    }
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setUser(payload);
    } catch {
      router.push('/login');
    }
  }, [router]);

  useEffect(() => {
    fetch('/api/setup/status', { cache: 'no-store' })
      .then((r) => r.json())
      .then((s) => {
        if (s && s.installed === false) {
          router.replace('/setup');
        } else if (s) {
          setWhatsappLinked(Boolean(s.whatsappLinked));
        }
      })
      .catch(() => {});
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    router.push('/login');
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-100 flex">
      <aside className="w-64 bg-white shadow-lg">
        <div className="p-6 border-b">
          <h1 className="text-xl font-bold text-gray-800">Inventario</h1>
          <p className="text-sm text-gray-500 mt-1">{user.email}</p>
        </div>
        <nav className="p-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg transition ${
                pathname === item.href
                  ? 'bg-blue-50 text-blue-600 font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-0 w-64 p-4 border-t">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition"
          >
            <span>🚪</span>
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        {!whatsappLinked && (
          <div className="bg-amber-50 border-b border-amber-200 px-8 py-3 flex items-center justify-between">
            <span className="text-sm text-amber-800">
              ⚠️ WhatsApp no vinculado. El bot de ventas no recibira mensajes hasta vincularlo.
            </span>
            <Link
              href="/dashboard/settings/whatsapp"
              className="text-sm font-medium text-amber-900 underline whitespace-nowrap"
            >
              Vincular ahora
            </Link>
          </div>
        )}
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}