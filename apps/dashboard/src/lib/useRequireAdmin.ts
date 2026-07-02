'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Role } from '@/lib/nav';

type JwtPayload = {
  sub?: string;
  email?: string;
  role?: Role;
};

export function useRequireAdmin() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<JwtPayload | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.replace('/login');
      return;
    }
    try {
      const payload = JSON.parse(atob(token.split('.')[1])) as JwtPayload;
      if (payload.role !== 'ADMIN') {
        router.replace('/dashboard');
        return;
      }
      setUser(payload);
      setReady(true);
    } catch {
      router.replace('/login');
    }
  }, [router]);

  return { ready, user };
}
