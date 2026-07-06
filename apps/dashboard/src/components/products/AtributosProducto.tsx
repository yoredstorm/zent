'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

interface ValorAtributo {
  id: string;
  valor: string;
}

interface Atributo {
  id: string;
  nombre: string;
  values: ValorAtributo[];
}

/**
 * Atributos informativos del producto (Marca, Peso, …).
 * Se muestran en el chat como parte de la descripción.
 */
export function AtributosProducto({ productId }: { productId: string }) {
  const [atributos, setAtributos] = useState<Atributo[]>([]);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let activo = true;
    Promise.all([api.get('/attributes'), api.get(`/products/${productId}`)])
      .then(([attrs, producto]) => {
        if (!activo) return;
        setAtributos(attrs);
        setSeleccionados(
          new Set(
            (producto.attributeValues || []).map((pav: any) => pav.attributeValueId as string),
          ),
        );
      })
      .catch(console.error)
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [productId]);

  const alternar = (valueId: string) => {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(valueId)) next.delete(valueId);
      else next.add(valueId);
      return next;
    });
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      await api.put(`/products/${productId}/attributes`, {
        attributeValueIds: Array.from(seleccionados),
      });
      toast.success('Atributos del producto guardados');
    } catch {
      toast.error('Error al guardar atributos');
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <p className="text-sm text-slate-400">Cargando atributos…</p>;

  const conValores = atributos.filter((a) => a.values.length > 0);
  if (!conValores.length) {
    return (
      <p className="text-sm text-slate-500">
        No hay atributos con valores. Créalos en la sección <strong>Atributos</strong> del menú.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {conValores.map((atributo) => (
        <div key={atributo.id}>
          <p className="mb-1.5 text-sm font-medium text-slate-700">{atributo.nombre}</p>
          <div className="flex flex-wrap gap-2">
            {atributo.values.map((v) => {
              const activo = seleccionados.has(v.id);
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => alternar(v.id)}
                  className={`rounded-full px-3 py-1 text-sm transition ${
                    activo
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {v.valor}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <Button type="button" variant="secondary" loading={guardando} onClick={guardar}>
        Guardar atributos
      </Button>
    </div>
  );
}
