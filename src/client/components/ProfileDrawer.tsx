import { useEffect, useState, type CSSProperties } from 'react';
import { api } from '../api/client.js';
import { displayDate, errorMessage, initials, labelFor, type Profile } from '../types.js';
import { Icon } from './Icon.js';
import { Badge, ErrorBanner, Loading, Modal, Progress, Score } from './ui.js';

export function ProfileDrawer({ studentId, onClose, onCreate }: { studentId: string; onClose: () => void; onCreate: (id: string) => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [note, setNote] = useState('');
  const [interventionId, setInterventionId] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); setError('');
    api<Profile>(`/api/students/${encodeURIComponent(studentId)}`, { signal: controller.signal }).then(setProfile).catch((reason) => { if (!controller.signal.aborted) setError(errorMessage(reason)); });
    return () => controller.abort();
  }, [studentId, revision]);
  const saveNote = async () => {
    if (!interventionId || !note.trim()) return;
    setSaving(true); setError('');
    try {
      await api(`/api/interventions/${interventionId}/notes`, { method: 'POST', body: JSON.stringify({ body: note }) });
      setNote(''); setRevision((value) => value + 1);
    } catch (reason) { setError(errorMessage(reason)); } finally { setSaving(false); }
  };
  const record = profile?.record;
  const explanation = profile?.explanation;
  return <Modal labelId="profile-title" className="profile-drawer" onClose={onClose}>
    <header className="drawer-header"><span className="eyebrow">Student spotlight</span><button className="icon-button" aria-label="Close profile" onClick={onClose}><Icon name="close" /></button></header>
    <div className="drawer-body"><div className="profile-identity"><span className="avatar large">{initials(record?.displayName ?? studentId)}</span><div><h2 id="profile-title">{record?.displayName ?? 'Student profile'}</h2><p>{studentId}{record && ` · Semester ${record.semester ?? 'not supplied'}`}</p></div></div>
      {error && <ErrorBanner message={error} retry={() => setRevision((value) => value + 1)} />}
      {!profile ? <Loading label="Gathering the student’s context…" /> : <>
        <p className="profile-cohort">{record!.department}<span>·</span>{record!.programme}</p>
        <div className="profile-score"><div><span className="eyebrow">Student Success Score</span><Score value={explanation!.score} large /><Badge tone={explanation!.supportLevel}>{labelFor(explanation!.supportLevel)}</Badge></div>
          <div className="coverage-ring" style={{ '--coverage': `${explanation!.coverage}%` } as CSSProperties}><div><strong>{explanation!.coverage.toFixed(0)}%</strong><span>coverage</span></div></div>
        </div>
        <section className="drawer-section"><div className="drawer-section-heading"><h3>Behind the score</h3><Badge tone="accent">{explanation!.algorithmVersion}</Badge></div><p className="summary-copy">{explanation!.summary}</p>
          <div className="component-list">{explanation!.components.map((component, i) => <div className="component" key={component.key}>
            <div className="component-top"><span>{component.label}</span><strong>{component.value === null ? 'Not supplied' : component.value.toFixed(1)}</strong></div><Progress value={component.value ?? 0} label={`${component.label} value`} tone={['accent', 'mint', 'violet', 'blue'][i]} />
            <div className="component-meta"><span>{component.contribution === null ? 'No contribution' : `+${component.contribution.toFixed(1)} weighted points`}</span><span>{component.coverage.toFixed(0)}% indicator coverage</span></div>
            <details className="component-details"><summary>View inputs & explanation<Icon name="down" size={14} /></summary><div>{component.details.map((detail) => <p key={detail}>{detail}</p>)}<p><strong>Used:</strong> {component.inputsUsed.join(', ') || 'None supplied'}</p><p><strong>Missing:</strong> {component.inputsAbsent.join(', ') || 'None'}</p></div></details>
          </div>)}</div>
        </section>
        <section className="drawer-section"><h3>Evidence to review</h3>{explanation!.signals.length ? explanation!.signals.map((signal) => <div className="evidence" key={signal.key}><Icon name="info" size={17} /><div><strong>{signal.label}</strong><p>{signal.evidence}</p></div></div>) : <div className="success-text"><Icon name="check" size={18} />No current support signal is present.</div>}
          {explanation!.missingIndicators.length > 0 && <details className="missing-box"><summary>{explanation!.missingIndicators.length} missing indicators<Icon name="down" size={16} /></summary><ul>{explanation!.missingIndicators.map((item) => <li key={item}>{item}</li>)}</ul></details>}
        </section>
        <section className="drawer-section"><h3>Segment membership</h3>{profile.segments.length ? profile.segments.map((segment) => <div className="segment-evidence" key={segment.key}><strong><Icon name="layers" size={17} />{segment.label}</strong>{segment.reasons.map((reason) => <span key={reason}><Icon name="check" size={13} />{reason}</span>)}</div>) : <p className="muted">No performance segment inferred.</p>}</section>
        <section className="drawer-section"><div className="drawer-section-heading"><h3>Source evidence</h3><span className="subtle-label">{displayDate(record!.observedAt)}</span></div>
          <div className="source-grid">
            <Source label="CGPA / declared scale" value={record!.academic.cgpa === null ? null : `${record!.academic.cgpa} / ${record!.academic.cgpaScale ?? 'not supplied'}`} />
            <Source label="Marks" value={record!.academic.marksPercent} suffix="%" /><Source label="Backlogs" value={record!.academic.backlogs} />
            <Source label="Attendance" value={record!.attendance.overallPercent} suffix="%" /><Source label="LMS logins" value={record!.lms.loginCount} /><Source label="Assignments complete" value={record!.lms.assignmentCompletionPercent} suffix="%" />
            <Source label="Events" value={record!.engagement.eventsCount} /><Source label="Clubs" value={record!.engagement.clubsCount} /><Source label="Hackathons" value={record!.engagement.hackathonsCount} /><Source label="Certifications" value={record!.engagement.certificationsCount} />
            <Source label="Aptitude" value={record!.placement.aptitudeScore} /><Source label="Coding" value={record!.placement.codingScore} /><Source label="Mock interview" value={record!.placement.mockInterviewScore} />
            <Source label="Technical skills" value={record!.skills.technicalScore} /><Source label="Soft skills" value={record!.skills.softSkillScore} /><Source label="Satisfaction (context)" value={record!.feedback.studentSatisfaction} suffix=" / 5" />
          </div>
          {record!.subjectMetrics.length > 0 && <div className="subject-evidence"><h4>Subject-level evidence</h4>{record!.subjectMetrics.map((subject) => <div key={subject.subjectCode}><strong>{subject.subjectCode}</strong><span>Marks: {subject.marksPercent === null ? 'Not supplied' : `${subject.marksPercent}%`}</span><span>Attendance: {subject.attendancePercent === null ? 'Not supplied' : `${subject.attendancePercent}%`}</span></div>)}</div>}
          {record!.feedback.facultyFeedback && <blockquote className="feedback-note"><Icon name="book" size={18} /><div><span>Faculty feedback · context only</span><p>{record!.feedback.facultyFeedback}</p></div></blockquote>}
        </section>
        <section className="drawer-section"><h3>Follow-up timeline</h3>{profile.interventions.length ? profile.interventions.map((item) => <div className="timeline-item" key={item.id}><Badge tone={item.status}>{labelFor(item.status)}</Badge><h4>{item.title}</h4><p>{item.owner} · Due {displayDate(item.dueDate)}</p>{item.notes.map((entry) => <div className="timeline-note" key={entry.id}><p>{entry.body}</p><small>{entry.author} · {displayDate(entry.createdAt)}</small></div>)}</div>) : <p className="muted">No follow-up is linked yet. Start a conversation with a faculty-owned intervention.</p>}
          {profile.interventions.length > 0 && <div className="note-box"><label>Add a follow-up note<select value={interventionId} onChange={(event) => setInterventionId(event.target.value)}><option value="">Select an intervention…</option>{profile.interventions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label><span className="sr-only">Note</span><textarea value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} placeholder="Capture the next step…" /></label><button className="secondary" disabled={!interventionId || !note.trim() || saving} onClick={saveNote}>{saving ? 'Saving…' : 'Save note'}</button></div>}
        </section>
      </>}
    </div>
    <footer className="drawer-footer"><span><Icon name="shield" size={16} />Faculty judgment comes first.</span><button className="primary" disabled={!profile} onClick={() => onCreate(studentId)}><Icon name="plus" size={17} />Create intervention</button></footer>
  </Modal>;
}

function Source({ label, value, suffix = '' }: { label: string; value: number | string | null; suffix?: string }) {
  return <div><span>{label}</span><strong className={value === null ? 'not-supplied' : ''}>{value === null ? 'Not supplied' : `${value}${suffix}`}</strong></div>;
}
