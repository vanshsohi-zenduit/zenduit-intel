import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Trash2, ChevronRight, Search, Download } from 'lucide-react';
import { truncate, toCSV, downloadFile } from '../lib/utils.js';

const scoreStyle = s => s >= 8
  ? { color: '#10B981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.25)' }
  : s >= 5
  ? { color: '#FBBF24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.25)' }
  : { color: '#6B7280', bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.2)'  };

const ProspectRow = ({ entry, onLoad, onDelete, index }) => {
  const score = entry.intel?.score;
  const ss    = scoreStyle(score);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }} transition={{ delay: index * 0.04 }}
      className="group flex items-center gap-3 transition-all duration-150"
      style={{ padding: '14px 16px', borderRadius: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.045)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)';  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
    >
      {/* Score badge — 36px circle */}
      <div className="flex items-center justify-center text-xs font-black shrink-0"
        style={{ width: '36px', height: '36px', borderRadius: '50%', background: ss.bg, border: `1px solid ${ss.border}`, color: ss.color }}>
        {score ?? '—'}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold truncate" style={{ color: '#F0F0F5' }}>{entry.companyName}</p>
        <p className="text-[11px] truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {entry.intel?.industry || 'Fleet Operations'}
          {entry.intel?.topProduct && <span className="ml-1.5 text-emerald-400/60">· {entry.intel.topProduct}</span>}
        </p>
      </div>

      {/* Date */}
      <p className="text-[10px] shrink-0 hidden sm:block" style={{ color: 'rgba(255,255,255,0.25)' }}>
        {new Date(entry.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </p>

      {/* Actions — fade in on hover */}
      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => onLoad(entry)} title="Load"
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
          style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.20)', color: '#10B981' }}>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => onDelete(entry.id)} title="Delete"
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
};

const StatPill = ({ label, value, color }) => (
  <div className="flex flex-col items-center"
    style={{ padding: '20px 16px', borderRadius: '16px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
    <p className="text-2xl font-black" style={{ color: color || '#F0F0F5' }}>{value}</p>
    <p className="text-[10px] font-medium mt-1.5 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.30)' }}>{label}</p>
  </div>
);

const SavedLibrary = ({ library, onLoad, onDelete }) => {
  const [search, setSearch] = useState('');

  const filtered = (library || []).filter(e =>
    !search || (e.companyName + (e.intel?.industry || '')).toLowerCase().includes(search.toLowerCase())
  );

  const exportCSV = () => {
    downloadFile(toCSV((library || []).map(e => ({
      company: e.companyName,
      industry: e.intel?.industry || '',
      fleet_size: e.intel?.fleetSize || '',
      top_pain_point: e.intel?.topPainPoint || '',
      best_product: e.intel?.topProduct || '',
      fit_score: e.intel?.score || '',
      saved: new Date(e.savedAt).toLocaleDateString(),
    }))), 'zenduit-prospects.csv', 'text/csv');
  };

  if (!library?.length) return (
    <div className="flex items-center justify-center h-96">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <BookOpen className="w-6 h-6" style={{ color: 'rgba(255,255,255,0.20)' }} />
        </div>
        <p className="text-[15px] font-bold mb-1" style={{ color: '#F0F0F5' }}>Library is empty</p>
        <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Researched prospects are saved here automatically.</p>
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#F0F0F5' }}>Saved Library</h1>
          <p className="text-[13px] mt-0.5" style={{ color: 'rgba(255,255,255,0.40)' }}>{library.length} prospect{library.length !== 1 ? 's' : ''}</p>
        </div>
        {/* Secondary button style */}
        <button onClick={exportCSV}
          className="flex items-center gap-1.5 transition-colors"
          style={{ padding: '0 14px', height: '40px', borderRadius: '12px', fontSize: '13px', fontWeight: 600, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.65)' }}>
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <StatPill label="Total"    value={library.length} />
        <StatPill label="High-Fit (8+)" value={library.filter(e => (e.intel?.score||0) >= 8).length} color="#10B981" />
        <StatPill label="Avg Score" color="#FBBF24"
          value={library.length ? (library.reduce((s,e) => s+(e.intel?.score||5),0)/library.length).toFixed(1) : '—'} />
      </div>

      {/* Search — 44px input style */}
      <div className="relative mb-3">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'rgba(255,255,255,0.25)' }} />
        <input type="text" placeholder="Search company or industry…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%',
            height: '44px',
            paddingLeft: '40px',
            paddingRight: '14px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: '12px',
            fontSize: '14px',
            color: '#F0F0F5',
            outline: 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
          onFocus={e => { e.target.style.borderColor = 'rgba(16,185,129,0.6)'; e.target.style.boxShadow = '0 0 0 3px rgba(16,185,129,0.12)'; }}
          onBlur={e  => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.boxShadow = 'none'; }}
        />
      </div>

      {/* List */}
      <div className="flex flex-col gap-1.5">
        <AnimatePresence>
          {filtered.length === 0
            ? <p className="text-center text-sm py-8" style={{ color: 'rgba(255,255,255,0.30)' }}>No results.</p>
            : filtered.map((e, i) =>
                <ProspectRow key={e.id} entry={e} index={i} onLoad={onLoad} onDelete={onDelete} />
              )
          }
        </AnimatePresence>
      </div>
    </div>
  );
};

export default SavedLibrary;
