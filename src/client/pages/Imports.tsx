import { useEffect, useRef, useState } from 'react';
import { api, apiUrl } from '../api/client.js';
import type { ImportError } from '../../shared/types.js';
import { displayDate, errorMessage, labelFor } from '../types.js';
import { Icon } from '../components/Icon.js';
import { Badge, ErrorBanner, PageIntro, PanelHeading } from '../components/ui.js';

interface Preview { batchId: string; totalRows: number; acceptedRows: number; rejectedRows: number; errors: ImportError[]; }
interface Batch { id: string; filename: string; status: string; accepted_rows: number; rejected_rows: number; imported_at: string | null; }

export function Imports({ onComplete }: { onComplete: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'atomic' | 'partial'>('atomic');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<'validate' | 'commit' | null>(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [historyError, setHistoryError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    api<Batch[]>('/api/imports', { signal: controller.signal }).then(setBatches).catch((reason) => { if (!controller.signal.aborted) setHistoryError(errorMessage(reason)); });
    return () => controller.abort();
  }, []);

  const chooseFile = (next: File | null) => {
    setPreview(null); setError('');
    if (next && (!next.name.toLowerCase().endsWith('.csv') || next.size > 2 * 1024 * 1024)) {
      setError('Choose a CSV file smaller than 2 MB.'); setFile(null); return;
    }
    setFile(next);
  };
  const validate = async () => {
    if (!file) return;
    setBusy('validate'); setError(''); setPreview(null);
    try {
      const body = new FormData(); body.append('file', file); body.append('mode', mode);
      setPreview(await api<Preview>('/api/imports/validate', { method: 'POST', body }));
    } catch (reason) { setError(errorMessage(reason)); } finally { setBusy(null); }
  };
  const commit = async () => {
    if (!preview) return;
    setBusy('commit'); setError('');
    try {
      const result = await api<{ importedRows: number }>(`/api/imports/${preview.batchId}/commit`, { method: 'POST' });
      onComplete(`${result.importedRows} record${result.importedRows === 1 ? '' : 's'} imported. Your cohort is up to date.`);
    } catch (reason) { setError(errorMessage(reason)); } finally { setBusy(null); }
  };
  const canCommit = preview && preview.acceptedRows > 0 && !preview.errors.some((item) => item.rowNumber === 1) && (mode === 'partial' || !preview.errors.length);

  return <div className="page-stack"><PageIntro eyebrow="Data center" title="Connect the pieces." action={<a className="secondary" href={apiUrl('/api/import/templates/unified')} download><Icon name="download" size={17} />CSV template</a>}>One validated import brings your campus signals into focus. Start with the unified template.</PageIntro>
    <ol className="import-steps" aria-label="Import progress">{['Select a file', 'Review validation', 'Import & recalculate'].map((label, i) => <li className={(i === 0 || (i === 1 && preview) || (i === 2 && busy === 'commit')) ? 'step-active' : ''} key={label}><span>{i + 1}</span>{label}</li>)}</ol>
    <div className="import-grid"><section className="panel">
      <PanelHeading title="Upload your CSV" subtitle="Up to 2 MB · unified format" />
      <div className={`drop-zone ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`} onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); if (!busy) chooseFile(event.dataTransfer.files[0] ?? null); }}>
        <span className="upload-icon"><Icon name={file ? 'file' : 'upload'} size={30} /></span><h3>{file?.name ?? 'Drop your file right here'}</h3><p>{file ? `${(file.size / 1024).toFixed(1)} KB · Ready to validate` : 'or choose a CSV from your device'}</p>
        <input ref={fileInput} className="sr-only" tabIndex={-1} type="file" accept=".csv,text/csv" aria-label="CSV file" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} disabled={Boolean(busy)} />
        <button className="secondary" onClick={() => fileInput.current?.click()} disabled={Boolean(busy)}>{file ? 'Change file' : 'Choose a file'}<Icon name="plus" size={16} /></button>
      </div>
      <div className="import-options"><label>Import mode<select value={mode} disabled={Boolean(busy)} onChange={(event) => { setMode(event.target.value as typeof mode); setPreview(null); }}><option value="atomic">Atomic — all rows must pass</option><option value="partial">Partial — import valid rows only</option></select></label><button className="primary" disabled={!file || Boolean(busy)} onClick={validate}>{busy === 'validate' ? <span className="spinner small" /> : <Icon name="shield" size={17} />}Validate file</button></div>
    </section><aside className="panel import-guide"><span className="icon-tile tone-violet"><Icon name="layers" /></span><h3>Seven domains. One view.</h3><p>Academic, attendance, LMS, engagement, placement, skills, and feedback.</p>
      <ul className="check-list"><li><Icon name="check" />Match records by stable student ID</li><li><Icon name="check" />Declare your CGPA scale</li><li><Icon name="check" />Include an observation date</li><li><Icon name="check" />Keep missing measurements blank</li></ul>
      <div className="info-banner compact"><Icon name="info" size={17} /><p>Current workspace: synthetic demonstration data. Preview errors before committing a batch.</p></div>
    </aside></div>
    {error && <ErrorBanner message={error} />}
    {preview && <section className="panel validation-panel"><PanelHeading title="Your validation results" subtitle={`${preview.totalRows} rows checked · ${preview.acceptedRows} accepted · ${preview.rejectedRows} rejected`} action={<Badge tone={preview.errors.length ? 'watch' : 'completed'}>{preview.errors.length ? 'Review required' : 'Ready to import'}</Badge>} />
      {preview.errors.length ? <div className="error-table-wrap"><table className="error-table"><thead><tr><th>Row</th><th>Field</th><th>What to fix</th></tr></thead><tbody>{preview.errors.map((item, i) => <tr key={i}><td>{item.rowNumber}</td><td><code>{item.field}</code></td><td>{item.message}</td></tr>)}</tbody></table></div> : <p className="success-text"><Icon name="check" size={18} />All rows passed validation. Your data is ready.</p>}
      <div className="validation-actions"><p>{mode === 'partial' && preview.rejectedRows ? `Confirm importing ${preview.acceptedRows} valid rows. ${preview.rejectedRows} rejected rows will be skipped.` : 'The dashboard will recalculate after your import is saved.'}</p><button className="primary" disabled={!canCommit || Boolean(busy)} onClick={commit}>{busy === 'commit' ? 'Importing…' : `Confirm & import ${preview.acceptedRows} rows`}<Icon name="arrow" size={17} /></button></div>
    </section>}
    {(batches.length > 0 || historyError) && <section className="panel"><PanelHeading title="Recent imports" subtitle="Validation and commit history" />{historyError ? <ErrorBanner message={historyError} /> : <div className="batch-list">{batches.slice(0, 8).map((batch) => <div key={batch.id}><span className="icon-tile"><Icon name="file" /></span><span className="student-identity"><strong>{batch.filename}</strong><small>{batch.accepted_rows} accepted · {batch.rejected_rows} rejected{batch.imported_at ? ` · ${displayDate(batch.imported_at)}` : ''}</small></span><Badge tone={batch.status === 'committed' ? 'completed' : 'neutral'}>{labelFor(batch.status)}</Badge></div>)}</div>}</section>}
  </div>;
}
