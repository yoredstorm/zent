'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Trash2, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { SettingsNav } from '@/components/settings/SettingsNav';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { api } from '@/lib/api';
import { generatePassword } from '@/lib/currencies';
import { type Role, roleBadgeTone, roleLabels } from '@/lib/nav';
import { useRequireAdmin } from '@/lib/useRequireAdmin';

type TeamUser = {
  id: string;
  email: string;
  name?: string | null;
  role: Role;
};

const ASSIGNABLE_ROLES: Role[] = ['VENDEDOR', 'AGENTE', 'ADMIN'];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}

export default function UsersSettingsPage() {
  const { ready, user: currentUser } = useRequireAdmin();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('VENDEDOR');
  const [password, setPassword] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<TeamUser[]>('/users');
      setUsers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'No se pudo cargar el equipo');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready) loadUsers();
  }, [ready, loadUsers]);

  const openModal = () => {
    setEmail('');
    setName('');
    setRole('VENDEDOR');
    setPassword(generatePassword());
    setModalOpen(true);
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(password);
      toast.success('Contrasena copiada');
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/\S+@\S+\.\S+/.test(email)) {
      toast.error('Email invalido');
      return;
    }
    if (!name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }

    setCreating(true);
    try {
      await api.post('/users', {
        email: email.trim(),
        name: name.trim(),
        role,
        password,
      });
      toast.success('Usuario creado');
      setModalOpen(false);
      loadUsers();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error al crear usuario');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (u: TeamUser) => {
    if (u.id === currentUser?.sub) {
      toast.error('No puedes eliminar tu propia cuenta');
      return;
    }
    const label = u.name || u.email;
    if (!window.confirm(`Eliminar a ${label}? Esta accion no se puede deshacer.`)) return;

    setDeletingId(u.id);
    try {
      await api.delete(`/users/${u.id}`);
      toast.success('Usuario eliminado');
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error al eliminar');
    } finally {
      setDeletingId(null);
    }
  };

  if (!ready) return null;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Configuracion"
        subtitle="Gestiona los usuarios con acceso al panel"
        actions={
          <Button type="button" onClick={openModal}>
            <UserPlus className="h-4 w-4" />
            Nuevo usuario
          </Button>
        }
      />
      <SettingsNav />

      {loading ? (
        <Card className="!p-0 overflow-hidden">
          <div className="space-y-0 divide-y divide-slate-100 p-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4 py-4">
                <Skeleton className="h-5 flex-1" />
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </div>
        </Card>
      ) : users.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="Sin usuarios adicionales"
            description="Crea cuentas para vendedores o agentes que necesiten acceso al panel."
            action={
              <Button type="button" onClick={openModal}>
                <UserPlus className="h-4 w-4" />
                Crear primer usuario
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-6 py-3">Nombre</th>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Rol</th>
                  <th className="px-6 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4 font-medium text-slate-900">{u.name || '—'}</td>
                    <td className="px-6 py-4 text-slate-600">{u.email}</td>
                    <td className="px-6 py-4">
                      <Badge tone={roleBadgeTone(u.role)}>{roleLabels[u.role]}</Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        type="button"
                        variant="secondary"
                        className="!min-h-0 !px-3 !py-2 text-danger hover:bg-danger-soft"
                        disabled={deletingId === u.id || u.id === currentUser?.sub}
                        loading={deletingId === u.id}
                        onClick={() => handleDelete(u)}
                        aria-label={`Eliminar ${u.email}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-user-title"
        >
          <Card className="w-full max-w-md !p-6">
            <h2 id="create-user-title" className="text-lg font-semibold text-slate-900">
              Nuevo usuario
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              La contrasena generada solo se muestra una vez. Copiala antes de cerrar.
            </p>

            <form onSubmit={handleCreate} className="mt-5 space-y-4">
              <Field label="Email">
                <input
                  type="email"
                  className="zent-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vendedor@mitienda.com"
                  required
                />
              </Field>
              <Field label="Nombre">
                <input
                  className="zent-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Maria Lopez"
                  required
                />
              </Field>
              <Field label="Rol">
                <select
                  className="zent-input"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  {ASSIGNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {roleLabels[r]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Contrasena generada">
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="zent-input font-mono text-xs"
                    value={password}
                    readOnly
                  />
                  <Button type="button" variant="secondary" onClick={copyPassword} aria-label="Copiar contrasena">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </Field>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" loading={creating}>
                  Crear usuario
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
