'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

export default function ProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ sku: '', nombre: '', descripcion: '', categoryId: '', costPrice: 0, salePrice: 0, stock: 0, minStock: 0 });

  useEffect(() => {
    loadProducts();
    api.get('/categories').then(setCategories).catch(console.error);
  }, []);

  const loadProducts = () => {
    api.get('/products').then(setProducts).catch(console.error);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editing) {
        await api.put(`/products/${editing.id}`, form);
        toast.success('Producto actualizado');
      } else {
        await api.post('/products', form);
        toast.success('Producto creado');
      }
      setShowForm(false);
      setEditing(null);
      setForm({ sku: '', nombre: '', descripcion: '', categoryId: '', costPrice: 0, salePrice: 0, stock: 0, minStock: 0 });
      loadProducts();
    } catch {
      toast.error('Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (product: any) => {
    setEditing(product);
    setForm({
      sku: product.sku,
      nombre: product.nombre,
      descripcion: product.descripcion || '',
      categoryId: product.categoryId,
      costPrice: Number(product.costPrice),
      salePrice: Number(product.salePrice),
      stock: product.stock,
      minStock: product.minStock,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    toast.custom((t) => (
      <div className="bg-white p-4 rounded-lg shadow-lg border">
        <p className="mb-3 font-medium">¿Eliminar producto?</p>
        <div className="flex gap-2">
          <button onClick={async () => {
            toast.dismiss(t);
            await api.delete(`/products/${id}`);
            toast.success('Producto eliminado');
            loadProducts();
          }} className="bg-red-600 text-white px-3 py-1 rounded text-sm">Eliminar</button>
          <button onClick={() => toast.dismiss(t)} className="bg-gray-200 px-3 py-1 rounded text-sm">Cancelar</button>
        </div>
      </div>
    ), { duration: 10000 });
  };

  const profit = form.salePrice - form.costPrice;
  const margin = form.salePrice > 0 ? ((profit / form.salePrice) * 100).toFixed(1) : '0';

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Productos</h1>
        <button onClick={() => { setShowForm(true); setEditing(null); setForm({ sku: '', nombre: '', descripcion: '', categoryId: '', costPrice: 0, salePrice: 0, stock: 0, minStock: 0 }); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          + Nuevo Producto
        </button>
      </div>

      {showForm && (
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-bold mb-4">{editing ? 'Editar' : 'Nuevo'} Producto</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">SKU</label>
              <input type="text" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Nombre</label>
              <input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Categoría</label>
              <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" required>
                <option value="">Seleccionar...</option>
                {categories.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Descripción</label>
              <input type="text" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Costo (S/)</label>
              <input type="number" step="0.01" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: parseFloat(e.target.value) })} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Precio Venta (S/)</label>
              <input type="number" step="0.01" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: parseFloat(e.target.value) })} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Stock</label>
              <input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: parseInt(e.target.value) })} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Stock Mínimo</label>
              <input type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: parseInt(e.target.value) })} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
            </div>
            <div className="md:col-span-2 bg-gray-50 p-4 rounded">
              <p className="text-sm text-gray-600">Ganancia: <span className="font-bold text-green-600">S/ {profit.toFixed(2)}</span> ({margin}% margen)</p>
            </div>
            <div className="md:col-span-2 flex gap-2">
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoría</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Costo</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Precio</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ganancia</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {products.map((p: any) => (
              <tr key={p.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{p.sku}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{p.nombre}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.category?.nombre}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">S/ {Number(p.costPrice).toFixed(2)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">S/ {Number(p.salePrice).toFixed(2)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">S/ {(Number(p.salePrice) - Number(p.costPrice)).toFixed(2)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${p.stock <= p.minStock ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                    {p.stock}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button onClick={() => handleEdit(p)} className="text-blue-600 hover:text-blue-800 mr-3">Editar</button>
                  <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:text-red-800">Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}