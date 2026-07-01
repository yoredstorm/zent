'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

async function getJson(url: string) {
  const res = await fetch(url, { cache: 'no-store' });
  return res.json();
}

async function postJson(url: string) {
  const res = await fetch(url, { method: 'POST' });
  return res.json();
}

export default function WhatsappSettingsPage() {
  const [status, setStatus] = useState<string>('idle');
  const [qr, setQr] = useState<string>('');
  const [linking, setLinking] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const connected = status === 'connected' || status === 'ready';

  const refreshStatus = useCallback(async () => {
    const s = await getJson('/api/setup/whatsapp/status');
    setStatus(s?.status || 'unknown');
    return s?.status;
  }, []);

  useEffect(() => {
    refreshStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refreshStatus]);

  const startLinking = async () => {
    setLinking(true);
    setStatus('connecting');
    const data = await postJson('/api/setup/whatsapp/connect');
    if (data?.error) {
      setLinking(false);
      setStatus('error');
      toast.error(data.error);
      return;
    }
    if (data?.qr) setQr(data.qr);
    setStatus(data?.pending ? 'qr_pending' : 'connecting');
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const s = await refreshStatus();
      if (s === 'connected' || s === 'ready') {
        if (pollRef.current) clearInterval(pollRef.current);
        setLinking(false);
        toast.success('WhatsApp vinculado correctamente');
      } else {
        const q = await getJson('/api/setup/whatsapp/qr');
        if (q?.qr) setQr(q.qr);
      }
    }, 2000);
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Configuración · WhatsApp</h1>
      <p className="text-sm text-gray-500 mb-6">Vincula o reconecta la sesión de WhatsApp del bot de ventas.</p>

      <div className="bg-white rounded-lg shadow p-6 space-y-5">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">Estado:</span>
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              connected
                ? 'bg-green-100 text-green-700'
                : status === 'connecting' || status === 'authenticating' || status === 'qr_pending'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-gray-100 text-gray-600'
            }`}
          >
            {connected
              ? 'Conectado'
              : status === 'connecting' || status === 'qr_pending'
                ? 'Esperando escaneo'
                : status === 'authenticating'
                  ? 'Conectando...'
                  : status === 'restarting'
                    ? 'Reiniciando gateway...'
                    : status === 'no_sessions'
                    ? 'Sin sesión'
                    : 'Desconectado'}
          </span>
        </div>

        {!connected && !linking && (
          <button
            onClick={startLinking}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Vincular WhatsApp
          </button>
        )}

        {linking && !connected && (
          <div className="flex flex-col items-center gap-4 py-4">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`}
                alt="QR de WhatsApp"
                className="w-56 h-56 border rounded-lg p-2"
              />
            ) : (
              <div className="w-56 h-56 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
                Generando QR...
              </div>
            )}
            <p className="text-sm text-gray-500">Abre WhatsApp → Dispositivos vinculados → Vincular un dispositivo</p>
          </div>
        )}

        {connected && (
          <p className="text-sm text-green-600">La sesión de WhatsApp está activa y lista para recibir mensajes.</p>
        )}
      </div>
    </div>
  );
}
