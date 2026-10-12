import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { errorMessage, labelFor } from '../types.js';
import { Icon } from '../components/Icon.js';
import { Badge, ErrorBanner, Loading, PageIntro, PanelHeading } from '../components/ui.js';

interface MethodologyData {
  version: string; weights: Record<string, number>; thresholds: Record<string, number>; limitations: string[];
  formula: string; componentNotes: Record<string, string>; excludedFromScore: string[]; missingData: string;
}

export function Methodology() {
  const [data, setData] = useState<MethodologyData | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setError('');
    api<MethodologyData>('/api/methodology', { signal: controller.signal }).then(setData).catch((reason) => { if (!controller.signal.aborted) setError(errorMessage(reason)); });
    return () => controller.abort();
  }, [retry]);
  if (error) return <ErrorBanner message={error} retry={() => setRetry(retry + 1)} />;
  if (!data) return <Loading label="Loading the methodology…" />;
  return <div className="page-stack"><PageIntro eyebrow="Transparent by design" title="No black boxes. Just context." action={<Badge tone="accent">{data.version}</Badge>}>Every score has a traceable explanation. Here's how the components come together.</PageIntro>
    <section className="formula-panel"><span className="eyebrow">The published formula</span><h3>{data.formula}</h3><p>Only available components contribute. A minimum of 60% top-level coverage is required.</p><div className="weight-grid">{Object.entries(data.weights).map(([key, value], i) => <div key={key}><span className="weight-index">0{i + 1}</span><strong>{value}<small>%</small></strong><span>{labelFor(key)}</span></div>)}</div></section>
    <div className="content-grid"><section className="panel"><PanelHeading title="The building blocks" subtitle="Available subfields are reweighted within each component" />{Object.entries(data.componentNotes).map(([key, value], i) => <div className="method-row" key={key}><span className="method-number">0{i + 1}</span><div><h4>{labelFor(key)}</h4><p>{value}</p></div></div>)}</section>
      <section className="panel"><PanelHeading title="Human judgment, always" subtitle="What this score means in practice" />{data.limitations.map((limitation) => <div className="guardrail" key={limitation}><Icon name="shield" size={18} /><p>{limitation}</p></div>)}<div className="method-exclusion"><h4>Context, not score</h4><p>{data.excludedFromScore.join(' and ')} are excluded from the calculation.</p></div><div className="method-exclusion"><h4>Missing measurements stay missing</h4><p>{data.missingData}</p></div></section></div>
    <section className="panel"><PanelHeading title="Visible review thresholds" subtitle="Heuristic prompts for a faculty conversation" /><div className="threshold-grid">{Object.entries(data.thresholds).map(([key, value]) => <div key={key}><span>{labelFor(key.replace(/Score$/, ' score'))}</span><strong>&lt; {value}{key === 'attendance' ? '%' : ''}</strong></div>)}</div></section>
  </div>;
}
