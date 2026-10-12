import { useEffect, useState } from 'react';
import type { StudentSummary } from '../../shared/types.js';
import { initials, labelFor, SEGMENT_LABELS } from '../types.js';
import { Icon } from '../components/Icon.js';
import { Badge, Empty, PageIntro, Progress, Score } from '../components/ui.js';

export function Students({ students, total, sort, onOpen }: { students: StudentSummary[]; total: number; sort: string; onOpen: (id: string) => void }) {
  const [page, setPage] = useState(1);
  const pageSize = 12;
  useEffect(() => setPage(1), [students]);
  const pages = Math.max(1, Math.ceil(students.length / pageSize));
  const items = students.slice((page - 1) * pageSize, page * pageSize);
  return <div className="page-stack"><PageIntro eyebrow="Student explorer" title="People behind the numbers." action={<Badge tone="accent">{total} students</Badge>}>Find a student, understand their context, and connect the dots for better support.</PageIntro>
    <section className="panel table-panel"><div className="table-meta"><span><span className="status-dot" /> Live student records</span><span>Sorted by {sort === 'name' ? 'name' : sort === 'coverage' ? 'coverage' : 'score'}</span></div>
      {items.length ? <>
        <div className="student-table-wrap"><table className="student-table"><thead><tr><th>Student</th><th>Success score</th><th>Coverage</th><th>Support signals</th><th>Segments</th><th><span className="sr-only">Open profile</span></th></tr></thead><tbody>
          {items.map((student) => <tr key={student.studentId}>
            <td data-label="Student"><button className="student-cell" onClick={() => onOpen(student.studentId)}><span className="avatar">{initials(student.displayName)}</span><span className="student-identity"><strong>{student.displayName}</strong><small>{student.studentId} · {student.department}</small></span></button></td>
            <td data-label="Success score"><Score value={student.score} /></td>
            <td data-label="Coverage"><div className="table-coverage"><span>{student.coverage.toFixed(0)}%</span><Progress value={student.coverage} label={`${student.displayName} coverage`} tone="mint" /></div></td>
            <td data-label="Support signals"><span className="tag-group">{student.signals.length ? student.signals.map((signal) => <Badge key={signal} tone={signal}>{labelFor(signal)}</Badge>) : <span className="subtle-label">No current signals</span>}</span></td>
            <td data-label="Segments"><span className="segment-cell">{student.segments.length ? student.segments.map((segment) => <span key={segment}>{SEGMENT_LABELS[segment]}</span>) : <span className="subtle-label">—</span>}</span></td>
            <td><button className="icon-button" onClick={() => onOpen(student.studentId)} aria-label={`Open ${student.displayName}`}><Icon name="arrowUp" size={17} /></button></td>
          </tr>)}
        </tbody></table></div>
        <div className="pagination"><span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, students.length)} of {students.length}{students.length < total ? ` loaded (${total} matching)` : ''}</span><div><button className="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>{page} / {pages}</span><button className="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div></div>
      </> : <Empty title="A fresh search might help">No students match these filters. Clear a filter or try another student ID.</Empty>}
    </section>
  </div>;
}
