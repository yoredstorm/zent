'use client';

import { useCallback, useEffect, useState } from 'react';
import { FolderTree } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [form, setForm] = useState({ nombre: '', orden: 0 });

  const loadCategories = useCallback(() => {
    setListLoading(true);
    api
      .get('/categories')
      .then(setCategories)
      .catch(console.error)
      .finally(() => setListLoading(false));
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const openCreate = () => {
    setShowForm(true);
    setEditing(null);
    setForm({ nombre: '', orden: 0 });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/categories/${editing.id}`, form);
        toast.success('Categoría actualizada');
      } else {
        await api.post('/categories', form);
        toast.success('Categoría creada');
      }
      setShowForm(false);
      setEditing(null);
      setForm({ nombre: '', orden: 0 });
      loadCategories();
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (cat: any) => {
    setEditing(cat);
    setForm({ nombre: cat.nombre, orden: cat.orden });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    toast.custom(
      (t) => (
        <div className="rounded-lg border bg-white p-4 shadow-lg">
          <p className="mb-3 font-medium">¿Eliminar categoría?</p>
          <div className="flex gap-2">
            <Button
              variant="danger"
              className="text-sm"
              onClick={async () => {
                toast.dismiss(t);
                await api.delete(`/categories/${id}`);
                toast.success('Categoría eliminada');
                loadCategories();
              }}
            >
              Eliminar
            </Button>
            <Button variant="secondary" className="text-sm" onClick={() => toast.dismiss(t)}>
              Cancelar
            </Button>
          </div>
        </div>
      ),
      { duration: 10000 },
    );
  };

  return (
    <div>
      <PageHeader
        title="Categorías"
        subtitle="Organiza tu catálogo para el bot y el dashboard."
        actions={
          <Button type="button" onClick={openCreate}>
            + Nueva categoría
          </Button>
        }
      />

      {showForm && (
        <div className="zent-card mb-6 p-6 animate-fade-in">
          <h2 className="mb-4 text-xl font-bold text-slate-900">{editing ? 'Editar' : 'Nueva'} categoría</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Nombre</label>
              <input
                type="text"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                className="zent-input w-full"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Orden</label>
              <input
                type="number"
                value={form.orden}
                onChange={(e) => setForm({ ...form, orden: parseInt(e.target.value, 10) || 0 })}
                className="zent-input w-full"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" loading={saving}>
                Guardar
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </div>
      )}

      {listLoading ? (
        <div className="zent-card space-y-3 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : categories.length === 0 && !showForm ? (
        <div className="zent-card overflow-hidden">
          <EmptyState
            icon={FolderTree}
            title="Sin categorías"
            description="Crea tu primera categoría para organizar el catálogo."
            action={
              <Button type="button" onClick={openCreate}>
                Crear primera categoría
              </Button>
            }
          />
        </div>
      ) : (
        <div className="zent-card overflow-hidden">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Nombre</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Orden</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Productos</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {categories.map((c: any) => (
                <tr key={c.id} className="hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900">{c.nombre}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500">{c.orden}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500">{c._count?.products || 0}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm">
                    <button
                      type="button"
                      onClick={() => handleEdit(c)}
                      className="mr-3 font-medium text-brand-600 hover:text-brand-700"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      className="font-medium text-danger hover:text-red-600"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
