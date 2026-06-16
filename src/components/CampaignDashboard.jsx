import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3, Send, MessageSquare, CalendarCheck, XCircle, Trash2,
  Sparkles, Loader2, Plus, FlaskConical, RefreshCw,
} from 'lucide-react';
import {
  fetchOutcomes, fetchOutcomeStats, saveOutcome, deleteOutcome, classifyReply,
} from '../lib/mcpClient.js';

const STATUSES = ['SENT', 'NO_RESPONSE', 'BOOKED', 'FUTURE', 'UNKNOWN', 'REJECTED'];
const CHANNELS = ['Email', 'LinkedIn', 'Call', 'Message'];

const STATUS_STYLE = {
  SENT:        { bg: '#f1f5f9', fg: '#475569', label: 'Sent' },
  NO_RESPONSE: { bg: '#f1f5f9', fg: '#94a3b8', label: 'No response' },
  BOOKED:      { bg: 'rgba(16,185,129,0.10)', fg: '#059669', label: 'Booked' },
  FUTURE:      { bg: 'rgba(37,99,235,0.10)',  fg: '#2563eb', label: 'Future' },
  UNKNOWN:     { bg: 'rgba(217,119,6,0.10)',  fg: '#d97706', label: 'Unknown' },
  REJECTED:    { bg: 'rgba(220,38,38,0.08)',  fg: '#dc2626', label: 'Rejected' },
};

const StatusPill = ({ status }) => {
  const s = STATUS_STYLE[status] || STATUS_STYLE.SENT;
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: s.bg, color: s.fg }}>{s.label}</span>
  );
};

const StatCard = ({ label, value, sub, icon: Icon, accent, delay }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
    className="card" style={{ padding: '18px' }}>
    <div className="flex items-center justify-between mb-2.5">
      <div className="flex items-center justify-center rounded-lg"
        style={{ width: '34px', height: '34px', background: `${accent}14`, border: `1px solid ${accent}28` }}>
        <Icon className="w-4 h-4" style={{ color: accent }} />
      </div>
    </div>
    <p className="text-2xl font-bold" style={{ color: '#0f172a' }}>{value}</p>
    <p className="text-[11px] font-medium uppercase tracking-wider mt-1" style={{ color: '#64748b' }}>{label}</p>
    {sub && <p className="text-[11px] mt-1" style={{ color: '#94a3b8' }}>{sub}</p>}
  </motion.div>
);

// ── Reply classifier panel ────────────────────────────────────────────────────
const ReplyClassifier = ({ onLogged }) => {
  const [reply, setReply]     = useState('');
  const [company, setCompany] = useState('');
  const [busy, setBusy]       = useState(false);
  const [result, setResult]   = useState(null);
  const [logged, setLogged]   = useState(false);
  const [error, setError]     = useState('');

  const run = async () => {
    if (!reply.trim()) return;
    setBusy(true); setError(''); setResult(null); setLogged(false);
    try {
      const r = await classifyReply({ reply, companyName: company });
      setResult(r);
    } catch {
      setError('Classification failed. Is the backend running?');
    } finally {
      setBusy(false);
    }
  };

  const log = async () => {
    if (!result) return;
    try {
      await saveOutcome({
        company: company.trim() || 'Unknown',
        channel: 'Email',
        status: result.status,
        reason: result.reason || '',
      });
      setLogged(true);
      onLogged?.();
    } catch {
      setError('Failed to log outcome.');
    }
  };

  return (
    <div className="card" style={{ padding: '20px' }}>
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4" style={{ color: '#2563eb' }} />
        <h3 className="text-[14px] font-semibold" style={{ color: '#0f172a' }}>Reply Classifier</h3>
        <span className="text-[11px]" style={{ color: '#64748b' }}>· intent + objection + next step</span>
      </div>

      <input
        value={company} onChange={e => setCompany(e.target.value)}
        placeholder="Prospect company (optional)"
        className="w-full mb-2.5 px-3 py-2 rounded-lg text-[13px]"
        style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#0f172a' }}
      />
      <textarea
        value={reply} onChange={e => setReply(e.target.value)} rows={4}
        placeholder="Paste the prospect's reply here…"
        className="w-full px-3 py-2 rounded-lg text-[13px] resize-y"
        style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#0f172a' }}
      />
      <div className="flex items-center justify-end mt-3">
        <button onClick={run} disabled={busy || !reply.trim()}
          className="flex items-center gap-1.5 rounded-lg text-[12px] font-medium"
          style={{ height: '36px', padding: '0 16px', background: '#2563eb', color: '#fff', border: 'none',
                   cursor: busy || !reply.trim() ? 'not-allowed' : 'pointer', opacity: busy || !reply.trim() ? 0.5 : 1 }}>
          {busy ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analysing…</> : <><Sparkles className="w-3.5 h-3.5" /> Classify</>}
        </button>
      </div>

      {error && <p className="mt-3 text-[12px]" style={{ color: '#dc2626' }}>{error}</p>}

      {result && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="mt-4 rounded-lg p-4" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div className="flex items-center gap-2 mb-2">
            <StatusPill status={result.status} />
          </div>
          {result.reason && (
            <p className="text-[12px] mb-1.5" style={{ color: '#374151' }}>
              <span className="font-medium" style={{ color: '#64748b' }}>Reason: </span>{result.reason}
            </p>
          )}
          {result.suggestedNextStep && (
            <p className="text-[12px]" style={{ color: '#374151' }}>
              <span className="font-medium" style={{ color: '#64748b' }}>Next step: </span>{result.suggestedNextStep}
            </p>
          )}
          <div className="mt-3 flex items-center justify-end">
            <button onClick={log} disabled={logged}
              className="flex items-center gap-1.5 rounded-lg text-[11.5px] font-medium"
              style={{ height: '32px', padding: '0 12px',
                       ...(logged
                         ? { background: 'rgba(16,185,129,0.10)', color: '#059669', border: '1px solid rgba(16,185,129,0.22)' }
                         : { background: 'rgba(37,99,235,0.08)', color: '#2563eb', border: '1px solid rgba(37,99,235,0.20)', cursor: 'pointer' }) }}>
              {logged ? <>Logged ✓</> : <><Plus className="w-3.5 h-3.5" /> Log as outcome</>}
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
};

// ── Manual outcome logger ─────────────────────────────────────────────────────
const OutcomeLogger = ({ onSaved }) => {
  const [form, setForm] = useState({ company: '', channel: 'Email', variant: '', status: 'SENT', reason: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.company.trim()) return;
    setBusy(true);
    try {
      await saveOutcome(form);
      setForm({ company: '', channel: 'Email', variant: '', status: 'SENT', reason: '', notes: '' });
      onSaved?.();
    } catch { /* surfaced via parent refresh */ }
    finally { setBusy(false); }
  };

  const inputStyle = { background: '#fff', border: '1px solid #e2e8f0', color: '#0f172a' };

  return (
    <div className="card" style={{ padding: '20px' }}>
      <div className="flex items-center gap-2 mb-4">
        <Plus className="w-4 h-4" style={{ color: '#2563eb' }} />
        <h3 className="text-[14px] font-semibold" style={{ color: '#0f172a' }}>Log an Outcome</h3>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <input value={form.company} onChange={e => set('company', e.target.value)} placeholder="Company *"
          className="col-span-2 px-3 py-2 rounded-lg text-[13px]" style={inputStyle} />
        <select value={form.channel} onChange={e => set('channel', e.target.value)}
          className="px-3 py-2 rounded-lg text-[13px]" style={inputStyle}>
          {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={form.status} onChange={e => set('status', e.target.value)}
          className="px-3 py-2 rounded-lg text-[13px]" style={inputStyle}>
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_STYLE[s].label}</option>)}
        </select>
        <input value={form.variant} onChange={e => set('variant', e.target.value)} placeholder="Variant (A/B/C)"
          className="px-3 py-2 rounded-lg text-[13px]" style={inputStyle} />
        <input value={form.reason} onChange={e => set('reason', e.target.value)} placeholder="Reason / objection"
          className="px-3 py-2 rounded-lg text-[13px]" style={inputStyle} />
        <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Notes (optional)"
          className="col-span-2 px-3 py-2 rounded-lg text-[13px]" style={inputStyle} />
      </div>
      <div className="flex items-center justify-end mt-3">
        <button onClick={submit} disabled={busy || !form.company.trim()}
          className="flex items-center gap-1.5 rounded-lg text-[12px] font-medium"
          style={{ height: '36px', padding: '0 16px', background: '#2563eb', color: '#fff', border: 'none',
                   cursor: busy || !form.company.trim() ? 'not-allowed' : 'pointer', opacity: busy || !form.company.trim() ? 0.5 : 1 }}>
          <Plus className="w-3.5 h-3.5" /> Add outcome
        </button>
      </div>
    </div>
  );
};

// ── Per-variant A/B performance ───────────────────────────────────────────────
const VariantPerformance = ({ variants }) => {
  // The "—" bucket is un-tagged manual logs, not a real variant — keep it out of A/B.
  variants = (variants || []).filter(v => v.variant && v.variant !== '—');
  if (!variants.length) return null;
  return (
    <div className="card" style={{ padding: '20px' }}>
      <div className="flex items-center gap-2 mb-4">
        <FlaskConical className="w-4 h-4" style={{ color: '#2563eb' }} />
        <h3 className="text-[14px] font-semibold" style={{ color: '#0f172a' }}>A/B Variant Performance</h3>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-12 px-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>
          <span className="col-span-3">Variant</span>
          <span className="col-span-2 text-right">Sent</span>
          <span className="col-span-2 text-right">Replied</span>
          <span className="col-span-2 text-right">Booked</span>
          <span className="col-span-3 text-right">Book rate</span>
        </div>
        {variants.map((v, i) => (
          <div key={i} className="grid grid-cols-12 items-center px-2 py-2 rounded-lg text-[12px]"
            style={{ background: i === 0 && v.booked > 0 ? 'rgba(16,185,129,0.05)' : '#f8fafc', color: '#374151' }}>
            <span className="col-span-3 font-medium" style={{ color: '#0f172a' }}>{v.variant}</span>
            <span className="col-span-2 text-right">{v.total}</span>
            <span className="col-span-2 text-right">{v.replied} ({v.replyRate}%)</span>
            <span className="col-span-2 text-right">{v.booked}</span>
            <span className="col-span-3 text-right font-semibold" style={{ color: v.bookRate > 0 ? '#059669' : '#94a3b8' }}>{v.bookRate}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Daily activity (consumes stats.byDay) ─────────────────────────────────────
const DailyActivity = ({ days }) => {
  const rows = (days || []).slice(-10);
  if (!rows.length) return null;
  const max = Math.max(...rows.map(d => d.total), 1);
  return (
    <div className="card" style={{ padding: '20px' }}>
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4" style={{ color: '#2563eb' }} />
        <h3 className="text-[14px] font-semibold" style={{ color: '#0f172a' }}>Activity by Day</h3>
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map((d, i) => (
          <div key={i} className="flex items-center gap-3 text-[12px]">
            <span className="w-20 shrink-0" style={{ color: '#64748b' }}>{d.date}</span>
            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#f1f5f9' }}>
              <div className="h-full rounded-full" style={{ width: `${(d.total / max) * 100}%`, background: 'rgba(37,99,235,0.45)' }} />
            </div>
            <span className="w-28 text-right shrink-0" style={{ color: '#94a3b8' }}>
              {d.total} sent · {d.booked} booked
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
const CampaignDashboard = () => {
  const [stats, setStats]       = useState(null);
  const [outcomes, setOutcomes] = useState([]);
  const [loading, setLoading]   = useState(true);

  const refresh = useCallback(async () => {
    const [s, o] = await Promise.all([fetchOutcomeStats(), fetchOutcomes()]);
    setStats(s); setOutcomes(o); setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const remove = async (id) => {
    setOutcomes(prev => prev.filter(o => o.id !== id));
    try { await deleteOutcome(id); } catch { /* refetch will reconcile */ }
    refresh();
  };

  const quickStatus = async (o, status) => {
    setOutcomes(prev => prev.map(x => x.id === o.id ? { ...x, status } : x));
    try { await saveOutcome({ id: o.id, status }); } catch { /* refetch reconciles */ }
    refresh();
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#0f172a' }}>Campaign Tracker</h1>
          <p className="text-[13px] mt-1" style={{ color: '#64748b' }}>
            Closed-loop outcomes — log what happened, measure what converts.
          </p>
        </div>
        <button onClick={refresh} className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg"
          style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer' }}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Outreach Sent" value={stats?.total ?? 0} icon={Send} accent="#2563eb" delay={0.04} />
        <StatCard label="Replied" value={stats?.replied ?? 0} sub={`${stats?.replyRate ?? 0}% reply rate`} icon={MessageSquare} accent="#d97706" delay={0.08} />
        <StatCard label="Booked" value={stats?.booked ?? 0} sub={`${stats?.bookRate ?? 0}% book rate`} icon={CalendarCheck} accent="#059669" delay={0.12} />
        <StatCard label="Rejected" value={stats?.rejected ?? 0} icon={XCircle} accent="#dc2626" delay={0.16} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <ReplyClassifier onLogged={refresh} />
        <OutcomeLogger onSaved={refresh} />
      </div>

      {(stats?.byVariant?.length > 0 || stats?.byDay?.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          <VariantPerformance variants={stats.byVariant} />
          <DailyActivity days={stats.byDay} />
        </div>
      )}

      {/* Recent outcomes */}
      <div className="card" style={{ padding: '20px' }}>
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4" style={{ color: '#2563eb' }} />
          <h3 className="text-[14px] font-semibold" style={{ color: '#0f172a' }}>Recent Outcomes</h3>
          <span className="text-[11px]" style={{ color: '#64748b' }}>{outcomes.length} logged</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10" style={{ color: '#94a3b8' }}>
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : outcomes.length === 0 ? (
          <p className="text-[13px] py-6 text-center" style={{ color: '#94a3b8' }}>
            No outcomes yet. Classify a reply or log one manually to start tracking.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {outcomes.map(o => (
              <div key={o.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-medium truncate" style={{ color: '#0f172a' }}>{o.company}</span>
                    <span className="text-[11px]" style={{ color: '#64748b' }}>· {o.channel}</span>
                    {o.variant && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(37,99,235,0.08)', color: '#2563eb' }}>{o.variant}</span>
                    )}
                  </div>
                  {o.reason && <p className="text-[11px] truncate mt-0.5" style={{ color: '#94a3b8' }}>{o.reason}</p>}
                </div>
                <select value={o.status} onChange={e => quickStatus(o, e.target.value)}
                  className="text-[11px] px-2 py-1 rounded-md shrink-0"
                  style={{ background: '#fff', border: '1px solid #e2e8f0', color: STATUS_STYLE[o.status]?.fg || '#475569' }}>
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_STYLE[s].label}</option>)}
                </select>
                <button onClick={() => remove(o.id)} className="shrink-0 p-1.5 rounded-md transition-colors"
                  style={{ color: '#94a3b8', cursor: 'pointer' }}
                  title="Delete outcome">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CampaignDashboard;
