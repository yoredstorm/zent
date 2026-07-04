'use client';

type EngineId = 'legacy' | 'novita' | 'n8n';

const ENGINES: Array<{
  id: EngineId;
  title: string;
  desc: string;
}> = [
  { id: 'legacy', title: 'Menu clasico', desc: 'Opciones 1-2-3-4, catalogo y carrito' },
  { id: 'novita', title: 'IA Novita', desc: 'Conversacion natural con IA' },
  { id: 'n8n', title: 'Flujos n8n', desc: 'Automatizacion editable en n8n' },
];

export function BotEnginePicker({
  value,
  onChange,
}: {
  value: EngineId;
  onChange: (engine: EngineId) => void;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800">Motor de respuestas WhatsApp</h2>
      <p className="mt-1 text-sm text-slate-500">
        Elige un solo motor activo. La configuracion se guarda en la tienda y aplica al instante.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {ENGINES.map((engine) => {
          const active = value === engine.id;
          return (
            <button
              key={engine.id}
              type="button"
              onClick={() => onChange(engine.id)}
              className={`rounded-2xl border p-4 text-left transition ${
                active
                  ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-800">{engine.title}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {active ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{engine.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
