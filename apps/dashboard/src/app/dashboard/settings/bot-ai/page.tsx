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
  activeBotMode?: 'ai' | 'legacy';
  desiredBotMode?: 'ai' | 'legacy';
  effectiveBotMode?: 'ai' | 'legacy';
  routingReasons?: string[];
  minBalanceUsd?: number;
  zentFlowInstalled?: boolean;
  zentFlowPassThrough?: boolean | null;
  zentFlowSyncOk?: boolean | null;
  zentFlowSyncAt?: number | null;
  zentFlowSyncWarning?: string | null;
  n8nWorkflowsEnabled?: boolean;
  n8nWebhookBaseUrl?: string;
  n8nWebhookBaseUrlConfigured?: boolean;
  n8nWebhookSecretConfigured?: boolean;
  n8nEmbedded?: boolean;
  n8nPublicUrl?: string | null;
  n8nInternalWebhookBaseUrl?: string;
  n8nSalesMode?: 'disabled' | 'sandbox' | 'core';
  n8nHealth?: { ok: boolean; status: number | null; url: string; error?: string };
  n8nSecretConfigured?: boolean;
  lastN8nTestResult?: { ok: boolean; at: number; message?: string } | null;
};

type BalanceStatus = {
  balanceUsd: number | null;
  fetchedAt: string | null;
  minBalanceUsd: number;
  lowBalanceThresholdUsd: number;
  lowBalance: boolean;
  alertSentAt: string | null;
};

type TemplateVariable = {
  key: string;
  label: string;
  description: string;
};

type N8nSandboxResult = {
  ok: boolean;
  sandboxId: string;
  events: Array<{
    event: string;
    ok: boolean;
    skipped: boolean;
    status: number | null;
    url: string | null;
    error?: string;
    responseText?: string;
  }>;
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

function formatBalanceTime(iso: string | null) {
  if (!iso) return 'pendiente';
  return new Date(iso).toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function BotAiSettingsPage() {
  const { ready } = useRequireAdmin();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingN8n, setTestingN8n] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [botAiEnabled, setBotAiEnabled] = useState(false);
  const [novitaBotEnabled, setNovitaBotEnabled] = useState(false);
  const [businessDescription, setBusinessDescription] = useState('');
  const [policies, setPolicies] = useState('');
  const [playbook, setPlaybook] = useState('');
  const [novitaApiKey, setNovitaApiKey] = useState('');
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [balanceUsd, setBalanceUsd] = useState<number | null>(null);
  const [balanceFetchedAt, setBalanceFetchedAt] = useState<string | null>(null);
  const [lowBalanceThresholdUsd, setLowBalanceThresholdUsd] = useState(3);
  const [lowBalance, setLowBalance] = useState(false);
  const [refreshingBalance, setRefreshingBalance] = useState(false);
  const [hasBalance, setHasBalance] = useState(false);
  const [novitaModel, setNovitaModel] = useState('');
  const [variables, setVariables] = useState<TemplateVariable[]>([]);
  const [preview, setPreview] = useState('');
  const [activeBotMode, setActiveBotMode] = useState<'ai' | 'legacy'>('legacy');
  const [desiredBotMode, setDesiredBotMode] = useState<'ai' | 'legacy'>('legacy');
  const [routingReasons, setRoutingReasons] = useState<string[]>([]);
  const [zentFlowInstalled, setZentFlowInstalled] = useState(false);
  const [zentFlowPassThrough, setZentFlowPassThrough] = useState<boolean | null>(null);
  const [zentFlowSyncWarning, setZentFlowSyncWarning] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [n8nWorkflowsEnabled, setN8nWorkflowsEnabled] = useState(false);
  const [n8nWebhookBaseUrl, setN8nWebhookBaseUrl] = useState('');
  const [n8nWebhookSecret, setN8nWebhookSecret] = useState('');
  const [n8nWebhookSecretConfigured, setN8nWebhookSecretConfigured] = useState(false);
  const [n8nEmbedded, setN8nEmbedded] = useState(false);
  const [n8nPublicUrl, setN8nPublicUrl] = useState<string | null>(null);
  const [n8nInternalWebhookBaseUrl, setN8nInternalWebhookBaseUrl] = useState('');
  const [n8nSalesMode, setN8nSalesMode] = useState<'disabled' | 'sandbox' | 'core'>('sandbox');
  const [n8nHealth, setN8nHealth] = useState<BotAiSettings['n8nHealth']>(undefined);
  const [runningSandbox, setRunningSandbox] = useState(false);
  const [sandboxResult, setSandboxResult] = useState<N8nSandboxResult | null>(null);

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
      setActiveBotMode(settings.activeBotMode ?? 'legacy');
      setDesiredBotMode(settings.desiredBotMode ?? settings.activeBotMode ?? 'legacy');
      setRoutingReasons(settings.routingReasons ?? []);
      setZentFlowInstalled(settings.zentFlowInstalled ?? false);
      setZentFlowPassThrough(settings.zentFlowPassThrough ?? null);
      setZentFlowSyncWarning(settings.zentFlowSyncWarning ?? null);
      setN8nWorkflowsEnabled(settings.n8nWorkflowsEnabled ?? false);
      setN8nWebhookBaseUrl(settings.n8nWebhookBaseUrl ?? '');
      setN8nWebhookSecretConfigured(settings.n8nWebhookSecretConfigured ?? false);
      setN8nEmbedded(settings.n8nEmbedded ?? false);
      setN8nPublicUrl(settings.n8nPublicUrl ?? null);
      setN8nInternalWebhookBaseUrl(settings.n8nInternalWebhookBaseUrl ?? 'http://n8n:5678/webhook/zent');
      setN8nSalesMode(settings.n8nSalesMode ?? 'sandbox');
      setN8nHealth(settings.n8nHealth);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'No se pudo cargar la configuracion del asistente');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready) loadAll();
  }, [ready, loadAll]);

  const loadBalance = useCallback(async (force = false) => {
    setRefreshingBalance(force);
    try {
      const data = await api.get<BalanceStatus>(
        `/settings/bot-ai/balance${force ? '?force=1' : ''}`,
      );
      setBalanceUsd(data.balanceUsd);
      setBalanceFetchedAt(data.fetchedAt);
      setHasBalance(data.balanceUsd !== null && data.balanceUsd >= data.minBalanceUsd);
      setLowBalanceThresholdUsd(data.lowBalanceThresholdUsd);
      setLowBalance(data.lowBalance);
    } catch (err: any) {
      if (force) toast.error(err?.response?.data?.message || 'No se pudo actualizar saldo');
    } finally {
      setRefreshingBalance(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    void loadBalance(false);
    const timer = window.setInterval(() => {
      void loadBalance(false);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [ready, loadBalance]);

  const statusLabel = useMemo(() => {
    if (!novitaBotEnabled || !botAiEnabled) return 'Desactivado';
    if (!keyConfigured) return 'Falta API key';
    if (!hasBalance) return 'Activo con advertencia';
    return 'Activo';
  }, [botAiEnabled, novitaBotEnabled, keyConfigured, hasBalance]);

  const statusTone = useMemo(() => {
    if (statusLabel === 'Activo') return 'bg-green-100 text-green-800';
    if (statusLabel === 'Activo con advertencia') return 'bg-amber-100 text-amber-800';
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
      const data = await api.post<{
        ok: boolean;
        balanceUsd?: number;
        hasSufficientBalance?: boolean;
        aiAvailable?: boolean;
        message?: string;
      }>(
        '/setup/novita/test',
        payload,
      );
      if (data.ok) {
        toast.success(`Conexion OK — saldo: $${(data.balanceUsd ?? 0).toFixed(4)} USD`);
        setBalanceUsd(data.balanceUsd ?? null);
        setHasBalance(
          data.hasSufficientBalance ?? data.aiAvailable ?? ((data.balanceUsd ?? 0) >= 0.01),
        );
      } else {
        toast.error(data.message || 'Error al probar la API key');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error al probar Novita');
    } finally {
      setTesting(false);
    }
  };

  const modeLabel = activeBotMode === 'ai' ? 'IA conversacional' : 'Menu numerico';
  const desiredModeLabel = desiredBotMode === 'ai' ? 'IA deseada' : 'Legacy deseado';
  const modeTone =
    activeBotMode === 'ai' ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-700';

  const syncOpenwa = async () => {
    setSyncing(true);
    try {
      const result = await api.post<{
        ok: boolean;
        passThrough: boolean;
        pluginInstalled?: boolean;
        message?: string;
        error?: string;
      }>('/settings/bot-ai/sync-openwa');
      if (result.ok) {
        toast.success(
          result.message ||
            (result.passThrough
              ? 'OpenWA sincronizado: modo IA (pass-through)'
              : 'OpenWA sincronizado: menu numerico'),
        );
      } else {
        toast.error(result.error || 'No se pudo sincronizar zent-flow');
      }
      await loadAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error al sincronizar OpenWA');
    } finally {
      setSyncing(false);
    }
  };

  const testN8n = async () => {
    setTestingN8n(true);
    try {
      const result = await api.post<{
        ok: boolean;
        enabled: boolean;
        baseUrlConfigured: boolean;
        secretConfigured: boolean;
      }>('/settings/bot-ai/test-n8n');
      if (!result.enabled) {
        toast.warning('n8n esta desactivado. Activalo y guarda cambios antes de probar.');
      } else if (!result.baseUrlConfigured) {
        toast.error('Configura la URL base del webhook n8n.');
      } else {
        toast.success(
          result.secretConfigured
            ? 'Evento test.ping enviado a n8n'
            : 'Evento enviado sin firma: configura un secreto HMAC',
        );
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'No se pudo probar n8n');
    } finally {
      setTestingN8n(false);
    }
  };

  const restoreN8nDefaults = async () => {
    setSaving(true);
    try {
      await api.patch('/settings/bot-ai', { n8nRestoreDefaults: true });
      toast.success('Configuracion n8n restaurada al modo embebido');
      await loadAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'No se pudo restaurar n8n');
    } finally {
      setSaving(false);
    }
  };

  const runN8nSandbox = async () => {
    setRunningSandbox(true);
    try {
      const result = await api.post<N8nSandboxResult>('/settings/bot-ai/n8n/sandbox/run');
      setSandboxResult(result);
      if (result.ok) {
        toast.success('Sandbox n8n completado');
      } else {
        toast.error('Sandbox n8n con errores; revisa los eventos');
      }
      await loadAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'No se pudo ejecutar sandbox n8n');
    } finally {
      setRunningSandbox(false);
    }
  };

  const activateN8nCore = async () => {
    if (!n8nHealth?.ok || !sandboxResult?.ok) {
      toast.error('Primero valida health n8n y ejecuta sandbox correctamente');
      return;
    }
    setSaving(true);
    try {
      await api.patch('/settings/bot-ai', {
        n8nWorkflowsEnabled: true,
        n8nSalesMode: 'core',
      });
      setN8nSalesMode('core');
      toast.success('n8n activado como flujo core de ventas');
      await loadAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'No se pudo activar core n8n');
    } finally {
      setSaving(false);
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
        n8nWorkflowsEnabled,
        n8nWebhookBaseUrl: n8nWebhookBaseUrl.trim(),
        n8nSalesMode,
      };
      if (novitaApiKey.trim()) payload.novitaApiKey = novitaApiKey.trim();
      if (n8nWebhookSecret.trim()) payload.n8nWebhookSecret = n8nWebhookSecret.trim();

      await api.patch('/settings/bot-ai', payload);
      toast.success('Asistente IA guardado');
      setNovitaApiKey('');
      setN8nWebhookSecret('');
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
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                  {desiredModeLabel}
                </span>
                <span className={`rounded-full px-3 py-1 text-sm font-medium ${modeTone}`}>
                  Efectivo: {modeLabel}
                </span>
                <span className={`rounded-full px-3 py-1 text-sm font-medium ${statusTone}`}>{statusLabel}</span>
              </div>
            </div>

            {zentFlowSyncWarning ? (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {zentFlowSyncWarning}
              </div>
            ) : null}

            {activeBotMode === 'ai' && zentFlowInstalled && zentFlowPassThrough === false ? (
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="flex-1 text-sm text-amber-900">
                  zent-flow puede seguir mostrando menus numericos. Sincroniza OpenWA.
                </p>
                <Button type="button" variant="secondary" loading={syncing} onClick={syncOpenwa}>
                  Sincronizar OpenWA
                </Button>
              </div>
            ) : null}

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

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm text-slate-500">Saldo Novita</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">
                  {balanceUsd == null ? 'No disponible' : `$${balanceUsd.toFixed(2)}`}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Actualizado: {formatBalanceTime(balanceFetchedAt)}
                </div>
                {lowBalance ? (
                  <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Saldo bajo: umbral ${lowBalanceThresholdUsd.toFixed(2)}.
                  </div>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-3 !min-h-0 !px-3 !py-1.5 text-xs"
                  loading={refreshingBalance}
                  onClick={() => loadBalance(true)}
                >
                  Actualizar saldo
                </Button>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm text-slate-500">Credenciales</div>
                <div className="mt-2 text-sm font-medium text-slate-800">
                  {keyConfigured ? 'API key configurada' : 'Sin API key'}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Minimo operativo: {balanceUsd == null ? 'n/a' : hasBalance ? 'cubierto' : 'bajo'}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm text-slate-500">OpenWA zent-flow</div>
                <div className="mt-2 text-sm font-medium text-slate-800">
                  {zentFlowInstalled
                    ? zentFlowPassThrough
                      ? 'Pass-through activo'
                      : 'Menu numerico activo'
                    : desiredBotMode === 'ai'
                      ? 'No instalado (OK en IA)'
                      : 'No instalado'}
                </div>
                {routingReasons.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {routingReasons.map((reason) => (
                      <span key={reason} className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">
                        {reason}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-slate-500">Sin advertencias de routing.</div>
                )}
              </div>
            </div>
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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Automatizaciones n8n</h2>
                <p className="text-sm text-slate-500">
                  El backend firma y envia eventos a n8n; n8n puede notificar, validar pagos o actualizar CRM.
                </p>
              </div>
              <Button type="button" variant="secondary" loading={testingN8n} onClick={testN8n}>
                Probar n8n
              </Button>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={n8nWorkflowsEnabled}
                onChange={(e) => setN8nWorkflowsEnabled(e.target.checked)}
                className="rounded border-slate-300"
              />
              Activar automatizaciones n8n
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs text-slate-500">Modo</div>
                <div className="mt-1 text-sm font-semibold text-slate-800">
                  {n8nEmbedded ? 'n8n embebido' : 'n8n externo'}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs text-slate-500">Health interno</div>
                <div className={n8nHealth?.ok ? 'mt-1 text-sm font-semibold text-green-700' : 'mt-1 text-sm font-semibold text-amber-700'}>
                  {n8nHealth?.ok ? 'Disponible' : 'Sin respuesta'}
                </div>
                {n8nHealth?.status ? <div className="mt-1 text-xs text-slate-500">HTTP {n8nHealth.status}</div> : null}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs text-slate-500">Editor n8n</div>
                {n8nPublicUrl ? (
                  <a
                    href={n8nPublicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block break-all text-sm font-semibold text-brand-700 hover:underline"
                  >
                    Abrir n8n
                  </a>
                ) : (
                  <div className="mt-1 text-sm font-semibold text-slate-700">No configurado</div>
                )}
              </div>
            </div>

            <Field
              label="Webhook base URL"
              hint={`Automatico embebido: ${n8nInternalWebhookBaseUrl || 'http://n8n:5678/webhook/zent'}. Los eventos se enviaran como /order.created, /payment.reference_submitted, etc.`}
            >
              <input
                className="zent-input"
                value={n8nWebhookBaseUrl}
                onChange={(e) => setN8nWebhookBaseUrl(e.target.value)}
                placeholder="https://n8n.tu-dominio.com/webhook/zent"
                autoComplete="off"
              />
            </Field>

            <Field label="Modo de ventas n8n" hint="Sandbox permite probar eventos ficticios; Core habilita eventos reales de pedidos.">
              <select
                className="zent-input"
                value={n8nSalesMode}
                onChange={(e) => setN8nSalesMode(e.target.value as 'disabled' | 'sandbox' | 'core')}
              >
                <option value="disabled">Desactivado</option>
                <option value="sandbox">Sandbox</option>
                <option value="core">Core</option>
              </select>
            </Field>

            <Field
              label="Secreto HMAC"
              hint={
                n8nWebhookSecretConfigured
                  ? 'Deja vacio para mantener el secreto actual. Se usa en X-Zent-Signature.'
                  : 'Configura un secreto fuerte para firmar eventos y validar callbacks.'
              }
            >
              <input
                type="password"
                className="zent-input"
                value={n8nWebhookSecret}
                onChange={(e) => setN8nWebhookSecret(e.target.value)}
                placeholder={n8nWebhookSecretConfigured ? '••••••••••••••••' : 'Secreto HMAC'}
                autoComplete="off"
              />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" loading={saving} onClick={restoreN8nDefaults}>
                Restaurar configuracion automatica
              </Button>
              <Button type="button" variant="secondary" loading={runningSandbox} onClick={runN8nSandbox}>
                Ejecutar sandbox de ventas
              </Button>
              <Button
                type="button"
                loading={saving}
                disabled={!n8nHealth?.ok || !sandboxResult?.ok}
                onClick={activateN8nCore}
              >
                Activar como agente core
              </Button>
            </div>

            {sandboxResult ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Resultado sandbox</div>
                    <div className="text-xs text-slate-500">ID: {sandboxResult.sandboxId}</div>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      sandboxResult.ok ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {sandboxResult.ok ? 'OK' : 'Revisar'}
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {sandboxResult.events.map((event) => (
                    <div key={event.event} className="rounded-lg bg-white p-2 text-xs text-slate-600">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-slate-800">{event.event}</span>
                        <span className={event.ok ? 'text-green-700' : 'text-amber-700'}>
                          {event.skipped ? 'omitido' : event.ok ? `HTTP ${event.status}` : event.error || `HTTP ${event.status ?? 'n/a'}`}
                        </span>
                      </div>
                      {event.url ? <div className="mt-1 break-all text-slate-500">{event.url}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
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

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" loading={syncing} onClick={syncOpenwa}>
              Sincronizar OpenWA
            </Button>
            <Button type="submit" loading={saving}>
              Guardar cambios
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
