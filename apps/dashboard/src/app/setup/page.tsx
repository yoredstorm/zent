'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type InstallEvent = {
  step: number;
  total: number;
  label: string;
  status: 'running' | 'ok' | 'error' | 'done';
  message?: string;
};

const CURRENCIES = [
  { code: 'PEN', label: 'Sol peruano (S/)', tax: 18 },
  { code: 'USD', label: 'Dolar estadounidense ($)', tax: 0 },
  { code: 'MXN', label: 'Peso mexicano ($)', tax: 16 },
  { code: 'COP', label: 'Peso colombiano ($)', tax: 19 },
  { code: 'CLP', label: 'Peso chileno ($)', tax: 19 },
  { code: 'ARS', label: 'Peso argentino ($)', tax: 21 },
];

const AVATAR_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#059669', '#ea580c', '#0891b2'];

function generateAvatar(name: string): string {
  if (typeof document === 'undefined') return '';
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const initial = (name.trim()[0] || 'Z').toUpperCase();
  const color = AVATAR_COLORS[initial.charCodeAt(0) % AVATAR_COLORS.length];
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 130px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initial, size / 2, size / 2 + 8);
  return canvas.toDataURL('image/jpeg', 0.85);
}

async function compressLogoFile(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Imagen invalida'));
      el.src = objectUrl;
    });

    const max = 256;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo procesar la imagen');
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function generatePassword(length = 16): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

async function apiGet<T = any>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
  return res.json();
}

async function apiPost<T = any>(url: string, body?: any): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* respuesta vacia */
  }
  return { ok: res.ok, status: res.status, data };
}

const STEPS = ['Bienvenida', 'Tienda', 'Administrador', 'Secretos', 'WhatsApp', 'Resumen', 'Instalacion', 'Listo'];

export default function SetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // Datos de la tienda
  const [storeName, setStoreName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [useGenericLogo, setUseGenericLogo] = useState(true);
  const [currency, setCurrency] = useState('PEN');
  const [taxRate, setTaxRate] = useState<number>(18);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [ownerName, setOwnerName] = useState('');

  // Admin
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Secretos
  const [credentials, setCredentials] = useState<Record<string, string> | null>(null);

  // WhatsApp
  const [waStatus, setWaStatus] = useState<string>('idle');
  const [waQr, setWaQr] = useState<string>('');
  const [waLinking, setWaLinking] = useState(false);
  const [waSkipped, setWaSkipped] = useState(false);
  const [waError, setWaError] = useState('');
  const [openwaKeyValid, setOpenwaKeyValid] = useState<boolean | null>(null);

  // Bot IA (opcional)
  const [novitaBotEnabled, setNovitaBotEnabled] = useState(false);
  const [novitaApiKey, setNovitaApiKey] = useState('');
  const [novitaTestMsg, setNovitaTestMsg] = useState('');

  // Instalacion
  const [log, setLog] = useState<InstallEvent[]>([]);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState(false);
  const [installDone, setInstallDone] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const waPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (step !== 4) return;
    apiGet('/api/setup/status').then((s) => {
      if (typeof s?.openwaKeyValid === 'boolean') setOpenwaKeyValid(s.openwaKeyValid);
    });
  }, [step]);

  // Si ya esta instalado, no mostrar el wizard
  useEffect(() => {
    apiGet('/api/setup/status')
      .then((s) => {
        if (s?.installed) router.replace('/login');
      })
      .catch(() => {});
  }, [router]);

  const effectiveLogo = useMemo(() => {
    if (!useGenericLogo && logoUrl) return logoUrl;
    return storeName ? generateAvatar(storeName) : '';
  }, [useGenericLogo, logoUrl, storeName]);

  const handleCurrency = (code: string) => {
    setCurrency(code);
    const found = CURRENCIES.find((c) => c.code === code);
    if (found) setTaxRate(found.tax);
  };

  const handleLogoFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    try {
      const compressed = await compressLogoFile(file);
      setLogoUrl(compressed);
      setUseGenericLogo(false);
    } catch {
      setLogoUrl('');
    }
  };

  const loadCredentials = useCallback(async () => {
    const data = await apiGet('/api/setup/credentials');
    setCredentials(data && typeof data === 'object' ? data : {});
  }, []);

  const downloadCredentials = () => {
    if (!credentials) return;
    const lines = [
      'CREDENCIALES ZENT - GUARDA ESTE ARCHIVO EN UN LUGAR SEGURO',
      '============================================================',
      `Tienda: ${storeName}`,
      `Admin: ${adminEmail}`,
      `Contrasena admin: ${adminPassword}`,
      '',
      ...Object.entries(credentials).map(([k, v]) => `${k}=${v}`),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'credenciales-zent.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // WhatsApp: conectar y empezar a sondear estado
  const startWhatsapp = async () => {
    setWaLinking(true);
    setWaStatus('connecting');
    setWaError('');
    const { data } = await apiPost('/api/setup/whatsapp/connect');
    if (data?.error) {
      setWaLinking(false);
      setWaStatus('error');
      setWaError(data.error);
      return;
    }
    if (data?.qr) setWaQr(data.qr);
    setWaStatus(data?.pending ? 'qr_pending' : 'connecting');
    if (waPollRef.current) clearInterval(waPollRef.current);
    waPollRef.current = setInterval(async () => {
      const status = await apiGet('/api/setup/whatsapp/status');
      setWaStatus(status?.status || 'unknown');
      if (status?.status === 'connected' || status?.status === 'ready') {
        if (waPollRef.current) clearInterval(waPollRef.current);
        setWaLinking(false);
      } else {
        const qr = await apiGet('/api/setup/whatsapp/qr');
        if (qr?.qr) setWaQr(qr.qr);
      }
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (waPollRef.current) clearInterval(waPollRef.current);
      if (esRef.current) esRef.current.close();
    };
  }, []);

  const runInstall = useCallback(async () => {
    setInstalling(true);
    setInstallError(false);
    setInstallDone(false);
    setLog([]);
    if (esRef.current) esRef.current.close();

    const payload = {
      storeName,
      logoUrl: effectiveLogo || undefined,
      currency,
      taxRate: Number(taxRate),
      phoneNumber,
      ownerName: ownerName || undefined,
      adminEmail,
      adminPassword,
      adminName: ownerName || undefined,
      novitaBotEnabled: novitaBotEnabled || undefined,
      novitaApiKey: novitaApiKey.trim() || undefined,
    };

    const started = await apiPost('/api/setup/install', payload);
    if (!started.ok) {
      setInstallError(true);
      setInstalling(false);
      setLog([
        {
          step: 0,
          total: 6,
          label: 'No se pudo iniciar la instalacion',
          status: 'error',
          message: started.data?.message || `Error ${started.status}`,
        },
      ]);
      return;
    }

    const es = new EventSource('/api/setup/install/stream');
    esRef.current = es;
    es.onmessage = (ev) => {
      try {
        const data: InstallEvent = JSON.parse(ev.data);
        setLog((prev) => [...prev, data]);
        if (data.status === 'done') {
          es.close();
          setInstalling(false);
          setInstallDone(true);
        } else if (data.status === 'error') {
          es.close();
          setInstalling(false);
          setInstallError(true);
        }
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      es.close();
      setInstalling(false);
    };
  }, [storeName, effectiveLogo, currency, taxRate, phoneNumber, ownerName, adminEmail, adminPassword, novitaBotEnabled, novitaApiKey]);

  const finish = async () => {
    const res = await apiPost('/api/auth/login', { email: adminEmail, password: adminPassword });
    if (res.ok && res.data?.accessToken) {
      localStorage.setItem('accessToken', res.data.accessToken);
      localStorage.setItem('refreshToken', res.data.refreshToken);
      router.replace('/dashboard');
    } else {
      router.replace('/login');
    }
  };

  // Validaciones por paso
  const canNextStore = storeName.trim().length > 0 && phoneNumber.trim().length >= 6;
  const canNextAdmin =
    /\S+@\S+\.\S+/.test(adminEmail) &&
    adminPassword.length >= 8 &&
    adminPassword === adminPasswordConfirm;

  const go = (n: number) => setStep(n);
  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 flex flex-col">
      <header className="px-8 py-5 border-b border-white/10 flex items-center gap-3">
        <span className="text-3xl">📦</span>
        <div>
          <h1 className="text-lg font-bold">Instalacion de Zent</h1>
          <p className="text-xs text-slate-400">Asistente de configuracion inicial</p>
        </div>
      </header>

      <div className="px-8 py-4 border-b border-white/10">
        <ol className="flex flex-wrap gap-2 text-xs">
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={`px-3 py-1 rounded-full border ${
                i === step
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : i < step
                    ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                    : 'border-white/10 text-slate-400'
              }`}
            >
              {i + 1}. {label}
            </li>
          ))}
        </ol>
      </div>

      <main className="flex-1 overflow-auto px-8 py-8">
        <div className="max-w-2xl mx-auto">
          {step === 0 && (
            <section className="space-y-6 text-center py-10">
              <div className="text-6xl">🚀</div>
              <h2 className="text-3xl font-bold">Bienvenido a Zent</h2>
              <p className="text-slate-400">
                Vamos a configurar tu tienda con bot de ventas por WhatsApp en unos pocos pasos.
              </p>
              <ul className="text-left max-w-md mx-auto space-y-2 text-sm text-slate-300">
                <li>✅ Servicios Docker en ejecucion</li>
                <li>✅ Base de datos lista</li>
                <li>✅ Conexion con WhatsApp Gateway</li>
              </ul>
              <button onClick={next} className="btn-primary mx-auto">
                Comenzar instalacion
              </button>
            </section>
          )}

          {step === 1 && (
            <section className="space-y-5">
              <h2 className="text-2xl font-bold">Datos de la tienda</h2>
              <Field label="Nombre de la tienda *">
                <input
                  className="input"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="Mi Tienda"
                />
              </Field>

              <Field label="Logo">
                <div className="flex items-center gap-4">
                  {effectiveLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={effectiveLogo}
                      alt="logo"
                      className="w-16 h-16 rounded-lg object-cover border border-white/10"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-white/5 border border-white/10" />
                  )}
                  <div className="space-y-2">
                    <label className="btn-secondary cursor-pointer inline-block">
                      Subir imagen
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && handleLogoFile(e.target.files[0])}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={useGenericLogo}
                        onChange={(e) => setUseGenericLogo(e.target.checked)}
                      />
                      Usar logo generico (inicial del nombre)
                    </label>
                  </div>
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Moneda">
                  <select className="input" value={currency} onChange={(e) => handleCurrency(e.target.value)}>
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code} className="text-slate-900">
                        {c.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="IVA / Impuesto (%)">
                  <input
                    type="number"
                    className="input"
                    value={taxRate}
                    min={0}
                    max={100}
                    onChange={(e) => setTaxRate(Number(e.target.value))}
                  />
                </Field>
              </div>

              <Field label="Telefono responsable (WhatsApp) *">
                <input
                  className="input"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="51987654321"
                />
              </Field>

              <Field label="Nombre del encargado">
                <input
                  className="input"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Juan Perez"
                />
              </Field>

              <Nav onBack={back} onNext={next} nextDisabled={!canNextStore} />
            </section>
          )}

          {step === 2 && (
            <section className="space-y-5">
              <h2 className="text-2xl font-bold">Cuenta de administrador</h2>
              <Field label="Email del administrador *">
                <input
                  type="email"
                  className="input"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@mitienda.com"
                />
              </Field>
              <Field label="Contrasena *">
                <div className="flex gap-2">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="input flex-1"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      const pw = generatePassword();
                      setAdminPassword(pw);
                      setAdminPasswordConfirm(pw);
                      setShowPassword(true);
                    }}
                  >
                    Generar
                  </button>
                </div>
                <p className="text-xs text-amber-300 mt-1">
                  Si generas una contrasena, guardala ahora: no se volvera a mostrar.
                </p>
              </Field>
              <Field label="Confirmar contrasena *">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input"
                  value={adminPasswordConfirm}
                  onChange={(e) => setAdminPasswordConfirm(e.target.value)}
                />
              </Field>
              {adminPassword && adminPassword !== adminPasswordConfirm && (
                <p className="text-xs text-red-400">Las contrasenas no coinciden.</p>
              )}

              <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3">
                <h3 className="font-semibold text-sm">Bot IA con Novita (opcional)</h3>
                <p className="text-xs text-slate-400">
                  Sin API key el bot usa solo el menú numérico (1-4). Con key y saldo, atiende en lenguaje natural.
                </p>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={novitaBotEnabled}
                    onChange={(e) => setNovitaBotEnabled(e.target.checked)}
                    className="rounded"
                  />
                  Activar asistente IA
                </label>
                <Field label="API key Novita (opcional)">
                  <input
                    type="password"
                    className="input"
                    value={novitaApiKey}
                    onChange={(e) => setNovitaApiKey(e.target.value)}
                    placeholder="sk_..."
                  />
                </Field>
                {novitaApiKey.trim() && (
                  <button
                    type="button"
                    className="btn-secondary text-sm"
                    onClick={async () => {
                      const res = await apiPost('/api/setup/novita/test', {
                        novitaApiKey: novitaApiKey.trim(),
                      });
                      if (res.ok && res.data?.ok) {
                        setNovitaTestMsg(
                          `Saldo: $${res.data.balanceUsd?.toFixed(2) ?? '?'} — ${res.data.aiAvailable ? 'IA disponible' : 'Saldo insuficiente'}`,
                        );
                      } else {
                        setNovitaTestMsg(res.data?.message || 'Error al probar la clave');
                      }
                    }}
                  >
                    Probar conexión
                  </button>
                )}
                {novitaTestMsg && <p className="text-xs text-emerald-300">{novitaTestMsg}</p>}
              </div>

              <Nav
                onBack={back}
                onNext={() => {
                  loadCredentials();
                  next();
                }}
                nextDisabled={!canNextAdmin}
              />
            </section>
          )}

          {step === 3 && (
            <section className="space-y-5">
              <h2 className="text-2xl font-bold">Credenciales del sistema</h2>
              <p className="text-slate-400 text-sm">
                Estas son las credenciales seguras de tu instalacion. Se muestran una sola vez. Descargalas
                y guardalas en un lugar seguro.
              </p>
              <div className="bg-black/40 rounded-lg p-4 font-mono text-xs space-y-1 max-h-64 overflow-auto border border-white/10">
                {credentials ? (
                  Object.entries(credentials).map(([k, v]) => (
                    <div key={k} className="break-all">
                      <span className="text-slate-400">{k}=</span>
                      <span className="text-emerald-300">{v}</span>
                    </div>
                  ))
                ) : (
                  <span className="text-slate-500">Cargando...</span>
                )}
              </div>
              <button onClick={downloadCredentials} className="btn-secondary">
                Descargar credenciales-zent.txt
              </button>
              <Nav onBack={back} onNext={next} />
            </section>
          )}

          {step === 4 && (
            <section className="space-y-5">
              <h2 className="text-2xl font-bold">Vincular WhatsApp</h2>
              <p className="text-slate-400 text-sm">
                Escanea el codigo QR con WhatsApp en tu telefono, o vincula mas tarde desde Configuracion.
              </p>

              {openwaKeyValid === false && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-sm text-amber-200">
                  El gateway de WhatsApp aun no acepta la clave API. En el servidor ejecuta{' '}
                  <code className="bg-black/30 px-1 rounded">cd infra && ./install.sh</code> (o en Windows{' '}
                  <code className="bg-black/30 px-1 rounded">./fix-openwa-key.ps1</code>) y vuelve aqui.
                </div>
              )}

              {!waLinking && waStatus !== 'connected' && waStatus !== 'ready' && (
                <div className="flex gap-3">
                  <button onClick={startWhatsapp} className="btn-primary">
                    Vincular ahora
                  </button>
                  <button
                    onClick={() => {
                      setWaSkipped(true);
                      next();
                    }}
                    className="btn-secondary"
                  >
                    Omitir por ahora
                  </button>
                </div>
              )}

              {waLinking && (
                <div className="flex flex-col items-center gap-4">
                  {waError && (
                    <div className="text-red-300 text-sm bg-red-500/10 border border-red-500/30 rounded-lg p-3 w-full">
                      {waError}
                    </div>
                  )}
                  {waQr ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={waQr.startsWith('data:') ? waQr : `data:image/png;base64,${waQr}`}
                      alt="QR WhatsApp"
                      className="w-56 h-56 bg-white p-2 rounded-lg"
                    />
                  ) : (
                    <div className="w-56 h-56 bg-white/5 rounded-lg flex items-center justify-center text-slate-500">
                      Generando QR...
                    </div>
                  )}
                  <StatusBadge status={waStatus} />
                  <button onClick={() => next()} className="btn-secondary">
                    Continuar
                  </button>
                </div>
              )}

              {(waStatus === 'connected' || waStatus === 'ready') && (
                <div className="text-center space-y-3">
                  <div className="text-emerald-400 text-lg">WhatsApp vinculado correctamente</div>
                  <Nav onBack={back} onNext={next} />
                </div>
              )}
            </section>
          )}

          {step === 5 && (
            <section className="space-y-5">
              <h2 className="text-2xl font-bold">Resumen</h2>
              <div className="bg-white/5 rounded-lg p-5 space-y-2 text-sm border border-white/10">
                <Row k="Tienda" v={storeName} />
                <Row k="Moneda" v={currency} />
                <Row k="IVA" v={`${taxRate}%`} />
                <Row k="Telefono" v={phoneNumber} />
                <Row k="Encargado" v={ownerName || '-'} />
                <Row k="Admin" v={adminEmail} />
                <Row k="WhatsApp" v={waSkipped ? 'Se vinculara despues' : waStatus === 'connected' || waStatus === 'ready' ? 'Vinculado' : 'Pendiente'} />
              </div>
              <div className="flex justify-between">
                <button onClick={back} className="btn-secondary">
                  Atras
                </button>
                <button
                  onClick={() => {
                    next();
                    runInstall();
                  }}
                  className="btn-primary"
                >
                  Instalar ahora
                </button>
              </div>
            </section>
          )}

          {step === 6 && (
            <section className="space-y-5">
              <h2 className="text-2xl font-bold">Instalando...</h2>
              <div className="bg-black/60 rounded-lg p-4 font-mono text-sm h-72 overflow-auto border border-white/10">
                {log.length === 0 && <div className="text-slate-500">Iniciando...</div>}
                {log.map((e, i) => (
                  <div key={i} className={e.status === 'error' ? 'text-red-400' : 'text-slate-200'}>
                    {e.status === 'error'
                      ? `✗ ${e.label}${e.message ? ` — ${e.message}` : ''}`
                      : e.status === 'done'
                        ? `\n✅ ${e.label}`
                        : `[${e.step}/${e.total}] ${e.label}... ${
                            e.status === 'ok' ? `OK${e.message ? ` (${e.message})` : ''}` : ''
                          }`}
                  </div>
                ))}
              </div>
              {installError && (
                <button onClick={runInstall} className="btn-primary">
                  Reintentar instalacion
                </button>
              )}
              {installDone && (
                <button onClick={next} className="btn-primary">
                  Continuar
                </button>
              )}
              {installing && <p className="text-slate-400 text-sm">No cierres esta ventana...</p>}
            </section>
          )}

          {step === 7 && (
            <section className="space-y-6 text-center py-10">
              <div className="text-6xl">🎉</div>
              <h2 className="text-3xl font-bold">Instalacion completada</h2>
              <p className="text-slate-400">Tu tienda Zent esta lista para usarse.</p>
              <button onClick={finish} className="btn-primary mx-auto">
                Ir al panel de administracion
              </button>
            </section>
          )}
        </div>
      </main>

      <style jsx global>{`
        .input {
          width: 100%;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 0.5rem;
          padding: 0.6rem 0.75rem;
          color: #f1f5f9;
          outline: none;
        }
        .input:focus {
          border-color: #3b82f6;
        }
        .btn-primary {
          display: block;
          background: #2563eb;
          color: #fff;
          padding: 0.6rem 1.25rem;
          border-radius: 0.5rem;
          font-weight: 600;
        }
        .btn-primary:hover {
          background: #1d4ed8;
        }
        .btn-primary:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .btn-secondary {
          background: rgba(255, 255, 255, 0.08);
          color: #e2e8f0;
          padding: 0.6rem 1.25rem;
          border-radius: 0.5rem;
          font-weight: 500;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .btn-secondary:hover {
          background: rgba(255, 255, 255, 0.15);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Nav({
  onBack,
  onNext,
  nextDisabled,
}: {
  onBack: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex justify-between pt-2">
      <button onClick={onBack} className="btn-secondary">
        Atras
      </button>
      <button onClick={onNext} disabled={nextDisabled} className="btn-primary">
        Continuar
      </button>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    connecting: { label: 'Esperando escaneo', cls: 'bg-amber-500/20 text-amber-300' },
    qr_pending: { label: 'Esperando escaneo', cls: 'bg-amber-500/20 text-amber-300' },
    authenticating: { label: 'Conectando...', cls: 'bg-blue-500/20 text-blue-300' },
    restarting: { label: 'Reiniciando gateway...', cls: 'bg-blue-500/20 text-blue-300' },
    connected: { label: 'Conectado', cls: 'bg-emerald-500/20 text-emerald-300' },
    ready: { label: 'Conectado', cls: 'bg-emerald-500/20 text-emerald-300' },
    error: { label: 'Reintentando conexion...', cls: 'bg-amber-500/20 text-amber-300' },
  };
  const s = map[status] || { label: status, cls: 'bg-white/10 text-slate-300' };
  return <span className={`px-3 py-1 rounded-full text-xs ${s.cls}`}>{s.label}</span>;
}
