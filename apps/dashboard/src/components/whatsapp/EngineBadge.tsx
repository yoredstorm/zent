import { Badge } from '@/components/ui/Badge';

const LABELS = {
  n8n: { text: 'n8n', tone: 'brand' as const },
  novita: { text: 'Novita', tone: 'success' as const },
  legacy: { text: 'Menú clásico', tone: 'default' as const },
  skipped: { text: 'Sin ruteo n8n', tone: 'warning' as const },
};

const REASON_LABELS: Record<string, string> = {
  global_engine_legacy: 'Motor global: menú clásico',
  global_engine_novita: 'Motor global: Novita',
  sandbox_match: 'Teléfono en sandbox n8n',
  core_scope: 'Alcance n8n: core (todos)',
  not_in_sandbox: 'Teléfono fuera del sandbox n8n',
  n8n_secret_missing: 'Falta N8N_WEBHOOK_SECRET',
  phone_unresolved: 'No se pudo resolver el teléfono (@lid)',
};

export function engineBadgeTitle(engine: string, reason?: string | null): string | undefined {
  const reasonLabel = reason ? REASON_LABELS[reason] : undefined;
  if (reasonLabel) return reasonLabel;
  return engine === 'skipped' ? 'Motor n8n activo pero este chat no se enruta' : undefined;
}

export function EngineBadge({ engine, reason }: { engine: string; reason?: string | null }) {
  const cfg = LABELS[engine as keyof typeof LABELS] ?? LABELS.legacy;
  const title = engineBadgeTitle(engine, reason);
  return (
    <span title={title}>
      <Badge tone={cfg.tone}>{cfg.text}</Badge>
    </span>
  );
}

export const MODE_LABELS: Record<string, string> = {
  n8n_chat: 'n8n',
  ai: 'Novita',
  legacy: 'Menú clásico',
  routing_skipped: 'Sin ruteo (sandbox)',
};
