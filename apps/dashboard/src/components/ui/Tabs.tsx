'use client';

export function Tabs({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (id: string) => void;
  items: { id: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          onClick={() => onChange(item.id)}
          className={`min-h-[44px] rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
            value === item.id
              ? 'bg-brand-600 text-white shadow-card'
              : 'bg-surface-muted text-slate-600 hover:bg-slate-200'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
