import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Loader2 } from 'lucide-react';
import { fetchLeaderboard } from '../lib/mcpClient.js';

const PERIODS = [
  { id: 'weekly',  label: 'Weekly',   api: 'weekly'  },
  { id: 'monthly', label: 'Monthly',  api: 'monthly' },
  { id: 'all',     label: 'All-time', api: 'all'     },
];
const PERIOD_LABEL = { weekly: 'This week', monthly: 'This month', all: 'All time' };

// The backend keys rows by rep email — derive a readable name + initials from it.
const displayName = (rep = '') => {
  const local = rep.split('@')[0].replace(/[._-]+/g, ' ').trim();
  if (!local) return rep;
  return local.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};
const initials = (name) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

const rankStyle = (i) => (
  i === 0 ? { bg: '#FFFAEB', fg: '#B54708' }
: i === 1 ? { bg: '#F2F4F7', fg: '#475467' }
: i === 2 ? { bg: '#FFF3EA', fg: '#B5540E' }
:           { bg: '#F9FAFB', fg: '#98A2B3' }
);

const Leaderboard = () => {
  const [period,  setPeriod]  = useState('weekly');
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetchLeaderboard(period)
      .then(data => { if (live) setRows(Array.isArray(data) ? data : []); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [period]);

  const max = rows.reduce((m, r) => Math.max(m, r.calls || 0), 0) || 1;

  return (
    <div className="w-full max-w-[640px] mx-auto">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-[16px] font-semibold" style={{ color: '#101828' }}>Rep leaderboard</h1>
          <p className="text-[13px] mt-1" style={{ color: '#667085' }}>
            Ranked by call volume · {PERIOD_LABEL[period]}
          </p>
        </div>
        <div className="flex gap-1.5">
          {PERIODS.map(p => {
            const active = period === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className="text-[14px] font-semibold rounded-lg"
                style={{
                  height: '36px', padding: '0 16px', cursor: 'pointer',
                  border: `1px solid ${active ? '#136AB6' : '#D0D5DD'}`,
                  background: active ? '#136AB6' : '#fff',
                  color: active ? '#fff' : '#344054',
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #EAECF0', borderRadius: '12px', padding: '8px' }}>
        {loading ? (
          <div className="flex items-center justify-center py-16" style={{ color: '#98A2B3' }}>
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center gap-2.5 py-16 px-6">
            <div className="flex items-center justify-center rounded-xl mb-1"
              style={{ width: '48px', height: '48px', background: '#F2F4F7' }}>
              <BarChart3 className="w-5 h-5" style={{ color: '#98A2B3' }} />
            </div>
            <p className="text-[15px] font-semibold" style={{ color: '#475467' }}>No calls logged yet</p>
            <p className="text-[13px] max-w-xs" style={{ color: '#667085' }}>
              Rep call counts accrue as ClickUp lead tasks are completed. Check back once outreach is underway.
            </p>
          </div>
        ) : (
          rows.map((r, i) => {
            const name = displayName(r.rep);
            const rs = rankStyle(i);
            return (
              <motion.div
                key={r.rep}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="flex items-center gap-3.5 px-3.5 py-3"
                style={{ borderBottom: i < rows.length - 1 ? '1px solid #F2F4F7' : 'none' }}
              >
                <div className="flex items-center justify-center rounded-full shrink-0 text-[13px] font-bold"
                  style={{ width: '28px', height: '28px', background: rs.bg, color: rs.fg }}>
                  {r.rank ?? i + 1}
                </div>
                <div className="flex items-center justify-center rounded-full shrink-0 text-[12px] font-semibold"
                  style={{ width: '34px', height: '34px', background: '#E7F2FA', color: '#0F5795' }}>
                  {initials(name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold mb-1 truncate" style={{ color: '#101828' }}>{name}</div>
                  <div className="rounded-full" style={{ background: '#EAECF0', height: '10px' }}>
                    <div className="rounded-full" style={{ width: `${Math.round((r.calls / max) * 100)}%`, height: '10px', background: i === 0 ? '#136AB6' : '#99C5E8' }} />
                  </div>
                </div>
                <div className="text-[16px] font-bold text-right shrink-0" style={{ color: '#101828', width: '56px' }}>{r.calls}</div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Leaderboard;
