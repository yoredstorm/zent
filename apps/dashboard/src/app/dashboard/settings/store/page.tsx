'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { SettingsNav } from '@/components/settings/SettingsNav';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { api } from '@/lib/api';
import { CURRENCIES, compressLogoFile, generateAvatar } from '@/lib/currencies';
import { useRequireAdmin } from '@/lib/useRequireAdmin';

type StoreSettings = {
  storeName: string;
  phoneNumber: string;
  currency: string;
  taxRate: number;
  logoUrl?: string | null;
  deliveryFlatFee?: number | null;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}

export default function StoreSettingsPage() {
  const { ready } = useRequireAdmin();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [currency, setCurrency] = useState('PEN');
  const [taxRate, setTaxRate] = useState(18);
  const [deliveryFlatFee, setDeliveryFlatFee] = useState<string>('');
  const [logoUrl, setLogoUrl] = useState('');
  const [useGenericLogo, setUseGenericLogo] = useState(true);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<StoreSettings>('/settings/store');
      setStoreName(data.storeName ?? '');
      setPhoneNumber(data.phoneNumber ?? '');
      setCurrency(data.currency ?? 'PEN');
      setTaxRate(data.taxRate ?? 18);
      setDeliveryFlatFee(
        data.deliveryFlatFee != null && data.deliveryFlatFee !== undefined
          ? String(data.deliveryFlatFee)
          : '',
      );
      if (data.logoUrl) {
        setLogoUrl(data.logoUrl);
        setUseGenericLogo(false);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'No se pudieron cargar los datos de la tienda');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready) loadSettings();
  }, [ready, loadSettings]);

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
    if (!file.type.startsWith('image/')) {
      toast.error('Selecciona una imagen valida');
      return;
    }
    try {
      const compressed = await compressLogoFile(file);
      setLogoUrl(compressed);
      setUseGenericLogo(false);
    } catch {
      toast.error('No se pudo procesar la imagen');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim()) {
      toast.error('El nombre de la tienda es obligatorio');
      return;
    }
    if (phoneNumber.trim().length < 6) {
      toast.error('El telefono debe tener al menos 6 caracteres');
      return;
    }

    setSaving(true);
    try {
      await api.patch('/settings/store', {
        storeName: storeName.trim(),
        phoneNumber: phoneNumber.trim(),
        currency,
        taxRate: Number(taxRate),
        deliveryFlatFee:
          deliveryFlatFee.trim() === '' ? null : Number.parseFloat(deliveryFlatFee),
        logoUrl: effectiveLogo || undefined,
      });
      toast.success('Configuracion guardada');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (!ready) return null;

  return (
    <div className="max-w-2xl">
      <PageHeader title="Configuracion" subtitle="Datos generales de tu tienda" />
      <SettingsNav />

      {loading ? (
        <Card>
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="h-24 w-full" />
          </div>
        </Card>
      ) : (
        <Card>
          <form onSubmit={handleSave} className="space-y-5">
            <Field label="Nombre de la tienda">
              <input
                className="zent-input"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Mi Tienda"
                required
              />
            </Field>

            <Field label="Telefono (WhatsApp)">
              <input
                className="zent-input"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="51987654321"
                required
              />
            </Field>

            <Field label="Logo">
              <div className="flex flex-wrap items-center gap-4">
                {effectiveLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={effectiveLogo}
                    alt="Logo de la tienda"
                    className="h-16 w-16 rounded-xl border border-slate-200 object-cover"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-xl border border-dashed border-slate-200 bg-slate-50" />
                )}
                <div className="space-y-2">
                  <label className="zent-btn-secondary cursor-pointer">
                    Subir imagen
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleLogoFile(e.target.files[0])}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={useGenericLogo}
                      onChange={(e) => setUseGenericLogo(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    Usar logo generico (inicial del nombre)
                  </label>
                </div>
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Moneda">
                <select
                  className="zent-input"
                  value={currency}
                  onChange={(e) => handleCurrency(e.target.value)}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="IVA / Impuesto (%)">
                <input
                  type="number"
                  className="zent-input"
                  value={taxRate}
                  min={0}
                  max={100}
                  onChange={(e) => setTaxRate(Number(e.target.value))}
                />
              </Field>
            </div>

            <Field label="Costo fijo de delivery (opcional)">
              <input
                type="number"
                className="zent-input"
                value={deliveryFlatFee}
                min={0}
                step="0.01"
                onChange={(e) => setDeliveryFlatFee(e.target.value)}
                placeholder="Ej: 8.00 — dejar vacio si no aplica"
              />
            </Field>

            <div className="flex justify-end pt-2">
              <Button type="submit" loading={saving}>
                Guardar cambios
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
