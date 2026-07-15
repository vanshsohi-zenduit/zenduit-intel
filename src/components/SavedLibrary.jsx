import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Trash2, ChevronRight, Search, Download } from 'lucide-react';
import { toCSV, downloadFile } from '../lib/utils.js';

const scoreStyle = s =>
  s >= 8 ? { color: '#027A48', bg: '#ECFDF3',   border: '#A6F4C5'  }
: s >= 5 ? { color: '#B54708', bg: '#FFFAEB',   border: '#FEDF89'  }
:          { color: '#667085', bg: '#F2F4F7', border: '#EAECF0' };

const ProspectRow = ({ entry, onLoad, onDelete, index }) => {
  const score = entry.intel?.score;
  const ss    = scoreStyle(score);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -8 }} transition={{ delay: index * 0.03, duration: 0.15 }}
      className="group flex items-center gap-3 rounded-lg px-4 py-3 transition-colors"
      style={{ background: '#ffffff', border: '1px solid #EAECF0' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = '#D0D5DD'}
      onMouseLeave={e => e.currentTarget.style.borderColor = '#EAECF0'}
    >
      <div className="flex items-center justify-center shrink-0 text-[12px] font-bold"
        style={{ width: '36px', height: '36px', borderRadius: '50%', background: ss.bg, border: `1px solid ${ss.border}`, color: ss.color }}>
        {score ?? '—'}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium truncate" style={{ color: '#101828' }}>{entry.companyName}</p>
        <p className="text-[11px] truncate mt-0.5" style={{ color: '#667085' }}>
          {entry.intel?.industry || 'Fleet Operations'}
          {entry.intel?.topProduct && <span className="ml-2" style={{ color: '#136AB6' }}>{entry.intel.topProduct}</span>}
        </p>
      </div>

      <p className="text-[11px] shrink-0 hidden sm:block" style={{ color: '#98A2B3' }}>
        {new Date(entry.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </p>

      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => onLoad(entry)}
          className="flex items-center justify-center rounded-lg"
          style={{ width: '30px', height: '30px', background: '#E7F2FA', border: '1px solid #C8E0F3', color: '#136AB6' }}>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => onDelete(entry.id)}
          className="flex items-center justify-center rounded-lg"
          style={{ width: '30px', height: '30px', background: '#FEF3F2', border: '1px solid #FECDCA', color: '#B42318' }}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
};

const Stat = ({ label, value, color }) => (
  <div className="card flex flex-col items-center py-5">
    <p className="text-2xl font-bold" style={{ color: color || '#101828' }}>{value}</p>
    <p className="text-[11px] mt-1 uppercase tracking-wider" style={{ color: '#667085' }}>{label}</p>
  </div>
);

const SavedLibrary = ({ library, onLoad, onDelete }) => {
  const [search, setSearch] = useState('');
  const filtered = (library || []).filter(e =>
    !search || (e.companyName + (e.intel?.industry || '')).toLowerCase().includes(search.toLowerCase())
  );

  const exportCSV = () => downloadFile(toCSV((library || []).map(e => ({
    company:        e.companyName,
    industry:       e.intel?.industry    || '',
    fleet_size:     e.intel?.fleetSize   || '',
    top_pain_point: e.intel?.topPainPoint|| '',
    best_product:   e.intel?.topProduct  || '',
    fit_score:      e.intel?.score       || '',
    saved:          new Date(e.savedAt).toLocaleDateString(),
  }))), 'zenduit-prospects.csv', 'text/csv');

  if (!library?.length) return (
    <div className="flex items-center justify-center h-80">
      <div className="text-center">
        <div className="flex items-center justify-center rounded-xl mx-auto mb-4"
          style={{ width: '48px', height: '48px', background: '#F9FAFB', border: '1px solid #EAECF0' }}>
          <BookOpen className="w-5 h-5" style={{ color: '#98A2B3' }} />
        </div>
        <p className="text-[15px] font-semibold mb-1" style={{ color: '#101828' }}>Library is empty</p>
        <p className="text-[13px]" style={{ color: '#667085' }}>Researched prospects are saved here automatically.</p>
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#101828' }}>Saved Library</h1>
          <p className="text-[13px] mt-1" style={{ color: '#667085' }}>{library.length} prospect{library.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={exportCSV}
          className="flex items-center gap-2 rounded-lg text-[13px] font-medium"
          style={{ padding: '0 16px', height: '40px', background: '#F9FAFB', border: '1px solid #EAECF0', color: '#667085', cursor: 'pointer' }}>
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Total"         value={library.length} />
        <Stat label="High-Fit (8+)" color="#027A48" value={library.filter(e => (e.intel?.score || 0) >= 8).length} />
        <Stat label="Avg Score"     color="#136AB6"
          value={library.length ? (library.reduce((s, e) => s + (e.intel?.score || 5), 0) / library.length).toFixed(1) : '—'} />
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#98A2B3' }} />
        <input type="text" placeholder="Search company or industry…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-lg text-[14px]"
          style={{
            height: '44px', paddingLeft: '40px', paddingRight: '14px',
            background: '#ffffff', border: '1px solid #EAECF0',
            color: '#101828', outline: 'none', fontFamily: 'var(--font-sans)',
          }}
          onFocus={e => { e.target.style.borderColor = '#136AB6'; e.target.style.boxShadow = '0 0 0 3px #E7F2FA'; }}
          onBlur={e  => { e.target.style.borderColor = '#EAECF0'; e.target.style.boxShadow = 'none'; }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <AnimatePresence>
          {filtered.length === 0
            ? <p className="text-center py-8 text-[13px]" style={{ color: '#667085' }}>No results.</p>
            : filtered.map((e, i) => <ProspectRow key={e.id} entry={e} index={i} onLoad={onLoad} onDelete={onDelete} />)
          }
        </AnimatePresence>
      </div>
    </div>
  );
};

export default SavedLibrary;
