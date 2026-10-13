import { useState, type FormEvent } from 'react';
import type { AuthConfig, AuthUser } from '../../shared/types.js';
import { api } from '../api/client.js';
import { errorMessage } from '../types.js';
import { Icon } from '../components/Icon.js';
import { ThemeToggle } from '../components/ThemeToggle.js';

export function AuthScreen({ config, onAuthenticated, onDemoMode }: { config: AuthConfig; onAuthenticated: (user: AuthUser) => void; onDemoMode?: () => Promise<void> | void }) {
  const [email, setEmail] = useState(config.demoEmail ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await api<{ user: AuthUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); onAuthenticated(result.user); }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  };
  const enterDemo = async () => { if (!onDemoMode) return; setDemoBusy(true); setError(''); try { await onDemoMode(); } catch (reason) { setError(errorMessage(reason)); } finally { setDemoBusy(false); } };
  return <div className="auth-screen"><div className="auth-orb auth-orb-one" /><div className="auth-orb auth-orb-two" /><header className="auth-topbar"><a className="brand auth-brand" href="/"><span className="brand-mark"><Icon name="academic" size={24} /></span><span>Campus<span className="brand-iq">IQ</span><small>STUDENT SUCCESS INTELLIGENCE</small></span></a><div className="auth-topbar-actions">{onDemoMode && config.demoAccess && <button className="text-button" disabled={demoBusy} onClick={enterDemo}>{demoBusy ? 'Opening demo…' : config.required ? 'Enter demo workspace' : 'Continue in demo mode'}</button>}<ThemeToggle /></div></header><main className="auth-card"><div className="auth-card-heading"><span className="icon-tile"><Icon name="shield" size={22} /></span><span className="eyebrow">Secure faculty workspace</span><h1>Welcome back<span className="heading-dot">.</span></h1><p>Sign in to access your student success workspace.</p></div><form onSubmit={submit} className="auth-form"><label>Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@institution.edu" /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" /></label>{error && <div className="auth-error"><Icon name="info" size={16} />{error}</div>}<button className="primary auth-submit" disabled={busy || demoBusy}>{busy ? <span className="spinner small" /> : <Icon name="arrow" size={17} />}{busy ? 'Signing in…' : 'Continue to workspace'}</button></form>{config.demoAccess && <div className="auth-demo-note"><Icon name="sparkles" size={17} /><p><strong>Fictional demo workspace available</strong><span>{config.demoEmail ? `Use ${config.demoEmail} with the demo credentials from the submission brief, or use the demo button above.` : 'Use the demo access button above.'}</span></p></div>}<p className="auth-privacy"><Icon name="shield" size={14} />CampusIQ keeps faculty judgment at the center of every decision.</p></main><footer className="auth-footer">CampusIQ · Student success intelligence</footer></div>;
}
