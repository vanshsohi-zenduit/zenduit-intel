import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileText, Play, Download, X, CheckCircle, AlertCircle, Loader, Zap, User } from 'lucide-react';
import { parseCSV, toCSV, downloadFile } from '../lib/utils.js';
import { bulkProcess, fetchReps, saveLibraryEntry } from '../lib/mcpClient.js';

// Any columns work — the backend extracts intel from whatever fields are present.
// This template just shows a few common ones.
const SAMPLE_CSV = `Company Name,Website,Description,Contacts
Werner Enterprises,werner.com,"National truckload carrier with ~8,000 tractors","Jane Doe (VP Operations)"
J.B. Hunt Transport,jbhunt.com,"Intermodal and dedicated contract carriage",
Old Dominion Freight,odfl.com,"Less-than-truckload (LTL) carrier",`;

const BATCH = 20; // matches the backend per-request cap

// Heuristic display fields — backend does the real extraction; these are only for
// the row list while processing. Keys are post-parseCSV (lowercased, underscored).
const PICK_NAME = ['company_name', 'company', 'name', 'account', 'account_name', 'organization'];
const PICK_SITE = ['website', 'website_url', 'url', 'domain', 'site', 'web'];
const PICK_REP  = ['rep', 'owner', 'assigned_to', 'sales_rep', 'salesperson', 'assigned_rep', 'rep_name'];
const pick = (row, cands) => {
  for (const c of cands) if (row[c] && String(row[c]).trim()) return String(row[c]).trim();
  for (const c of cands) {
    const k = Object.keys(row).find(k => k.includes(c) && row[k] && String(row[k]).trim());
    if (k) return String(row[k]).trim();
  }
  return '';
};

const scoreColor = s => s >= 8 ? '#10B981' : s >= 5 ? '#D97706' : '#64748B';

const StatusDot = ({ status }) => {
  if (status === 'processing') return <Loader className="w-3.5 h-3.5 animate-spin" style={{ color: '#2563eb' }} />;
  if (status === 'success')    return <CheckCircle className="w-3.5 h-3.5" style={{ color: '#16a34a' }} />;
  if (status === 'error')      return <AlertCircle className="w-3.5 h-3.5" style={{ color: '#dc2626' }} />;
  return <div className="w-3.5 h-3.5 rounded-full shrink-0" style={{ border: '1px solid #e2e8f0' }} />;
};

const BulkUpload = ({ onSaveResults }) => {
  const [prospects,    setProspects]    = useState([]);
  const [isProcessing, setProcessing]   = useState(false);
  const [currentPhase, setCurrentPhase] = useState('');
  const [doneCount,    setDoneCount]    = useState(0);
  const [reps,         setReps]         = useState([]);
  const [selectedRep,  setSelectedRep]  = useState(null);
  const [repQuery,     setRepQuery]     = useState('');
  const [showRepList,  setShowRepList]  = useState(false);
  const fileRef = useRef();

  useEffect(() => { fetchReps().then(setReps).catch(() => {}); }, []);

  const filteredReps = repQuery.trim()
    ? reps.filter(r => r.name.toLowerCase().includes(repQuery.toLowerCase()))
    : reps;

  const handleFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rows = parseCSV(e.target.result);
      const normalized = rows.map((r, i) => ({
        id:          i,
        raw:         r,                  // full row — every column, sent to the backend
        companyName: pick(r, PICK_NAME), // display only
        websiteUrl:  pick(r, PICK_SITE), // display only
        status: 'pending',
        result: null,
      })).filter(r => r.companyName || r.websiteUrl || Object.values(r.raw).some(v => v && String(v).trim()));
      setProspects(normalized);
      setDoneCount(0);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type === 'text/csv' || file?.name.endsWith('.csv')) handleFile(file);
  };

  const handleProcess = async () => {
    if (!prospects.length || isProcessing) return;
    setProcessing(true);
    setDoneCount(0);

    const snapshot = prospects;
    const total    = snapshot.length;
    const batches  = Math.ceil(total / BATCH);
    const saved    = [];
    let done = 0;

    try {
      for (let b = 0; b < batches; b++) {
        const start = b * BATCH;
        const slice = snapshot.slice(start, start + BATCH);
        setCurrentPhase(`Batch ${b + 1} of ${batches} — extracting…`);
        setProspects(prev => prev.map((r, idx) =>
          idx >= start && idx < start + slice.length ? { ...r, status: 'processing' } : r));

        try {
          const scored = await bulkProcess(slice.map(p => p.raw));
          setProspects(prev => prev.map((r, idx) => {
            if (idx < start || idx >= start + slice.length) return r;
            const res = scored[idx - start] || {};
            if (res.status === 'error') return { ...r, status: 'error', errorMsg: res.reason || 'Extraction failed' };
            return { ...r, status: 'success', result: res };
          }));

          for (let i = 0; i < slice.length; i++) {
            const res = scored[i];
            if (!res || res.status !== 'success') continue;
            const p = slice[i];
            // Per-row rep: CSV column takes precedence over dropdown
            const rowRepName = pick(p.raw, PICK_REP);
            let rowRep = selectedRep;
            if (rowRepName) {
              const found = reps.find(r => r.name.toLowerCase() === rowRepName.toLowerCase());
              if (found) rowRep = { name: found.name, clickupMemberId: found.id };
              else rowRep = { name: rowRepName, clickupMemberId: null };
            }
            const entry = {
              ...res,
              intel: res,
              websiteUrl: p.websiteUrl,
              companyName: res.companyName || p.companyName,
              assignedRep: rowRep || null,
              source: 'bulk',
            };
            await saveLibraryEntry(entry);
            saved.push(entry);
          }
        } catch (err) {
          setProspects(prev => prev.map((r, idx) =>
            idx >= start && idx < start + slice.length ? { ...r, status: 'error', errorMsg: err.message } : r));
        }

        done += slice.length;
        setDoneCount(done);
      }
      if (saved.length) onSaveResults?.(saved);
    } finally {
      setCurrentPhase('');
      setProcessing(false);
    }
  };

  const handleExport = () => {
    const rows = prospects
      .filter(p => p.status === 'success' && p.result)
      .map(p => ({
        company:        p.result.companyName || p.companyName,
        website:        p.result.website     || p.websiteUrl,
        industry:       p.result.industry     || '',
        fleet_size:     p.result.fleetSize    || '',
        top_pain_point: p.result.topPainPoint || '',
        best_product:   p.result.topProduct   || '',
        key_contact:    p.result.keyContact   || '',
        signals:        (p.result.signals || []).join(' | '),
        fit_score:      p.result.score ?? '',
        reason:         p.result.reason       || '',
      }));
    downloadFile(toCSV(rows), 'bulk-intel-results.csv', 'text/csv');
  };

  const successCount = prospects.filter(p => p.status === 'success').length;
  const hasResults   = successCount > 0;

  return (
    <div className="w-full max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#0f172a' }}>Bulk Processor</h1>
          <p className="text-[13px] mt-1" style={{ color: '#64748b' }}>
            Upload any CSV — intel is extracted dynamically from whatever columns it has, in batches of {BATCH}
          </p>
        </div>
        <button
          onClick={() => downloadFile(SAMPLE_CSV, 'sample-prospects.csv', 'text/csv')}
          className="flex items-center gap-1.5 rounded-lg text-[12px] font-medium"
          style={{ padding: '0 14px', height: '36px', background: 'rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer' }}
        >
          <Download className="w-3.5 h-3.5" /> Template
        </button>
      </div>

      {/* Rep selector */}
      <div className="mb-4 flex flex-col gap-1.5">
        <label className="text-[11px] font-medium uppercase tracking-wider" style={{ color: '#64748b' }}>
          Default Rep Assignment
          <span className="ml-1.5 normal-case font-normal" style={{ color: '#94a3b8' }}>
            — optional · CSV column "rep/owner/sales_rep" overrides per-row
          </span>
        </label>
        <div className="relative" style={{ maxWidth: '380px' }}>
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#94a3b8' }} />
          <input
            type="text"
            placeholder={selectedRep ? selectedRep.name : 'Search rep name…'}
            value={selectedRep ? selectedRep.name : repQuery}
            onChange={e => { setRepQuery(e.target.value); setSelectedRep(null); setShowRepList(true); }}
            onFocus={() => setShowRepList(true)}
            onBlur={() => setTimeout(() => setShowRepList(false), 150)}
            style={{
              height: '40px', paddingLeft: '36px', paddingRight: selectedRep ? '32px' : '12px',
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px',
              fontSize: '14px', color: '#0f172a', outline: 'none', width: '100%',
            }}
          />
          {selectedRep && (
            <button
              onClick={() => { setSelectedRep(null); setRepQuery(''); }}
              style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '16px' }}
            >×</button>
          )}
          {showRepList && filteredReps.length > 0 && !selectedRep && (
            <div style={{
              position: 'absolute', top: '44px', left: 0, right: 0, zIndex: 50,
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px',
              boxShadow: '0 4px 16px rgba(0,0,0,.12)', maxHeight: '200px', overflowY: 'auto',
            }}>
              {filteredReps.slice(0, 30).map(r => (
                <button
                  key={r.id}
                  onMouseDown={() => { setSelectedRep({ name: r.name, clickupMemberId: r.id }); setRepQuery(''); setShowRepList(false); }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '9px 14px', fontSize: '13px', color: '#0f172a',
                    background: 'none', border: 'none', cursor: 'pointer',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Drop zone */}
      {prospects.length === 0 && (
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className="rounded-xl p-16 text-center cursor-pointer"
          style={{ border: '2px dashed #e2e8f0', background: '#ffffff', transition: 'border-color 0.15s, background 0.15s' }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'rgba(37,99,235,0.30)';
            e.currentTarget.style.background  = 'rgba(37,99,235,0.02)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = '#e2e8f0';
            e.currentTarget.style.background  = '#ffffff';
          }}
        >
          <div className="flex items-center justify-center rounded-xl mx-auto mb-4"
            style={{ width: '52px', height: '52px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <Upload className="w-6 h-6" style={{ color: '#94a3b8' }} />
          </div>
          <h3 className="text-[15px] font-semibold mb-2" style={{ color: '#0f172a' }}>Drop CSV file here</h3>
          <p className="text-[13px] mb-6" style={{ color: '#64748b' }}>
            Any columns — we read them all. Richer rows (description, contacts, operations) yield richer intel.
          </p>
          <div className="inline-flex items-center gap-2 rounded-lg text-[13px] font-medium"
            style={{ padding: '8px 20px', background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.20)', color: '#2563eb' }}>
            Browse Files
          </div>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => handleFile(e.target.files[0])} />
        </div>
      )}

      {/* Loaded prospects */}
      {prospects.length > 0 && (
        <div className="card overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: '1px solid #e2e8f0', background: 'rgba(0,0,0,0.01)' }}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center justify-center rounded-lg shrink-0"
                style={{ width: '32px', height: '32px', background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.16)' }}>
                <FileText className="w-4 h-4" style={{ color: '#2563eb' }} />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold" style={{ color: '#0f172a' }}>{prospects.length} prospects loaded</p>
                {isProcessing
                  ? <p className="text-[11px] truncate" style={{ color: '#2563eb' }}>{doneCount}/{prospects.length} done · {currentPhase}</p>
                  : <p className="text-[11px]" style={{ color: '#64748b' }}>
                      {hasResults ? `${successCount} extracted` : 'Dynamic extraction — reads every column per row'}
                    </p>
                }
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!isProcessing && (
                <button
                  onClick={() => { setProspects([]); setDoneCount(0); }}
                  className="flex items-center justify-center rounded-lg"
                  style={{ width: '32px', height: '32px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.18)', color: '#DC2626' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={handleProcess}
                disabled={isProcessing}
                className="flex items-center gap-1.5 rounded-lg text-[13px] font-medium"
                style={{
                  height: '40px', padding: '0 18px',
                  background: isProcessing ? 'rgba(37,99,235,0.40)' : '#2563eb',
                  color: '#fff', border: 'none',
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  opacity: isProcessing ? 0.7 : 1,
                }}
              >
                {isProcessing
                  ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Processing…</>
                  : <><Zap className="w-3.5 h-3.5" /> Run Research</>
                }
              </button>
            </div>
          </div>

          {/* Rows */}
          <div className="flex flex-col gap-1 p-3">
            {prospects.map((p) => {
              const isActive = p.status === 'processing';
              const score    = p.result?.score;
              return (
                <div key={p.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg"
                  style={{
                    background: isActive ? 'rgba(37,99,235,0.04)' : '#ffffff',
                    border: `1px solid ${isActive ? 'rgba(37,99,235,0.18)' : '#e2e8f0'}`,
                  }}
                >
                  <StatusDot status={p.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate" style={{ color: '#0f172a' }}>{p.companyName || p.websiteUrl}</p>
                    {isActive && currentPhase
                      ? <p className="text-[11px] truncate" style={{ color: '#2563eb' }}>{currentPhase}</p>
                      : p.websiteUrl
                      ? <p className="text-[11px] truncate" style={{ color: '#64748b' }}>{p.websiteUrl}</p>
                      : null
                    }
                  </div>
                  {p.status === 'success' && p.result && (
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right hidden sm:block">
                        <p className="text-[11px]" style={{ color: '#64748b' }}>{p.result.industry || '—'}</p>
                        <p className="text-[11px]" style={{ color: '#2563eb' }}>{p.result.topProduct || ''}</p>
                      </div>
                      {score != null && (
                        <div className="flex items-center justify-center text-[12px] font-bold"
                          style={{
                            width: '36px', height: '36px', borderRadius: '50%',
                            background: `${scoreColor(score)}18`,
                            border: `1px solid ${scoreColor(score)}40`,
                            color: scoreColor(score),
                          }}>
                          {score}
                        </div>
                      )}
                    </div>
                  )}
                  {p.status === 'error' && (
                    <p className="text-[11px] shrink-0 max-w-[200px] truncate" style={{ color: '#dc2626' }}>{p.errorMsg}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Export bar */}
      {hasResults && !isProcessing && (
        <motion.div
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="mt-3 flex items-center justify-between px-5 py-4 rounded-xl"
          style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.18)' }}
        >
          <div>
            <p className="text-[13px] font-semibold" style={{ color: '#2563eb' }}>Research Complete</p>
            <p className="text-[12px] mt-0.5" style={{ color: '#64748b' }}>
              {successCount} / {prospects.length} prospects researched · saved to library
            </p>
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg text-[13px] font-medium"
            style={{ padding: '0 16px', height: '40px', background: '#2563eb', color: '#fff', cursor: 'pointer' }}
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </motion.div>
      )}
    </div>
  );
};

export default BulkUpload;
