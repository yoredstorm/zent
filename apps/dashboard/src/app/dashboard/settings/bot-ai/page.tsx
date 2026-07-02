'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { SettingsNav } from '@/components/settings/SettingsNav';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { api } from '@/lib/api';
import { useRequireAdmin } from '@/lib/useRequireAdmin';

type BotAiSettings = {
  botAiEnabled: boolean;
  botAiBusinessDescription?: string | null;
  botAiPolicies?: string | null;
  botAiPlaybook?: string | null;
  novitaApiKeyConfigured: boolean;
  novitaBotEnabled: boolean;
  novitaModel: string;
  novitaBalanceUsd: number | null;
  hasSufficientBalance: boolean;
};

type TemplateVariable = {
  key: string;
  label: string;
  description: string;
};

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export default function BotAiSettingsPage() {
  const { ready } = useRequireAdmin();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [botAiEnabled, setBotAiEnabled] = useState(false);
  const [novitaBotEnabled, setNovitaBotEnabled] = useState(false);
  const [businessDescription, setBusinessDescription] = useState('');
  const [policies, setPolicies] = useState('');
  const [playbook, setPlaybook] = useState('');
  const [novitaApiKey, setNovitaApiKey] = useState('');
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [balanceUsd, setBalanceUsd] = useState<number | null>(null);
  const [hasBalance, setHasBalance] = useState(false);
  const [novitaModel, setNovitaModel] = useState('');
  const [variables, setVariables] = useState<TemplateVariable[]>([]);
  const [preview, setPreview] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [settings, vars] = await Promise.all([
        api.get<BotAiSettings>('/settings/bot-ai'),
        api.get<TemplateVariable[]>('/settings/bot-ai/variables'),
      ]);
      setBotAiEnabled(settings.botAiEnabled);
      setNovitaBotEnabled(settings.novitaBotEnabled);
      setBusinessDescription(settings.botAiBusinessDescription ?? '');
      setPolicies(settings.botAiPolicies ?? '');
      setPlaybook(settings.botAiPlaybook ?? '');
      setKeyConfigured(settings.novitaApiKeyConfigured);
      setBalanceUsd(settings.novitaBalanceUsd);
      setHasBalance(settings.hasSufficientBalance);
      setNovitaModel(settings.novitaModel);
      setVariables(vars);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'No se pudo cargar la configuracion del asistente');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready) loadAll();
  }, [ready, loadAll]);

  const statusLabel = useMemo(() => {
    if (!novitaBotEnabled || !botAiEnabled) return 'Desactivado';
    if (!keyConfigured) return 'Falta API key';
    if (!hasBalance) return 'Saldo insuficiente';
    return 'Activo';
  }, [botAiEnabled, novitaBotEnabled, keyConfigured, hasBalance]);

  const statusTone = useMemo(() => {
    if (statusLabel === 'Activo') return 'bg-green-100 text-green-800';
    if (statusLabel === 'Desactivado') return 'bg-slate-100 text-slate-600';
    return 'bg-amber-100 text-amber-800';
  }, [statusLabel]);

  const insertVariable = (key: string) => {
    setPlaybook((prev) => `${prev}{{${key}}}`);
  };

  const loadPreview = async () => {
    setPreviewLoading(true);
    try {
      const data = await api.get<{ systemPrompt: string }>('/settings/bot-ai/preview');
      setPreview(data.systemPrompt);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'No se pudo generar la vista previa');
    } finally {
      setPreviewLoading(false);
    }
  };

  const testKey = async () => {
    setTesting(true);
    try {
      const payload = novitaApiKey.trim() ? { novitaApiKey: novitaApiKey.trim() } : {};
      const data = await api.post<{ ok: boolean; balanceUsd?: number; message?: string }>(
        '/setup/novita/test',
        payload,
      );
      if (data.ok) {
        toast.success(`Conexion OK — saldo: $${(data.balanceUsd ?? 0).toFixed(4)} USD`);
        setBalanceUsd(data.balanceUsd ?? null);
        setHasBalance((data.balanceUsd ?? 0) >= 0.01);
      } else {
        toast.error(data.message || 'Error al probar la API key');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error al probar Novita');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        botAiEnabled,
        novitaBotEnabled,
        botAiBusinessDescription: businessDescription.trim() || null,
        botAiPolicies: policies.trim() || null,
        botAiPlaybook: playbook.trim() || null,
      };
      if (novitaApiKey.trim()) payload.novitaApiKey = novitaApiKey.trim();

      await api.patch('/settings/bot-ai', payload);
      toast.success('Asistente IA guardado');
      setNovitaApiKey('');
      await loadAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (!ready) return null;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Asistente IA"
        subtitle="Configura el bot conversacional de WhatsApp con Novita AI"
      />
      <SettingsNav />

      {loading ? (
        <Card>
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </Card>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Estado</h2>
                <p className="text-sm text-slate-500">Modelo: {novitaModel}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-sm font-medium ${statusTone}`}>{statusLabel}</span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={botAiEnabled}
                  onChange={(e) => setBotAiEnabled(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Activar asistente en la tienda
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={novitaBotEnabled}
                  onChange={(e) => setNovitaBotEnabled(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Habilitar en servidor (NOVITA_BOT_ENABLED)
              </label>
            </div>

            <p className="mt-3 text-sm text-slate-600">
              Saldo Novita:{' '}
              {balanceUsd != null ? `$${balanceUsd.toFixed(4)} USD` : 'No disponible'}
              {keyConfigured ? ' · API key configurada' : ' · Sin API key'}
            </p>
          </Card>

          <Card className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Novita API</h2>
            <Field
              label="API Key"
              hint={
                keyConfigured
                  ? 'Deja vacio para mantener la clave actual. Nunca se muestra en pantalla.'
                  : 'Obtén tu clave en novita.ai/settings/key-management'
              }
            >
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="password"
                  className="zent-input flex-1"
                  value={novitaApiKey}
                  onChange={(e) => setNovitaApiKey(e.target.value)}
                  placeholder={keyConfigured ? '••••••••••••••••' : 'sk-...'}
                  autoComplete="off"
                />
                <Button type="button" variant="secondary" loading={testing} onClick={testKey}>
                  Probar conexion
                </Button>
              </div>
            </Field>
          </Card>

          <Card className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Contexto del negocio</h2>
            <Field label="Descripcion del negocio">
              <textarea
                className="zent-input min-h-[88px]"
                value={businessDescription}
                onChange={(e) => setBusinessDescription(e.target.value)}
                placeholder="Que vendes, horarios, zonas de delivery..."
              />
            </Field>
            <Field label="Politicas">
              <textarea
                className="zent-input min-h-[88px]"
                value={policies}
                onChange={(e) => setPolicies(e.target.value)}
                placeholder="Pagos, envios, cambios..."
              />
            </Field>
          </Card>

          <Card className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-800">Playbook (system prompt)</h2>
              <Button type="button" variant="secondary" loading={previewLoading} onClick={loadPreview}>
                Vista previa
              </Button>
            </div>

            <div>
              <p className="mb-2 text-sm text-slate-600">Variables disponibles:</p>
              <div className="flex flex-wrap gap-2">
                {variables.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    title={v.description}
                    onClick={() => insertVariable(v.key)}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-brand-50 hover:border-brand-200"
                  >
                    {`{{${v.key}}}`}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Plantilla" hint="Dejar vacio para usar el playbook predeterminado del sistema.">
              <textarea
                className="zent-input min-h-[240px] font-mono text-sm"
                value={playbook}
                onChange={(e) => setPlaybook(e.target.value)}
                placeholder="Personaliza las instrucciones del asistente..."
              />
            </Field>

            {preview ? (
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Vista previa compilada</p>
                <pre className="max-h-80 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs whitespace-pre-wrap text-slate-700">
                  {preview}
                </pre>
              </div>
            ) : null}
          </Card>

          <div className="flex justify-end">
            <Button type="submit" loading={saving}>
              Guardar cambios
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
