import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import { RealtimeToasts } from '@/components/RealtimeToasts';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Zent — Panel de inventario',
  description: 'Sistema de inventario y ventas por WhatsApp',
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📦</text></svg>",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body className={`${inter.className} min-h-dvh`}>
        {children}
        <RealtimeToasts />
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
