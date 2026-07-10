'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { etiquetaVariante } from '@/lib/variantes';

interface ValorAtributo {
  id: string;
  valor: string;
}

interface Atributo {
  id: string;
  nombre: string;
  values: ValorAtributo[];
}

interface Variante {
  id: string;
  stock: number;
  salePrice: string | number | null;
  isActive: boolean;
  values: { attributeValue: { id: string; valor: string; attribute: { nombre: string } } }[];
}

/**
 * Subproductos (variantes) con stock propio y precio opcional.
 * El stock del producto padre pasa a ser la suma de sus variantes activas.
 */
export function SubproductosProducto({ productId }: { productId: string }) {
  const [atributos, setAtributos] = useState<Atributo[]>([]);
  const [variantes, setVariantes] = useState<Variante[]>([]);
  const [cargando, setCargando] = useState(true);
  const [creando, setCreando] = useState(false);
  const [nueva, setNueva] = useState<{ valores: Record<string, string>; stock: number; precio: string }>({
    valores: {},
    stock: 0,
    precio: '',
  });

  const cargarVariantes = useCallback(() => {
    api
      .get(`/products/${productId}/variants`)
      .then((rows: Variante[]) => setVariantes(rows.filter((v) => v.isActive)))
      .catch(console.error);
  }, [productId]);

  useEffect(() => {
    let activo = true;
    Promise.all([api.get('/attributes'), api.get(`/products/${productId}/variants`)])
      .then(([attrs, rows]) => {
        if (!activo) return;
        setAtributos(attrs.filter((a: Atributo) => a.values.length > 0));
        setVariantes((rows as Variante[]).filter((v) => v.isActive));
      })
      .catch(console.error)
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [productId]);

  const crear = async () => {
    const attributeValueIds = Object.values(nueva.valores).filter(Boolean);
    if (!attributeValueIds.length) {
      toast.error('Elige al menos un valor (ej: Color = Rojo)');
      return;
    }
    setCreando(true);
    try {
      await api.post(`/products/${productId}/variants`, {
        attributeValueIds,
        stock: nueva.stock,
        salePrice: nueva.precio === '' ? undefined : parseFloat(nueva.precio),
      });
      toast.success('Subproducto creado');
      setNueva({ valores: {}, stock: 0, precio: '' });
      cargarVariantes();
    } catch (err: any) {
      toast.error(err?.message || 'Error al crear el subproducto');
    } finally {
      setCreando(false);
    }
  };

  const actualizarStock = async (variante: Variante, stock: number) => {
    try {
      await api.put(`/products/variants/${variante.id}`, { stock });
      cargarVariantes();
    } catch {
      toast.error('No se pudo actualizar el stock');
    }
  };

  const eliminar = async (variante: Variante) => {
    try {
      await api.delete(`/products/variants/${variante.id}`);
      toast.success('Subproducto eliminado');
      cargarVariantes();
    } catch {
      toast.error('No se pudo eliminar');
    }
  };

  if (cargando) return <p className="text-sm text-slate-400">Cargando subproductos…</p>;

  if (!atributos.length) {
    return (
      <p className="text-sm text-slate-500">
        Para crear subproductos primero define atributos con valores (ej: Color: Rojo, Azul) en la
        sección <strong>Atributos</strong>.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {variantes.length > 0 && (
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-slate-500">
              <th className="py-2 pr-4">Opción</th>
              <th className="py-2 pr-4">Stock</th>
              <th className="py-2 pr-4">Precio</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {variantes.map((v) => (
              <tr key={v.id}>
                <td className="py-2 pr-4 font-medium text-slate-800">{etiquetaVariante(v)}</td>
                <td className="py-2 pr-4">
                  <input
                    type="number"
                    defaultValue={v.stock}
                    min={0}
                    className="zent-input w-20"
                    onBlur={(e) => {
                      const stock = parseInt(e.target.value, 10) || 0;
                      if (stock !== v.stock) actualizarStock(v, stock);
                    }}
                  />
                </td>
                <td className="py-2 pr-4 text-slate-600">
                  {v.salePrice != null ? `S/ ${Number(v.salePrice).toFixed(2)}` : 'Hereda del producto'}
                </td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => eliminar(v)}
                    className="font-medium text-danger hover:text-red-600"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="rounded-lg border border-dashed border-slate-200 p-4">
        <p className="mb-3 text-sm font-medium text-slate-700">Nuevo subproducto</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {atributos.map((atributo) => (
            <div key={atributo.id}>
              <label className="mb-1 block text-xs font-medium text-slate-500">{atributo.nombre}</label>
              <select
                value={nueva.valores[atributo.id] || ''}
                onChange={(e) =>
                  setNueva((prev) => ({
                    ...prev,
                    valores: { ...prev.valores, [atributo.id]: e.target.value },
                  }))
                }
                className="zent-input w-full"
              >
                <option value="">— No aplica —</option>
                {atributo.values.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.valor}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Stock</label>
            <input
              type="number"
              min={0}
              value={nueva.stock}
              onChange={(e) => setNueva((prev) => ({ ...prev, stock: parseInt(e.target.value, 10) || 0 }))}
              className="zent-input w-full"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Precio (vacío = hereda)
            </label>
            <input
              type="number"
              step="0.01"
              min={0}
              value={nueva.precio}
              onChange={(e) => setNueva((prev) => ({ ...prev, precio: e.target.value }))}
              placeholder="Opcional"
              className="zent-input w-full"
            />
          </div>
        </div>
        <div className="mt-3">
          <Button type="button" variant="secondary" loading={creando} onClick={crear}>
            + Agregar subproducto
          </Button>
        </div>
        {variantes.length > 0 && (
          <p className="mt-2 text-xs text-slate-400">
            El stock del producto se recalcula automáticamente como la suma de sus subproductos.
          </p>
        )}
      </div>
    </div>
  );
}
