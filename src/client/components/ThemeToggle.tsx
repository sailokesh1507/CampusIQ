import { useEffect, useState } from 'react';
import { Icon } from './Icon.js';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'campusiq-theme';
const systemTheme = (): Theme => window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

function savedTheme(): Theme | null {
  try { const value = localStorage.getItem(STORAGE_KEY); return value === 'dark' || value === 'light' ? value : null; }
  catch { return null; }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => savedTheme() ?? systemTheme());
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0c0e17' : '#f5f6fb');
  }, [theme]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const followSystem = () => { if (!savedTheme()) setTheme(systemTheme()); };
    const syncTabs = (event: StorageEvent) => { if (event.key === STORAGE_KEY || event.key === null) setTheme(savedTheme() ?? systemTheme()); };
    media.addEventListener('change', followSystem);
    window.addEventListener('storage', syncTabs);
    return () => { media.removeEventListener('change', followSystem); window.removeEventListener('storage', syncTabs); };
  }, []);
  return <button type="button" className="theme-toggle" role="switch" aria-checked={theme === 'dark'} aria-label="Dark mode" title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} onClick={() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* Theme still works when storage is unavailable. */ }
    setTheme(next);
  }}>
    <span className={`theme-option ${theme === 'light' ? 'selected' : ''}`}><Icon name="sun" size={17} /></span>
    <span className={`theme-option ${theme === 'dark' ? 'selected' : ''}`}><Icon name="moon" size={17} /></span>
  </button>;
}
