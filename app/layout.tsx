import 'leaflet/dist/leaflet.css';
import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Roboto, Roboto_Mono } from 'next/font/google';
import AppHeader from '../components/AppHeader.tsx';

// Font di-host sendiri saat build sehingga ikut cache offline.
const roboto = Roboto({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-roboto' });
const robotoMono = Roboto_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-roboto-mono' });

export const metadata: Metadata = { title: 'Inspeksi Geoteknik Harian' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" className={`${roboto.variable} ${robotoMono.variable}`}>
      <body><AppHeader />{children}</body>
    </html>
  );
}
