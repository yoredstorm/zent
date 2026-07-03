export interface MonitoringUrlConfig {
  grafanaUrl?: string;
  prometheusUrl?: string;
}

export interface MonitoringLinks {
  grafana: string | null;
  grafanaLogs: string | null;
  grafanaMetrics: string | null;
  prometheus: string | null;
}

function safeHttpUrl(raw?: string): string | null {
  const value = raw?.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function grafanaDashboardUrl(base: string | null, uid: string, slug: string) {
  if (!base) return null;
  return `${base}/d/${uid}/${slug}?orgId=1&refresh=30s`;
}

export function buildMonitoringLinks(config: MonitoringUrlConfig): MonitoringLinks {
  const grafana = safeHttpUrl(config.grafanaUrl);
  const prometheus = safeHttpUrl(config.prometheusUrl);

  return {
    grafana,
    grafanaLogs: grafanaDashboardUrl(grafana, 'zent-logs', 'zent-logs'),
    grafanaMetrics: grafanaDashboardUrl(grafana, 'zent-metrics', 'zent-metricas'),
    prometheus,
  };
}
