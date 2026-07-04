'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';

type SessionInfo = { id: string; status: string };

export default function WhatsappSettingsPage() {
  const [status, setStatus] = useState<string>('idle');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [qr, setQr] = useState<string>('');
  const [linking, setLinking] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const connected = status === 'connected' || status === 'ready';

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.get<{ status: string; sessions?: SessionInfo[] }>('/openwa/status');
      setStatus(s?.status || 'unknown');
      setSessions(s?.sessions ?? []);
      return s?.status;
    } catch {
      setStatus('error');
      return 'error';
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refreshStatus]);

  const startLinking = async () => {
    setLinking(true);
    setStatus('connecting');
    try {
      const data = await api.post<{ qr?: string; pending?: boolean; error?: string }>(
        '/setup/whatsapp/connect',
      );
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
          try {
            const q = await api.get<{ qr?: string }>('/openwa/qr');
            if (q?.qr) setQr(q.qr);
          } catch {
            /* ignore */
          }
        }
      }, 2000);
    } catch (err: any) {
      setLinking(false);
      toast.error(err?.response?.data?.message || 'No se pudo iniciar vinculacion');
    }
  };

  const resumeSessions = async () => {
    setResuming(true);
    try {
      const result = await api.post<{ resumed: string[]; skipped: string[] }>('/openwa/sessions/resume');
      toast.success(
        result.resumed.length
          ? `Sesiones reanudadas: ${result.resumed.join(', ')}`
          : 'No habia sesiones para reanudar',
      );
      await refreshStatus();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'No se pudo reconectar');
    } finally {
      setResuming(false);
    }
  };

  const repairWebhook = async () => {
    setRepairing(true);
    try {
      const result = await api.post<{ ok: boolean; error?: string }>('/openwa/repair-webhook');
      if (result.ok) toast.success('Webhook y zent-flow reparados');
      else toast.error(result.error || 'Reparacion incompleta');
      await refreshStatus();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'No se pudo reparar webhook');
    } finally {
      setRepairing(false);
    }
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Configuracion · WhatsApp</h1>
      <p className="text-sm text-gray-500 mb-6">
        Vincula o reconecta la sesion sin entrar al panel OpenWA.
      </p>

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
                  : status === 'no_sessions'
                    ? 'Sin sesion'
                    : 'Desconectado'}
          </span>
        </div>

        {sessions.length > 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <div className="font-medium text-slate-800">Sesiones OpenWA</div>
            <ul className="mt-2 space-y-1">
              {sessions.map((s) => (
                <li key={s.id}>
                  {s.id} — {s.status}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {!connected && !linking ? (
            <Button type="button" onClick={startLinking}>
              Vincular WhatsApp
            </Button>
          ) : null}
          <Button type="button" variant="secondary" loading={resuming} onClick={resumeSessions}>
            Reconectar sesion
          </Button>
          <Button type="button" variant="secondary" loading={repairing} onClick={repairWebhook}>
            Reparar webhook
          </Button>
        </div>

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
            <p className="text-sm text-gray-500">
              Abre WhatsApp → Dispositivos vinculados → Vincular un dispositivo
            </p>
          </div>
        )}

        {connected ? (
          <p className="text-sm text-green-600">La sesion de WhatsApp esta activa y lista para recibir mensajes.</p>
        ) : null}
      </div>
    </div>
  );
}
