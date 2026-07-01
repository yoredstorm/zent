'use client';

import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

export default function CatalogPage() {
  const [catalog, setCatalog] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadCatalog = () => {
    api.get('/catalog-pdf').then(setCatalog).catch(() => setCatalog(null));
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.error('Solo se permiten archivos PDF');
      return;
    }
    setLoading(true);
    try {
      const { url } = await api.upload('/uploads/document', file);
      await api.post('/catalog-pdf', { url });
      toast.success('Catálogo PDF actualizado');
      loadCatalog();
    } catch {
      toast.error('Error al subir el catálogo');
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDeactivate = async () => {
    if (!catalog?.id) return;
    try {
      await api.delete(`/catalog-pdf/${catalog.id}`);
      toast.success('Catálogo desactivado');
      setCatalog(null);
    } catch {
      toast.error('Error al desactivar');
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Catálogo PDF</h1>
      <p className="text-gray-600 mb-6">
        Sube un PDF general del catálogo. Los clientes lo reciben por WhatsApp con la opción 1 del menú.
      </p>

      <div className="bg-white rounded-lg shadow p-6 max-w-xl">
        <h2 className="text-lg font-semibold mb-4">Catálogo activo</h2>
        {catalog ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Subido: {new Date(catalog.uploadedAt).toLocaleString()}
            </p>
            <a
              href={catalog.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline text-sm"
            >
              Ver PDF actual
            </a>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={loading}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Subiendo...' : 'Reemplazar PDF'}
              </button>
              <button
                onClick={handleDeactivate}
                className="bg-red-100 text-red-700 px-4 py-2 rounded-lg hover:bg-red-200"
              >
                Desactivar
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-gray-500 mb-4">No hay catálogo PDF activo.</p>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Subiendo...' : 'Subir PDF'}
            </button>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleUpload}
        />
      </div>
    </div>
  );
}
