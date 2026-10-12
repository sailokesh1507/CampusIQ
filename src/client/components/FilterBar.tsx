import { useState } from 'react';
import type { StudentSummary } from '../../shared/types.js';
import { SEGMENT_LABELS, type FilterState } from '../types.js';
import { Icon } from './Icon.js';

export function FilterBar({ filters, onChange, onReset, cohort, loading }: {
  filters: FilterState; onChange: (key: keyof FilterState, value: string) => void; onReset: () => void;
  cohort: StudentSummary[]; loading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const active = Object.entries(filters).filter(([key, value]) => key !== 'sort' && key !== 'q' && value).length;
  const departments = [...new Set(cohort.map((student) => student.department))].sort();
  const programmes = [...new Set(cohort.map((student) => student.programme))].sort();
  return <section className="filter-section" aria-label="Cohort filters">
    <div className="filter-bar">
      <label className="search-input"><Icon name="search" size={18} /><span className="sr-only">Search students</span><input type="search" value={filters.q} onChange={(event) => onChange('q', event.target.value)} placeholder="Search students, IDs, programmes…" />{loading && <span className="spinner small" />}</label>
      <button className={`secondary filter-toggle ${active ? 'is-active' : ''}`} aria-expanded={expanded} aria-controls="cohort-filters" onClick={() => setExpanded(!expanded)}><Icon name="filter" size={17} />Filters{active > 0 && <span className="filter-count">{active}</span>}<Icon name="down" size={14} className={expanded ? 'rotated' : ''} /></button>
      <label className="sort-control"><span className="sr-only">Sort students</span><select value={filters.sort} onChange={(event) => onChange('sort', event.target.value)}><option value="score">Score: low to high</option><option value="coverage">Coverage: high to low</option><option value="name">Name: A to Z</option></select></label>
      {(active > 0 || filters.q) && <button className="text-button" onClick={onReset}>Reset<Icon name="close" size={14} /></button>}
    </div>
    <div id="cohort-filters" className="filter-details" hidden={!expanded}>
      <label>Department<select value={filters.department} onChange={(event) => onChange('department', event.target.value)}><option value="">All departments</option>{departments.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Programme<select value={filters.programme} onChange={(event) => onChange('programme', event.target.value)}><option value="">All programmes</option>{programmes.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Semester<select value={filters.semester} onChange={(event) => onChange('semester', event.target.value)}><option value="">All semesters</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>Semester {i + 1}</option>)}</select></label>
      <label>Support signal<select value={filters.signal} onChange={(event) => onChange('signal', event.target.value)}><option value="">All signals</option><option value="academic">Academic</option><option value="attendance">Attendance</option><option value="learning">Learning</option><option value="placement">Placement</option></select></label>
      <label>Segment<select value={filters.segment} onChange={(event) => onChange('segment', event.target.value)}><option value="">All segments</option>{Object.entries(SEGMENT_LABELS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
      <label>Data coverage<select value={filters.coverage} onChange={(event) => onChange('coverage', event.target.value)}><option value="">All coverage</option><option value="assessed">Assessed</option><option value="insufficient">Insufficient data</option></select></label>
    </div>
  </section>;
}
