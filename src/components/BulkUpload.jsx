import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileText, Play, Download, X, CheckCircle, AlertCircle, Loader, Zap } from 'lucide-react';
import { parseCSV, toCSV, downloadFile } from '../lib/utils.js';
import { runIntelPipeline } from '../lib/intelEngine.js';

const SAMPLE_CSV = `company_name,website_url,linkedin_url
Werner Enterprises,https://werner.com,
J.B. Hunt Transport,https://jbhunt.com,
Old Dominion Freight,https://odfl.com,
XPO Logistics,https://xpo.com,
Schneider National,https://schneider.com,`;

const scoreColor = s => s >= 8 ? '#10B981' : s >= 5 ? '#FBBF24' : '#6B7280';

const StatusDot = ({ status }) => {
  if (status === 'processing') return <Loader className="w-3.5 h-3.5 animate-spin" style={{ color: '#FBBF24' }} />;
  if (status === 'success')    return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
  if (status === 'error')      return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
  return <div className="w-3.5 h-3.5 rounded-full shrink-0" style={{ border: '1px solid rgba(255,255,255,0.15)' }} />;
};

const BulkUpload = ({ onSaveResults }) => {
  const [prospects,    setProspects]    = useState([]);
  const [isProcessing, setProcessing]  = useState(false);
  const [currentIdx,   setCurrentIdx]  = useState(-1);
  const [currentPhase, setCurrentPhase] = useState('');
  const [doneCount,    setDoneCount]   = useState(0);
  const fileRef = useRef();
  const cancelRef = useRef(null);

  const handleFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rows = parseCSV(e.target.result);
      const normalized = rows.map((r, i) => ({
        id: i,
        companyName: r.company_name || r.company || r.name || '',
        websiteUrl:  r.website_url  || r.website  || r.url  || '',
        linkedinUrl: r.linkedin_url || r.linkedin  || '',
        status: 'pending',
        result: null,
      })).filter(r => r.companyName || r.websiteUrl);
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
    setCurrentIdx(0);
    setDoneCount(0);

    const list = prospects.slice(0, 20);
    const completed = [];

    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      setCurrentIdx(i);
      setCurrentPhase('Starting research…');
      setProspects(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'processing' } : r));

      try {
        const result = await runIntelPipeline(
          { companyName: p.companyName, websiteUrl: p.websiteUrl, linkedinUrl: p.linkedinUrl },
          (progress) => {
            if (progress.type === 'phase' && progress.label) {
              setCurrentPhase(progress.label + (progress.status === 'generating' ? '…' : ''));
            }
            if (progress.type === 'tool') {
              setCurrentPhase('Searching: ' + progress.name.replace(/_/g, ' '));
            }
          }
        );
        const entry = { ...p, status: 'success', result };
        completed.push(entry);
        setProspects(prev => prev.map((r, idx) => idx === i ? entry : r));
        setDoneCount(d => d + 1);
        // Save to library as each one completes
        onSaveResults?.([{ ...result, status: 'success' }]);
      } catch (err) {
        const entry = { ...p, status: 'error', errorMsg: err.message };
        completed.push(entry);
        setProspects(prev => prev.map((r, idx) => idx === i ? entry : r));
        setDoneCount(d => d + 1);
      }
    }

    setCurrentIdx(-1);
    setCurrentPhase('');
    setProcessing(false);
  };

  const handleExport = () => {
    const rows = prospects
      .filter(p => p.status === 'success' && p.result)
      .map(p => ({
        company:       p.companyName,
        industry:      p.result.intel?.industry     || '',
        fleet_size:    p.result.intel?.fleetSize     || '',
        top_pain_point:p.result.intel?.topPainPoint  || '',
        best_product:  p.result.intel?.topProduct    || '',
        fit_score:     p.result.intel?.score         || '',
        website:       p.websiteUrl,
      }));
    downloadFile(toCSV(rows), 'bulk-intel-results.csv', 'text/csv');
  };

  const successCount = prospects.filter(p => p.status === 'success').length;
  const hasResults   = successCount > 0;

  return (
    <div className="w-full max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-white">Bulk Processor</h1>
          <p className="text-[13px] text-white/40 mt-0.5">
            Upload a CSV to run the full research pipeline on multiple prospects (max 20)
          </p>
        </div>
        <button
          onClick={() => downloadFile(SAMPLE_CSV, 'sample-prospects.csv', 'text/csv')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-colors"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.5)' }}>
          <Download className="w-3.5 h-3.5" /> Download Template
        </button>
      </div>

      {/* Drop zone */}
      {prospects.length === 0 && (
        <div
          onDragOver={e => { e.preventDefault(); }}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className="rounded-2xl p-14 text-center cursor-pointer transition-all"
          style={{ border: '2px dashed rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.015)' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(16,185,129,0.3)'; e.currentTarget.style.background = 'rgba(16,185,129,0.03)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.background = 'rgba(255,255,255,0.015)'; }}
        >
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <Upload className="w-6 h-6 text-white/25" />
          </div>
          <h3 className="text-[15px] font-bold text-white mb-1.5">Drop CSV file here</h3>
          <p className="text-[13px] text-white/35 mb-4">
            Columns: <code className="text-emerald-400/70 text-[11px]">company_name, website_url, linkedin_url</code>
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-bold"
            style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#10B981' }}>
            Browse Files
          </div>
          <input ref={fileRef} type="file" accept=".csv" className="hidden"
            onChange={e => handleFile(e.target.files[0])} />
        </div>
      )}

      {/* Loaded prospects */}
      {prospects.length > 0 && (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)' }}>

          {/* Toolbar */}
          <div className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.18)' }}>
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-white">{prospects.length} prospects loaded</p>
                {isProcessing ? (
                  <p className="text-[10px] text-emerald-400/70 truncate">
                    {doneCount}/{prospects.length} done · {currentPhase}
                  </p>
                ) : (
                  <p className="text-[10px] text-white/30">
                    {hasResults ? `${successCount} researched — full pipeline per company` : 'Full research pipeline — web search + LinkedIn + scripts'}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!isProcessing && (
                <button onClick={() => { setProspects([]); setDoneCount(0); }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={handleProcess} disabled={isProcessing}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
                style={{ background: '#10B981', color: '#07070C' }}>
                {isProcessing
                  ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Researching {currentIdx + 1}/{prospects.length}…</>
                  : <><Zap className="w-3.5 h-3.5" /> Run Full Research</>
                }
              </button>
            </div>
          </div>

          {/* Rows */}
          <div className="flex flex-col gap-px p-3">
            {prospects.map((p, idx) => {
              const isActive = idx === currentIdx && isProcessing;
              const score = p.result?.intel?.score;
              return (
                <div key={p.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
                  style={{
                    background: isActive ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isActive ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.05)'}`,
                  }}>
                  <StatusDot status={p.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-white truncate">{p.companyName || p.websiteUrl}</p>
                    {isActive && currentPhase ? (
                      <p className="text-[10px] text-emerald-400/70 truncate">{currentPhase}</p>
                    ) : p.websiteUrl ? (
                      <p className="text-[11px] text-white/25 truncate">{p.websiteUrl}</p>
                    ) : null}
                  </div>
                  {p.status === 'success' && p.result && (
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right hidden sm:block">
                        <p className="text-[11px] text-white/35">{p.result.intel?.industry || '—'}</p>
                        <p className="text-[10px] text-emerald-400/60">{p.result.intel?.topProduct || ''}</p>
                      </div>
                      {score != null && (
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-black shrink-0"
                          style={{ background: `${scoreColor(score)}18`, border: `1px solid ${scoreColor(score)}40`, color: scoreColor(score) }}>
                          {score}
                        </div>
                      )}
                    </div>
                  )}
                  {p.status === 'error' && (
                    <p className="text-[11px] text-red-400 shrink-0 max-w-[200px] truncate">{p.errorMsg}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Export bar */}
      {hasResults && !isProcessing && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="mt-3 flex items-center justify-between px-5 py-4 rounded-2xl"
          style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.18)' }}>
          <div>
            <p className="text-[13px] font-bold text-emerald-400">Research Complete</p>
            <p className="text-[12px] text-white/35 mt-0.5">
              {successCount} / {prospects.length} prospects fully researched · saved to library
            </p>
          </div>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold transition-all active:scale-[0.98]"
            style={{ background: '#10B981', color: '#07070C' }}>
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </motion.div>
      )}
    </div>
  );
};

export default BulkUpload;
