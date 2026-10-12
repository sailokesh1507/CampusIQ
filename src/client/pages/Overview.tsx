import type { CSSProperties } from 'react';
import type { DashboardData, SegmentKey, Signal } from '../../shared/types.js';
import type { Page } from '../types.js';
import { Icon, type IconName } from '../components/Icon.js';
import { Empty, Metric, PanelHeading, Progress, StudentList } from '../components/ui.js';

export function Overview({ data, onOpen, onNavigate, onSegment, onSignal }: {
  data: DashboardData; onOpen: (id: string) => void; onNavigate: (page: Page) => void;
  onSegment: (key: SegmentKey) => void; onSignal: (key: Signal) => void;
}) {
  const k = data.kpis;
  const signals: Array<{ key: Signal; label: string; count: number; tone: string; icon: IconName }> = [
    { key: 'academic', label: 'Academic performance', count: k.academicSignals, tone: 'violet', icon: 'academic' },
    { key: 'attendance', label: 'Attendance', count: k.attendanceSignals, tone: 'amber', icon: 'calendar' },
    { key: 'placement', label: 'Placement readiness', count: k.placementSignals, tone: 'blue', icon: 'target' },
    { key: 'learning', label: 'Learning & engagement', count: k.learningSignals, tone: 'mint', icon: 'activity' },
  ];
  const colors = ['var(--rose)', 'var(--amber)', 'var(--mint)', 'var(--subtle)'];
  let cursor = 0;
  const gradient = data.distribution.map((item, i) => {
    const start = cursor;
    cursor += k.totalStudents ? item.count / k.totalStudents * 100 : 0;
    return `${colors[i]} ${start}% ${cursor}%`;
  }).join(', ');
  return <div className="page-stack">
    <section className="hero">
      <div className="hero-content"><span className="hero-kicker"><Icon name="sparkles" size={15} /> A clearer picture. A better next step.</span>
        <h2>Every student.<br /><span>More possibility.</span></h2>
        <p>Turn campus signals into meaningful support. Understand your cohort, explore the evidence, and make your next conversation count.</p>
        <div className="hero-actions"><button className="hero-button" onClick={() => onNavigate('students')}>Explore students<Icon name="arrow" size={17} /></button><span><span className="status-dot" /> Connected to campus data</span></div>
      </div>
      <div className="hero-visual" aria-hidden="true">
        <div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit orbit-three" />
        <div className="orbit-core"><Icon name="academic" size={42} /></div>
        <div className="floating-tag tag-one"><span className="visual-icon"><Icon name="activity" size={17} /></span><span>Understand<b>the signals</b></span></div>
        <div className="floating-tag tag-two"><span className="visual-icon"><Icon name="heart" size={17} /></span><span>Make space<b>for support</b></span></div>
        <div className="orbit-spark spark-one" /><div className="orbit-spark spark-two" />
      </div>
    </section>
    <section className="metric-grid" aria-label="Cohort statistics">
      <Metric label="Students in view" value={k.totalStudents} note={`${k.assessedStudents} with a calculated score`} icon="users" index={0} />
      <Metric label="Median success score" value={k.medianScore ?? '—'} note="Out of 100 · current cohort" icon="chart" tone="violet" index={1} />
      <Metric label="Average coverage" value={`${k.coveragePercent}%`} note="Weighted component availability" icon="coverage" tone="mint" index={2} />
      <Metric label="Needs faculty review" value={k.needsReview} note={`${k.watch} additional students on watch`} icon="clipboard" tone="amber" index={3} />
    </section>
    <div className="content-grid overview-grid">
      <section className="panel"><PanelHeading title="Support signals" subtitle="A starting point for a human conversation" action={<span className="subtle-label">4 domains</span>} />
        <div className="signal-list">{signals.map((signal) => <button className={`signal-row tone-${signal.tone}`} key={signal.key} onClick={() => onSignal(signal.key)}>
          <span className="icon-tile"><Icon name={signal.icon} /></span><span className="signal-info"><span>{signal.label}</span><Progress value={k.totalStudents ? signal.count / k.totalStudents * 100 : 0} label={`${signal.label} share of cohort`} tone={signal.tone} /></span><strong>{signal.count}</strong><Icon name="arrowUp" size={16} />
        </button>)}</div><p className="panel-footnote"><Icon name="info" size={14} /> Signals can overlap. Faculty review gives them context.</p>
      </section>
      <section className="panel"><PanelHeading title="Cohort pulse" subtitle="Review priority across your current view" />
        <div className="distribution-content"><div className="donut" style={{ '--donut': k.totalStudents ? `conic-gradient(${gradient})` : 'var(--track)' } as CSSProperties} role="img" aria-label={`${k.totalStudents} students: ${data.distribution.map((item) => `${item.count} ${item.label}`).join(', ')}`}>
          <div className="donut-center"><strong>{k.totalStudents}</strong><span>students</span></div>
        </div><div className="distribution-legend">{data.distribution.map((item, i) => <div key={item.label}><span className="legend-dot" style={{ background: colors[i] }} /><span>{i === 2 ? 'No immediate review' : item.label}</span><strong>{item.count}</strong></div>)}</div></div>
        <div className="calculated-insight"><Icon name="sparkles" size={17} /><p><strong>Calculated insight</strong>{k.totalStudents ? `${k.assessedStudents} of ${k.totalStudents} students have enough component data for a score. Review the evidence before taking action.` : 'Adjust your filters to see insights for a broader cohort.'}</p></div>
      </section>
    </div>
    <section className="panel"><PanelHeading title="Your next conversations" subtitle="Students currently flagged for review, ordered by score" action={<button className="text-button" onClick={() => onNavigate('interventions')}>Open workbench<Icon name="arrow" size={16} /></button>} />
      {data.reviewQueue.length ? <StudentList students={data.reviewQueue.slice(0, 5)} onOpen={onOpen} /> : <Empty title="No students in the review queue">Try a broader cohort, or explore all student profiles.</Empty>}
    </section>
    <section><PanelHeading title="Look closer at your cohorts" subtitle="Overlapping segments, shared opportunities" action={<button className="text-button" onClick={() => onNavigate('segments')}>All segments<Icon name="arrow" size={16} /></button>} />
      <div className="cohort-strip">{data.segments.slice(0, 3).map((segment, i) => <button className={`cohort-tile tone-${['accent', 'amber', 'mint'][i]}`} key={segment.key} onClick={() => onSegment(segment.key)}><span className="cohort-tile-top"><Icon name="layers" size={18} /><Icon name="arrowUp" size={18} /></span><strong>{segment.count}</strong><span>{segment.label}</span></button>)}</div>
    </section>
  </div>;
}
