const toneMap = {
  default: 'bg-slate-100 text-slate-700',
  success: 'bg-success-soft text-emerald-800',
  warning: 'bg-warning-soft text-amber-800',
  danger: 'bg-danger-soft text-red-800',
  brand: 'bg-brand-50 text-brand-700',
} as const;

export function Badge({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: keyof typeof toneMap;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${toneMap[tone]}`}
    >
      {children}
    </span>
  );
}
