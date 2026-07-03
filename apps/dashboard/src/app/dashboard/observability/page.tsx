import Link from 'next/link';
import { Activity, BarChart3, ExternalLink, Gauge, ShieldCheck, TerminalSquare } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { buildMonitoringLinks } from '@/lib/monitoring';

const links = buildMonitoringLinks({
  grafanaUrl: process.env.NEXT_PUBLIC_GRAFANA_URL,
  prometheusUrl: process.env.NEXT_PUBLIC_PROMETHEUS_URL,
});

const quickChecks = [
  {
    label: 'API y bot-worker',
    query: '{service=~"backend-api|bot-worker"}',
  },
  {
    label: 'Errores globales',
    query: '{container=~".*backend-api.*|.*bot-worker.*|.*openwa.*|.*frontend.*"} |~ "(?i)(error|failed|exception|fatal)"',
  },
  {
    label: 'WhatsApp / OpenWA',
    query: '{service=~"openwa|backend-api"} |= "webhook"',
  },
];

function externalLinkClass(enabled: boolean) {
  return enabled
    ? 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700'
    : 'inline-flex min-h-[44px] cursor-not-allowed items-center justify-center rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400';
}

export default function ObservabilityPage() {
  const grafanaConfigured = Boolean(links.grafana);
  const prometheusConfigured = Boolean(links.prometheus);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Observabilidad"
        subtitle="Monitorea logs, métricas y salud del stack desde Grafana, Loki y Prometheus."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-brand-50 p-3 text-brand-700">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-slate-900">Grafana</h2>
              <p className="mt-1 text-sm text-slate-500">
                Dashboards preconfigurados para logs y métricas del stack Zent.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {links.grafanaLogs ? (
                  <Link href={links.grafanaLogs} target="_blank" rel="noopener noreferrer" className={externalLinkClass(true)}>
                    Logs
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                ) : (
                  <span className={externalLinkClass(false)}>Configurar URL</span>
                )}
                {links.grafanaMetrics && (
                  <Link href={links.grafanaMetrics} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                    Métricas
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
              <Gauge className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-slate-900">Prometheus</h2>
              <p className="mt-1 text-sm text-slate-500">
                Métricas de contenedores y servicios usadas por Grafana.
              </p>
              <div className="mt-4">
                {links.prometheus ? (
                  <Link href={links.prometheus} target="_blank" rel="noopener noreferrer" className={externalLinkClass(true)}>
                    Abrir Prometheus
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                ) : (
                  <span className={externalLinkClass(false)}>Configurar URL</span>
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-amber-50 p-3 text-amber-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-slate-900">Seguridad</h2>
              <p className="mt-1 text-sm text-slate-500">
                Esta página solo muestra URLs públicas. Las credenciales de Grafana se mantienen fuera del dashboard.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Grafana embebido</h2>
            <p className="text-sm text-slate-500">
              Vista rápida del dashboard de logs. Si Grafana solicita login, usa el botón de abrir en nueva pestaña.
            </p>
          </div>
          {links.grafana && (
            <Link href={links.grafana} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
              Abrir Grafana
              <ExternalLink className="h-4 w-4" />
            </Link>
          )}
        </div>

        {links.grafanaLogs ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
            <iframe
              title="Zent logs en Grafana"
              src={`${links.grafanaLogs}&kiosk`}
              className="h-[70vh] min-h-[520px] w-full bg-white"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <Activity className="mx-auto h-10 w-10 text-slate-400" />
            <h3 className="mt-3 font-semibold text-slate-900">Configura la URL pública de Grafana</h3>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-500">
              Define <code className="rounded bg-white px-1 py-0.5">NEXT_PUBLIC_GRAFANA_URL</code> en el servicio frontend
              para habilitar enlaces e iframe.
            </p>
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex items-center gap-2">
          <TerminalSquare className="h-5 w-5 text-slate-500" />
          <h2 className="text-lg font-semibold text-slate-900">Consultas útiles</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {quickChecks.map((check) => (
            <div key={check.label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="font-medium text-slate-900">{check.label}</div>
              <code className="mt-2 block overflow-x-auto rounded-lg bg-white p-2 text-xs text-slate-600">
                {check.query}
              </code>
            </div>
          ))}
        </div>
      </Card>

      {(!grafanaConfigured || !prometheusConfigured) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Faltan URLs públicas de monitoreo. En producción usa
          <code className="mx-1 rounded bg-white px-1 py-0.5">NEXT_PUBLIC_GRAFANA_URL</code> y
          <code className="mx-1 rounded bg-white px-1 py-0.5">NEXT_PUBLIC_PROMETHEUS_URL</code>.
        </div>
      )}
    </div>
  );
}
