import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import type { StudentSummary } from '../../shared/types.js';
import { initials, labelFor } from '../types.js';
import { Icon, type IconName } from './Icon.js';

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge badge-${tone}`}><span className="badge-dot" />{children}</span>;
}

export function Score({ value, large = false }: { value: number | null; large?: boolean }) {
  return <span className={`score ${large ? 'score-large' : ''} ${value === null ? 'score-muted' : ''}`}>
    <strong>{value === null ? 'Not assessed' : value.toFixed(1)}</strong>{value !== null && <small>/ 100</small>}
  </span>;
}

export function Progress({ value, label, tone = 'accent' }: { value: number; label: string; tone?: string }) {
  return <span className={`progress-track tone-${tone}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(value.toFixed(1))}>
    <span className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </span>;
}

export function Metric({ label, value, note, icon, tone = 'accent', index = 0 }: { label: string; value: string | number; note: string; icon: IconName; tone?: string; index?: number }) {
  return <article className={`metric-card tone-${tone}`} style={{ '--order': index } as CSSProperties}>
    <div className="metric-top"><span className="icon-tile"><Icon name={icon} /></span><span>{label}</span></div>
    <strong className="metric-value">{value}</strong>
    <p className="metric-note">{note}</p>
  </article>;
}

export function PanelHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="panel-heading"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}

export function PageIntro({ eyebrow, title, children, action }: { eyebrow: string; title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="section-intro"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{children}</p></div>{action}</div>;
}

export function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty"><span className="empty-icon"><Icon name="search" size={28} /></span><h3>{title}</h3><p>{children}</p>{action}</div>;
}

export function ErrorBanner({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="alert error" role="alert"><Icon name="info" /><span>{message}</span>{retry && <button className="text-button" onClick={retry}>Try again</button>}</div>;
}

export function Loading({ label = 'Loading your workspace…' }: { label?: string }) {
  return <div className="loading-state" role="status"><span className="spinner" /><span>{label}</span></div>;
}

export function Skeleton() {
  return <div className="skeleton-layout" role="status" aria-label="Loading cohort data">
    <div className="skeleton skeleton-hero" /><div className="metric-grid">{[0, 1, 2, 3].map((item) => <div className="skeleton skeleton-metric" key={item} />)}</div>
    <div className="content-grid"><div className="skeleton skeleton-panel" /><div className="skeleton skeleton-panel" /></div>
  </div>;
}

export function StudentList({ students, onOpen }: { students: StudentSummary[]; onOpen: (id: string) => void }) {
  return <div className="student-list">{students.map((student) => <button className="student-row" key={student.studentId} onClick={() => onOpen(student.studentId)}>
    <span className="avatar">{initials(student.displayName)}</span>
    <span className="student-identity"><strong>{student.displayName}</strong><small>{student.studentId} · {student.department}</small></span>
    <Score value={student.score} /><Badge tone={student.supportLevel}>{labelFor(student.supportLevel)}</Badge><Icon name="chevron" size={16} />
  </button>)}</div>;
}

// Native dialogs provide focus containment, Escape dismissal and focus restoration.
export function Modal({ labelId, onClose, children, className = '' }: { labelId: string; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { element?.close(); document.body.style.overflow = previousOverflow; };
  }, []);
  return <dialog ref={ref} className={`modal ${className}`} aria-labelledby={labelId} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
  }}>{children}</dialog>;
}
