import type { DashboardData, SegmentKey } from '../../shared/types.js';
import { Icon } from '../components/Icon.js';
import { PageIntro, Progress } from '../components/ui.js';

export function Segments({ data, onSelect }: { data: DashboardData; onSelect: (key: SegmentKey) => void }) {
  return <div className="page-stack"><PageIntro eyebrow="Cohort intelligence" title="Shared patterns. Individual stories.">Explore overlapping groups to find opportunities for focused, faculty-led support.</PageIntro>
    <div className="segment-grid">{data.segments.map((segment, i) => {
      const percent = data.kpis.totalStudents ? segment.count / data.kpis.totalStudents * 100 : 0;
      const tone = ['accent', 'amber', 'blue', 'mint', 'violet'][i];
      return <article className={`panel segment-card tone-${tone}`} key={segment.key}>
        <div className="segment-card-top"><span className="icon-tile"><Icon name={i === 4 ? 'info' : 'layers'} /></span><span className="subtle-label">SEGMENT 0{i + 1}</span></div>
        <div className="segment-count"><strong>{segment.count}</strong><span>students</span></div><h3>{segment.label}</h3><p>{segment.description}</p>
        <Progress value={percent} label={`${segment.label} share of cohort`} tone={tone} />
        <div className="segment-footer"><span>{percent.toFixed(0)}% of this view</span><button className="text-button" disabled={!segment.count} onClick={() => onSelect(segment.key)}>Explore<Icon name="arrow" size={16} /></button></div>
      </article>;
    })}</div>
    <div className="info-banner"><Icon name="info" /><p><strong>One student can belong to multiple segments.</strong> Counts overlap; selecting a segment narrows the explorer to that group. Performance segments are withheld when component coverage is below 60%.</p></div>
  </div>;
}
