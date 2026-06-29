'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ nombre: '', orden: 0 });

  useEffect(() => { loadCategories(); }, []);

  const loadCategories = () => { api.get('/categories').then(setCategories).catch(console.error); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
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
      setLoading(false);
    }
  };

  const handleEdit = (cat: any) => {
    setEditing(cat);
    setForm({ nombre: cat.nombre, orden: cat.orden });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    toast.custom((t) => (
      <div className="bg-white p-4 rounded-lg shadow-lg border">
        <p className="mb-3 font-medium">¿Eliminar categoría?</p>
        <div className="flex gap-2">
          <button onClick={async () => {
            toast.dismiss(t);
            await api.delete(`/categories/${id}`);
            toast.success('Categoría eliminada');
            loadCategories();
          }} className="bg-red-600 text-white px-3 py-1 rounded text-sm">Eliminar</button>
          <button onClick={() => toast.dismiss(t)} className="bg-gray-200 px-3 py-1 rounded text-sm">Cancelar</button>
        </div>
      </div>
    ), { duration: 10000 });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Categorías</h1>
        <button onClick={() => { setShowForm(true); setEditing(null); setForm({ nombre: '', orden: 0 }); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          + Nueva Categoría
        </button>
      </div>

      {showForm && (
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-bold mb-4">{editing ? 'Editar' : 'Nueva'} Categoría</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Nombre</label>
              <input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Orden</label>
              <input type="number" value={form.orden} onChange={(e) => setForm({ ...form, orden: parseInt(e.target.value) })} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">Guardar</button>
              <button type="button" onClick={() => setShowForm(false)} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300">Cancelar</button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Orden</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Productos</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {categories.map((c: any) => (
              <tr key={c.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{c.nombre}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{c.orden}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{c._count?.products || 0}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button onClick={() => handleEdit(c)} className="text-blue-600 hover:text-blue-800 mr-3">Editar</button>
                  <button onClick={() => handleDelete(c.id)} className="text-red-600 hover:text-red-800">Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}