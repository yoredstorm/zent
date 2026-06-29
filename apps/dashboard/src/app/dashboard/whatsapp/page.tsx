'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

const OPENWA_URL = 'http://77.93.154.87:2785';

export default function WhatsAppPage() {
  const [status, setStatus] = useState<any>(null);
  const [qr, setQr] = useState<string>('');

  useEffect(() => { loadStatus(); }, []);

  const loadStatus = async () => {
    try { const data = await api.get('/openwa/status'); setStatus(data); }
    catch { setStatus({ status: 'error', message: 'No se pudo conectar con OpenWA' }); }
  };

  const handleGetQR = async () => {
    try {
      const data = await api.get('/openwa/qr');
      if (data.qr) { setQr(data.qr); toast.success('QR generado'); }
      else { toast.error(data.error || 'No se pudo obtener el QR'); }
    } catch { toast.error('No se pudo obtener el QR'); }
  };

  const openOpenWA = () => {
    window.open(OPENWA_URL, '_blank', 'noopener,noreferrer');
  };

  const statusColors: Record<string, string> = {
    connected: 'bg-green-100 text-green-800',
    disconnected: 'bg-red-100 text-red-800',
    connecting: 'bg-yellow-100 text-yellow-800',
    qr: 'bg-blue-100 text-blue-800',
    no_sessions: 'bg-gray-100 text-gray-800',
    error: 'bg-red-100 text-red-800',
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-6">WhatsApp - Sesión</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">Estado de Conexión</h2>
          <div className="flex items-center gap-3 mb-6">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[status?.status] || statusColors.error}`}>
              {status?.status === 'connected' ? 'Conectado' :
               status?.status === 'disconnected' ? 'Desconectado' :
               status?.status === 'connecting' ? 'Conectando...' :
               status?.status === 'qr' ? 'Esperando QR' :
               status?.status === 'no_sessions' ? 'Sin sesiones' :
               status?.status || 'Error'}
            </span>
          </div>

          {status?.status === 'no_sessions' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-blue-800 mb-2">
                Para vincular WhatsApp, abre el dashboard de OpenWA:
              </p>
              <button onClick={openOpenWA}
                className="text-blue-600 font-medium hover:underline">
                {OPENWA_URL}
              </button>
              <p className="text-xs text-blue-600 mt-2">
                Allí puedes crear una sesión y escanear el código QR con tu teléfono.
              </p>
            </div>
          )}

          <div className="space-y-3">
            <button onClick={handleGetQR} className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
              Obtener Código QR
            </button>
            <button onClick={loadStatus} className="w-full bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300">
              Refrescar Estado
            </button>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">Código QR</h2>
          {qr ? (
            <div className="text-center">
              <img src={qr} alt="QR Code" className="mx-auto max-w-xs" />
              <p className="mt-4 text-sm text-gray-600">Escanea este código con tu teléfono para vincular WhatsApp</p>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <p className="text-6xl mb-4">📱</p>
              <p>Haz clic en "Obtener Código QR" para generar el código</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold mb-4">Dashboard de OpenWA</h2>
        <p className="text-gray-600 mb-4">
          Usa el dashboard de OpenWA para gestionar sesiones, ver mensajes y configurar webhooks.
        </p>
        <button onClick={openOpenWA}
          className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700">
          Abrir OpenWA Dashboard →
        </button>
      </div>
    </div>
  );
}