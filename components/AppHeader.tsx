'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Header design system: logo, nav (layar lebar), dan chip jaringan yang selalu terlihat.
export default function AppHeader() {
  const path = usePathname();
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  const home = path === '/';
  return <header className="app-header">
    <div className="app-header__bar">
      <Link className="brand" href="/"><span className="brand-logo" role="img" aria-label="PT Bumi Suksesindo" /><span className="brand-name">Inspeksi Geoteknik Harian</span></Link>
      <nav className="app-nav" aria-label="Utama">
        <Link href="/" aria-current={home ? 'page' : undefined}>Beranda</Link>
        <Link href="/riwayat" aria-current={home ? undefined : 'page'}>Riwayat inspeksi</Link>
      </nav>
      <span className={`chip ${online ? '' : 'offline'}`}><i className={`ic ic-sm ${online ? 'ic-sync' : 'ic-wifi-off'}`} aria-hidden="true" />{online ? 'Online' : 'Offline · draft di perangkat'}</span>
    </div>
  </header>;
}
