import { useEffect, useState, type FormEvent } from 'react';
import type { Intervention, StudentSummary } from '../../shared/types.js';
import { api } from '../api/client.js';
import { displayDate, errorMessage, initials, labelFor } from '../types.js';
import { Icon } from '../components/Icon.js';
import { Badge, Empty, ErrorBanner, Loading, Modal, PageIntro } from '../components/ui.js';

const defaultDueDate = () => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const newForm = () => ({ category: 'placement', title: '', rationale: '', owner: '', dueDate: defaultDueDate() });

export function Interventions({ students, onOpen, preselectedId, onCreated }: {
  students: StudentSummary[]; onOpen: (id: string) => void; preselectedId: string; onCreated: (message: string) => void;
}) {
  const [items, setItems] = useState<Intervention[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState('');
  const [owner, setOwner] = useState('');
  const [dialog, setDialog] = useState(Boolean(preselectedId));
  const [studentId, setStudentId] = useState(preselectedId);
  const [form, setForm] = useState(newForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [expanded, setExpanded] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    api<Intervention[]>('/api/interventions', { signal: controller.signal }).then(setItems).catch((reason) => { if (!controller.signal.aborted) setError(errorMessage(reason)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  const create = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setFormError('');
    try {
      await api('/api/interventions', { method: 'POST', body: JSON.stringify({ ...form, studentId }) });
      setDialog(false); setForm(newForm()); setStudentId(''); setRevision((value) => value + 1); onCreated('Intervention saved. Your follow-up is ready.');
    } catch (reason) { setFormError(errorMessage(reason)); } finally { setSaving(false); }
  };
  const changeStatus = async (item: Intervention, next: Intervention['status']) => {
    setBusyId(item.id); setError('');
    try { await api(`/api/interventions/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) }); setRevision((value) => value + 1); }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusyId(''); }
  };
  const addNote = async (item: Intervention) => {
    if (!note.trim()) return;
    setBusyId(item.id); setError('');
    try { await api(`/api/interventions/${item.id}/notes`, { method: 'POST', body: JSON.stringify({ body: note }) }); setNote(''); setRevision((value) => value + 1); }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusyId(''); }
  };
  const filtered = items.filter((item) => (!status || item.status === status) && (!owner || item.owner === owner));
  return <div className="page-stack"><PageIntro eyebrow="Intervention workbench" title="Good intentions. Real next steps." action={<button className="primary" onClick={() => setDialog(true)}><Icon name="plus" size={17} />New intervention</button>}>Create a faculty-owned plan, keep the rationale visible, and follow through together.</PageIntro>
    <div className="workbench-stats">{(['open', 'in_progress', 'completed', 'cancelled'] as const).map((key) => <button className={status === key ? 'selected' : ''} key={key} onClick={() => setStatus(status === key ? '' : key)} aria-pressed={status === key}><Badge tone={key}>{labelFor(key)}</Badge><strong>{items.filter((item) => item.status === key).length}</strong></button>)}</div>
    <div className="workbench-toolbar"><span>{filtered.length} follow-ups{status && ` · ${labelFor(status)}`}</span><label><span className="sr-only">Filter by owner</span><select value={owner} onChange={(event) => setOwner(event.target.value)}><option value="">All owners</option>{[...new Set(items.map((item) => item.owner))].sort().map((item) => <option key={item}>{item}</option>)}</select></label></div>
    {error && <ErrorBanner message={error} retry={() => setRevision((value) => value + 1)} />}
    {loading && !items.length ? <Loading label="Loading follow-ups…" /> : filtered.length ? <div className="intervention-grid">{filtered.map((item) => <article className="panel intervention-card" key={item.id}>
      <div className="intervention-top"><Badge tone={item.status}>{labelFor(item.status)}</Badge><span className="subtle-label">{labelFor(item.category)}</span></div><h3>{item.title}</h3><p className="intervention-rationale">{item.rationale}</p>
      <button className="intervention-student" onClick={() => onOpen(item.studentId)}><span className="avatar small">{initials(item.studentName ?? item.studentId)}</span><span>{item.studentName ?? item.studentId}</span><Icon name="arrowUp" size={15} /></button>
      <div className="intervention-meta"><span><Icon name="users" size={15} />{item.owner}</span><span><Icon name="calendar" size={15} />Due {displayDate(item.dueDate)}</span></div>
      <div className="status-actions">{item.status === 'open' && <button className="secondary" disabled={busyId === item.id} onClick={() => changeStatus(item, 'in_progress')}>Start follow-up<Icon name="arrow" size={14} /></button>}{item.status === 'in_progress' && <button className="secondary" disabled={busyId === item.id} onClick={() => changeStatus(item, 'completed')}><Icon name="check" size={14} />Complete</button>}{['open', 'in_progress'].includes(item.status) && <button className="text-button muted" disabled={busyId === item.id} onClick={() => changeStatus(item, 'cancelled')}>Cancel</button>}<button className="text-button history-toggle" aria-expanded={expanded === item.id} onClick={() => { setExpanded(expanded === item.id ? '' : item.id); setNote(''); }}><Icon name="clock" size={15} />History ({item.notes.length})</button></div>
      {expanded === item.id && <div className="intervention-history">{item.notes.length ? item.notes.map((entry) => <div className="timeline-item" key={entry.id}><p>{entry.body}</p><small>{entry.author} · {displayDate(entry.createdAt)}</small></div>) : <p className="subtle-label">No notes yet. Add the next step below.</p>}<label>Follow-up note<textarea value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} placeholder="What happened? What's next?" /></label><button className="secondary" disabled={!note.trim() || busyId === item.id} onClick={() => addNote(item)}>Save note</button></div>}
    </article>)}</div> : <section className="panel"><Empty title="Space for your next step" action={<button className="primary" onClick={() => setDialog(true)}>Create an intervention</button>}>No follow-ups match this view. Try another status or owner.</Empty></section>}
    {dialog && <Modal labelId="intervention-title" onClose={() => { if (!saving) setDialog(false); }}><div className="modal-header"><div><span className="eyebrow">A human-led next step</span><h2 id="intervention-title">New intervention</h2></div><button className="icon-button" aria-label="Close intervention form" disabled={saving} onClick={() => setDialog(false)}><Icon name="close" /></button></div>
      <form className="intervention-form" onSubmit={create}>
        <label>Student<select required value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="">Choose a student…</option>{students.map((student) => <option key={student.studentId} value={student.studentId}>{student.displayName} · {student.studentId}</option>)}</select></label>
        <label>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option value="academic">Academic coaching</option><option value="attendance">Attendance outreach</option><option value="learning">Learning plan</option><option value="placement">Placement preparation</option><option value="wellbeing_referral">Wellbeing referral</option><option value="other">Other</option></select></label>
        <label>Title<input required maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. A confidence-building mock interview" /></label>
        <label>Observed signal & rationale<textarea required maxLength={2000} value={form.rationale} onChange={(event) => setForm({ ...form, rationale: event.target.value })} placeholder="What does the evidence show? How could a conversation help?" /></label>
        <div className="form-two"><label>Owner<input required maxLength={120} value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })} placeholder="Faculty member or team" /></label><label>Due date<input required type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label></div>
        {formError && <ErrorBanner message={formError} />}<div className="modal-actions"><button type="button" className="secondary" disabled={saving} onClick={() => setDialog(false)}>Cancel</button><button className="primary" disabled={saving || !students.length}>{saving ? 'Saving…' : 'Save intervention'}<Icon name="check" size={17} /></button></div>
      </form>
    </Modal>}
  </div>;
}
