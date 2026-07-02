export const CURRENCIES = [
  { code: 'PEN', label: 'Sol peruano (S/)', tax: 18 },
  { code: 'USD', label: 'Dolar estadounidense ($)', tax: 0 },
  { code: 'MXN', label: 'Peso mexicano ($)', tax: 16 },
  { code: 'COP', label: 'Peso colombiano ($)', tax: 19 },
  { code: 'CLP', label: 'Peso chileno ($)', tax: 19 },
  { code: 'ARS', label: 'Peso argentino ($)', tax: 21 },
];

const AVATAR_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#059669', '#ea580c', '#0891b2'];

export function generateAvatar(name: string): string {
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

export async function compressLogoFile(file: File): Promise<string> {
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

export function generatePassword(length = 16): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}
