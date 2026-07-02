'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import { navForRole, Role } from '@/lib/nav';
import { Skeleton } from '@/components/ui/Skeleton';

interface JwtUser {
  email?: string;
  role?: Role;
  sub?: string;
}

function userInitial(user: JwtUser) {
  const source = user.email || user.sub || '?';
  return source.charAt(0).toUpperCase();
}

function SidebarContent({
  user,
  pathname,
  onNavigate,
  onLogout,
}: {
  user: JwtUser;
  pathname: string;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  const role = (user.role as Role) || 'VENDEDOR';
  const items = navForRole(role);

  return (
    <>
      <div className="border-b border-slate-100 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">
            Z
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Zent</h1>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-4" aria-label="Navegación principal">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-label={item.label}
              className={`flex min-h-[44px] items-center gap-3 rounded-xl px-4 py-2.5 text-sm transition ${
                active
                  ? 'bg-brand-50 font-medium text-brand-700'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-100 p-4">
        <button
          type="button"
          onClick={onLogout}
          className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-red-600 transition hover:bg-red-50"
        >
          <LogOut className="h-5 w-5 shrink-0" aria-hidden />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<JwtUser | null>(null);
  const [whatsappLinked, setWhatsappLinked] = useState<boolean>(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    router.push('/login');
  };

  if (!user) {
    return (
      <div className="flex min-h-dvh bg-surface">
        <aside className="hidden w-64 shrink-0 border-r border-slate-100 bg-white lg:block">
          <div className="space-y-4 p-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <div className="space-y-2 px-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        </aside>
        <main className="flex-1 p-4 lg:p-8">
          <Skeleton className="mb-8 h-10 w-48" />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh bg-surface">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-100 bg-white lg:flex">
        <SidebarContent user={user} pathname={pathname} onLogout={handleLogout} />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Cerrar menú"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="relative flex h-full w-64 flex-col bg-white shadow-xl animate-fade-in">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-3 top-4 flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              aria-label="Cerrar menú"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent
              user={user}
              pathname={pathname}
              onNavigate={() => setDrawerOpen(false)}
              onLogout={handleLogout}
            />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-[56px] items-center justify-between border-b border-slate-100 bg-white px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-lg font-bold text-slate-900">Zent</span>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700"
            aria-hidden
          >
            {userInitial(user)}
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          {!whatsappLinked && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3 lg:px-8">
              <span className="text-sm text-amber-800">
                WhatsApp no vinculado. El bot de ventas no recibirá mensajes hasta vincularlo.
              </span>
              <Link
                href="/dashboard/settings/whatsapp"
                className="whitespace-nowrap text-sm font-medium text-amber-900 underline"
              >
                Vincular ahora
              </Link>
            </div>
          )}
          <div className="p-4 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
