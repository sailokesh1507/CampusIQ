import { useEffect, useMemo, useState } from 'react';
import type { AuthConfig, AuthUser, DashboardData, SegmentKey, Signal, StudentSummary } from '../shared/types.js';
import { api } from './api/client.js';
import { EMPTY_FILTERS, errorMessage, initials, type FilterState, type Page } from './types.js';
import { Icon, type IconName } from './components/Icon.js';
import { ThemeToggle } from './components/ThemeToggle.js';
import { FilterBar } from './components/FilterBar.js';
import { ProfileDrawer } from './components/ProfileDrawer.js';
import { ErrorBanner, Skeleton } from './components/ui.js';
import { Overview } from './pages/Overview.js';
import { Students } from './pages/Students.js';
import { Segments } from './pages/Segments.js';
import { Imports } from './pages/Imports.js';
import { Interventions } from './pages/Interventions.js';
import { Methodology } from './pages/Methodology.js';
import { AuthScreen } from './pages/AuthScreen.js';

const navigation: Array<{ key: Page; label: string; icon: IconName; description: string }> = [
  { key: 'overview', label: 'Overview', icon: 'grid', description: 'Your campus, at a glance.' },
  { key: 'students', label: 'Students', icon: 'users', description: 'A little context goes a long way.' },
  { key: 'segments', label: 'Segments', icon: 'layers', description: 'Understand the patterns in your cohort.' },
  { key: 'interventions', label: 'Interventions', icon: 'clipboard', description: 'Move from understanding to action.' },
  { key: 'imports', label: 'Data center', icon: 'upload', description: 'Bring your campus signals together.' },
  { key: 'methodology', label: 'Methodology', icon: 'book', description: 'Understand every part of the score.' },
];

interface StudentResponse { items: StudentSummary[]; total: number; }

export default function App() {
  const [page, setPage] = useState<Page>('overview');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [cohort, setCohort] = useState<StudentSummary[]>([]);
  const [studentTotal, setStudentTotal] = useState(0);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({ ...EMPTY_FILTERS });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState('');
  const [interventionStudent, setInterventionStudent] = useState('');
  const [search, setSearch] = useState('');
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => { const timer = setTimeout(() => setSearch(filters.q), 250); return () => clearTimeout(timer); }, [filters.q]);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api<AuthConfig>('/api/auth/config', { signal: controller.signal }), api<{ user: AuthUser | null }>('/api/auth/me', { signal: controller.signal })])
      .then(([config, session]) => { if (controller.signal.aborted) return; setAuthConfig(config); setAuthUser(session.user); }).catch(() => { if (!controller.signal.aborted) setAuthConfig({ required: false, demoMode: true, demoAccess: true, demoEmail: null }); }).finally(() => { if (!controller.signal.aborted) setAuthReady(true); });
    return () => controller.abort();
  }, []);
  const query = useMemo(() => new URLSearchParams(Object.entries({ ...filters, q: search }).filter(([, value]) => value)).toString(), [filters, search]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    Promise.all([
      api<DashboardData>(`/api/dashboard?${query}`, { signal: controller.signal }),
      api<StudentResponse>(`/api/students?pageSize=100&${query}`, { signal: controller.signal }),
    ]).then(([nextDashboard, nextStudents]) => {
      if (controller.signal.aborted) return;
      setDashboard(nextDashboard); setStudents(nextStudents.items); setStudentTotal(nextStudents.total);
    }).catch((reason) => { if (!controller.signal.aborted) setError(errorMessage(reason)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, refreshKey]);
  useEffect(() => {
    const controller = new AbortController();
    api<StudentResponse>('/api/students?pageSize=100&sort=name', { signal: controller.signal }).then((data) => setCohort(data.items)).catch((reason) => { if (!controller.signal.aborted) setError(errorMessage(reason)); });
    return () => controller.abort();
  }, [refreshKey]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 5000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (!mobileNav) return;
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileNav(false); };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [mobileNav]);

  const navigate = (next: Page) => {
    setPage(next); setMobileNav(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const showSegment = (segment: SegmentKey) => { setFilters((current) => ({ ...current, segment })); navigate('students'); };
  const showSignal = (signal: Signal) => { setFilters((current) => ({ ...current, signal })); navigate('students'); };
  const currentPage = navigation.find((item) => item.key === page)!;
  const cohortPage = ['overview', 'students', 'segments'].includes(page);
  const authenticate = (user: AuthUser) => { setAuthUser(user); setShowAuth(false); setRefreshKey((value) => value + 1); };
  const enterDemoWorkspace = async () => {
    if (!authConfig?.required) { setShowAuth(false); return; }
    const result = await api<{ user: AuthUser }>('/api/auth/demo', { method: 'POST' });
    authenticate(result.user);
  };
  const signOut = async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined); setAuthUser(null); setShowAuth(false); setRefreshKey((value) => value + 1); };

  if (!authReady) return <div className="auth-loading"><span className="spinner" /></div>;
  if ((authConfig?.required && !authUser) || (showAuth && !authUser)) return <AuthScreen config={authConfig!} onAuthenticated={authenticate} onDemoMode={enterDemoWorkspace} />;

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    {mobileNav && <button className="sidebar-overlay" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`} id="workspace-navigation">
      <a className="brand" href="#main-content" onClick={() => navigate('overview')} aria-label="CampusIQ overview"><span className="brand-mark"><Icon name="academic" size={24} /></span><span>Campus<span className="brand-iq">IQ</span><small>STUDENT SUCCESS INTELLIGENCE</small></span></a>
      <div className="workspace-label"><span className="workspace-symbol"><Icon name="layers" size={19} /></span><div><strong>{authUser?.institutionName ?? 'Faculty workspace'}</strong><small>{authUser ? `${authUser.role} access` : 'Campus intelligence'}</small></div><span className="workspace-dot" /></div>
      <span className="nav-caption">WORKSPACE</span>
      <nav aria-label="Primary navigation">{navigation.map((item, i) => <button type="button" key={item.key} className={`nav-item ${page === item.key ? 'active' : ''} ${i === 4 ? 'nav-section-start' : ''}`} aria-current={page === item.key ? 'page' : undefined} onClick={() => { setInterventionStudent(''); navigate(item.key); }}><Icon name={item.icon} size={20} /><span>{item.label}</span>{page === item.key && <span className="nav-active-dot" />}</button>)}</nav>
      <div className="sidebar-note"><span className="icon-tile"><Icon name="sparkles" size={20} /></span><strong>Insight with intention.</strong><p>Good data starts the conversation. People make the difference.</p><button className="text-button" onClick={() => navigate('methodology')}>Explore the methodology<Icon name="arrow" size={15} /></button></div>
      <div className="sidebar-foot"><span className="avatar">{authUser ? initials(authUser.displayName) : 'FA'}</span><div><strong>{authUser?.displayName ?? 'Faculty reviewer'}</strong><small>{authUser ? authUser.email : 'Demo workspace'}</small></div>{authUser ? <button className="icon-button" aria-label="Sign out" title="Sign out" onClick={signOut}><Icon name="arrow" size={17} /></button> : <Icon name="shield" size={17} />}</div>
    </aside>
    <div className="workspace-main">
      <header className="topbar"><div className="topbar-breadcrumb"><button className="icon-button menu-button" aria-label="Toggle navigation" aria-expanded={mobileNav} aria-controls="workspace-navigation" onClick={() => setMobileNav(!mobileNav)}><Icon name="menu" /></button><span>Workspace</span><Icon name="chevron" size={13} /><strong>{currentPage.label}</strong></div>
         <div className="top-actions"><span className="today"><Icon name="calendar" size={15} />{new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>{authUser ? <button className="secondary top-auth-button" onClick={signOut}><Icon name="arrow" size={15} />{authConfig?.required ? 'Sign out' : 'Return to demo'}</button> : <button className="secondary top-auth-button" onClick={() => setShowAuth(true)}><Icon name="shield" size={15} />Faculty sign in</button>}<ThemeToggle /><span className="topbar-divider" /><span className="avatar small">{authUser ? initials(authUser.displayName) : 'FA'}</span></div>
      </header>
      <main id="main-content" className="main-content" tabIndex={-1}>
        <div className="page-header"><div><div className="eyebrow">YOUR STUDENT SUCCESS WORKSPACE</div><h1>{currentPage.label}<span className="heading-dot">.</span></h1><p>{currentPage.description}</p></div><div className="page-header-actions"><button className="icon-button refresh-button" aria-label="Refresh data" disabled={loading} onClick={() => setRefreshKey((value) => value + 1)}><Icon name="refresh" size={18} className={loading ? 'spinning' : ''} /></button>{page !== 'imports' && <button className="primary" onClick={() => navigate('imports')}><Icon name="plus" size={17} />Import data</button>}</div></div>
         <div className="demo-banner"><span><span className="status-dot" />{authUser ? 'Institution workspace' : 'Synthetic demo data'}</span><span>Heuristic decision support<Icon name="info" size={13} /></span></div>
        {error && <ErrorBanner message={error} retry={() => setRefreshKey((value) => value + 1)} />}
        {cohortPage && <FilterBar filters={filters} onChange={(key, value) => setFilters((current) => ({ ...current, [key]: value }))} onReset={() => setFilters({ ...EMPTY_FILTERS })} cohort={cohort} loading={loading} />}
        <div className="page-transition" key={page} aria-busy={cohortPage && loading}>
          {cohortPage && loading && !dashboard ? <Skeleton /> : <>
            {page === 'overview' && dashboard && <Overview data={dashboard} onOpen={setProfileId} onNavigate={navigate} onSegment={showSegment} onSignal={showSignal} />}
            {page === 'students' && <Students students={students} total={studentTotal} sort={filters.sort} onOpen={setProfileId} />}
            {page === 'segments' && dashboard && <Segments data={dashboard} onSelect={showSegment} />}
          </>}
          {page === 'imports' && <Imports onComplete={(message) => { setRefreshKey((value) => value + 1); setToast(message); navigate('overview'); }} />}
          {page === 'interventions' && <Interventions key={interventionStudent} students={cohort} onOpen={setProfileId} preselectedId={interventionStudent} onCreated={setToast} />}
          {page === 'methodology' && <Methodology />}
        </div>
        <footer className="workspace-footer"><span>Built around people. Informed by data.</span><span>CampusIQ · Student success intelligence</span></footer>
      </main>
    </div>
    {profileId && <ProfileDrawer key={profileId} studentId={profileId} onClose={() => setProfileId(null)} onCreate={(id) => { setProfileId(null); setInterventionStudent(id); navigate('interventions'); }} />}
    {toast && <div className="toast" role="status"><Icon name="check" size={18} /><span>{toast}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast('')}><Icon name="close" size={16} /></button></div>}
  </div>;
}
