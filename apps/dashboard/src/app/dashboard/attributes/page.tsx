'use client';

import { useCallback, useEffect, useState } from 'react';
import { Tags, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';

interface ValorAtributo {
  id: string;
  valor: string;
  orden: number;
}

interface Atributo {
  id: string;
  nombre: string;
  orden: number;
  values: ValorAtributo[];
}

export default function AttributesPage() {
  const [atributos, setAtributos] = useState<Atributo[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [valorNuevo, setValorNuevo] = useState<Record<string, string>>({});

  const cargar = useCallback(() => {
    setListLoading(true);
    api
      .get('/attributes')
      .then(setAtributos)
      .catch(console.error)
      .finally(() => setListLoading(false));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const crearAtributo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreNuevo.trim()) return;
    setSaving(true);
    try {
      await api.post('/attributes', { nombre: nombreNuevo.trim() });
      toast.success('Atributo creado');
      setNombreNuevo('');
      setShowForm(false);
      cargar();
    } catch (err: any) {
      toast.error(err?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const eliminarAtributo = (atributo: Atributo) => {
    toast.custom(
      (t) => (
        <div className="rounded-lg border bg-white p-4 shadow-lg">
          <p className="mb-3 font-medium">¿Eliminar el atributo “{atributo.nombre}”?</p>
          <div className="flex gap-2">
            <Button
              variant="danger"
              className="text-sm"
              onClick={async () => {
                toast.dismiss(t);
                try {
                  await api.delete(`/attributes/${atributo.id}`);
                  toast.success('Atributo eliminado');
                  cargar();
                } catch (err: any) {
                  toast.error(err?.message || 'No se pudo eliminar');
                }
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

  const agregarValor = async (atributoId: string) => {
    const valor = (valorNuevo[atributoId] || '').trim();
    if (!valor) return;
    try {
      await api.post(`/attributes/${atributoId}/values`, { valor });
      setValorNuevo((prev) => ({ ...prev, [atributoId]: '' }));
      cargar();
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo agregar el valor');
    }
  };

  const eliminarValor = async (valueId: string) => {
    try {
      await api.delete(`/attributes/values/${valueId}`);
      cargar();
    } catch (err: any) {
      toast.error(err?.message || 'Ese valor está en uso por un subproducto');
    }
  };

  return (
    <div>
      <PageHeader
        title="Atributos"
        subtitle="Define características (Color, Material, Talla…) y sus valores para usarlos en productos y subproductos."
        actions={
          <Button type="button" onClick={() => setShowForm(true)}>
            + Nuevo atributo
          </Button>
        }
      />

      {showForm && (
        <div className="zent-card mb-6 p-6 animate-fade-in">
          <h2 className="mb-4 text-xl font-bold text-slate-900">Nuevo atributo</h2>
          <form onSubmit={crearAtributo} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Nombre</label>
              <input
                type="text"
                value={nombreNuevo}
                onChange={(e) => setNombreNuevo(e.target.value)}
                placeholder="Ej: Color, Material, Voltaje…"
                className="zent-input w-full"
                required
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
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : atributos.length === 0 && !showForm ? (
        <div className="zent-card overflow-hidden">
          <EmptyState
            icon={Tags}
            title="Sin atributos"
            description="Crea atributos como Color o Talla para describir tus productos y armar subproductos."
            action={
              <Button type="button" onClick={() => setShowForm(true)}>
                Crear primer atributo
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          {atributos.map((atributo) => (
            <div key={atributo.id} className="zent-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">{atributo.nombre}</h3>
                <button
                  type="button"
                  onClick={() => eliminarAtributo(atributo)}
                  className="text-sm font-medium text-danger hover:text-red-600"
                >
                  Eliminar
                </button>
              </div>
              <div className="mb-3 flex flex-wrap gap-2">
                {atributo.values.length === 0 && (
                  <span className="text-sm text-slate-400">Sin valores aún — agrega el primero abajo.</span>
                )}
                {atributo.values.map((v) => (
                  <span
                    key={v.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
                  >
                    {v.valor}
                    <button
                      type="button"
                      onClick={() => eliminarValor(v.id)}
                      className="text-slate-400 hover:text-danger"
                      aria-label={`Eliminar ${v.valor}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={valorNuevo[atributo.id] || ''}
                  onChange={(e) =>
                    setValorNuevo((prev) => ({ ...prev, [atributo.id]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      agregarValor(atributo.id);
                    }
                  }}
                  placeholder={`Nuevo valor de ${atributo.nombre} (ej: Rojo)`}
                  className="zent-input flex-1"
                />
                <Button type="button" variant="secondary" onClick={() => agregarValor(atributo.id)}>
                  Agregar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
