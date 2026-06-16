import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, SkipForward, Wrench, Loader2, Terminal, Search, Globe, Database, FileText, ExternalLink } from 'lucide-react';

const ExecutionLog = ({ execLog = [], runStartTs }) => {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [execLog.length]);

  const fmtTs = (ts) => {
    if (!runStartTs) return '';
    const d = Math.max(0, ts - runStartTs);
    const s = Math.floor(d / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `+${m}:${String(s % 60).padStart(2, '0')}` : `+${s}s`;
  };

  if (!execLog.length) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '400px' }}>
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
            style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.16)' }}>
            <Terminal className="w-5 h-5" style={{ color: '#2563eb' }} />
          </div>
          <p className="text-[14px] font-medium" style={{ color: '#0F172A' }}>
            Run Intel to see live execution events
          </p>
          <p className="text-[12px] mt-1" style={{ color: '#64748B' }}>
            Tool calls, phases, and briefing tokens appear here in real time.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5"
      style={{ maxHeight: 'calc(100vh - 180px)', overflowY: 'auto', paddingRight: '4px', scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,0,0,0.1) transparent' }}>

      {execLog.map((entry, i) => {
        if (entry.type === 'briefing_chunk') {
          return (
            <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="rounded-lg p-3 my-2"
              style={{ background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.12)' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#2563eb' }}>
                  Briefing Stream
                </span>
                <span className="text-[10px]" style={{ color: '#94A3B8' }}>{fmtTs(entry.ts)}</span>
              </div>
              <p className="text-[12px] leading-relaxed"
                style={{ color: '#374151', fontFamily: 'Inconsolata, monospace', display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {entry.accumulated || ''}
              </p>
            </motion.div>
          );
        }

        if (entry.type === 'phase') {
          if (entry.status === 'start') {
            return (
              <motion.div key={i} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2.5 mt-4 mb-1 px-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" style={{ color: '#2563eb' }} />
                <span className="text-[13px] font-semibold" style={{ color: '#0F172A' }}>
                  {entry.label || `Phase ${entry.phase}`}
                </span>
                <span className="text-[10px]" style={{ color: '#94A3B8' }}>{fmtTs(entry.ts)}</span>
              </motion.div>
            );
          }
          if (entry.status === 'complete') {
            let duration = null;
            for (let j = i - 1; j >= 0; j--) {
              if (execLog[j].type === 'phase' && execLog[j].phase === entry.phase && execLog[j].status === 'start') {
                duration = Math.round((entry.ts - execLog[j].ts) / 1000);
                break;
              }
            }
            return (
              <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex items-center gap-2.5 px-1 mb-3">
                <CheckCircle className="w-3.5 h-3.5 shrink-0" style={{ color: '#16a34a' }} />
                <span className="text-[12px] font-medium" style={{ color: '#16a34a' }}>
                  {entry.label || `Phase ${entry.phase}`} complete
                </span>
                {duration !== null && (
                  <span className="text-[10px]" style={{ color: '#94A3B8' }}>{duration}s</span>
                )}
              </motion.div>
            );
          }
          if (entry.status === 'skip') {
            return (
              <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex items-center gap-2.5 px-1 mb-1">
                <SkipForward className="w-3.5 h-3.5 shrink-0" style={{ color: '#94A3B8' }} />
                <span className="text-[12px]" style={{ color: '#94A3B8' }}>
                  {entry.label || `Phase ${entry.phase}`} skipped
                </span>
              </motion.div>
            );
          }
          if (entry.status === 'generating') {
            return (
              <div key={i} className="flex items-center gap-2 px-1 py-0.5">
                <motion.div
                  animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: '#2563eb' }}
                />
                <span className="text-[12px]" style={{ color: '#64748B' }}>{entry.label}…</span>
              </div>
            );
          }
          return null;
        }

        // ── Scraped web data: search hits ────────────────────────────────────
        if (entry.type === 'tool_result' && entry.kind === 'search') {
          return (
            <motion.div key={i} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
              className="ml-5 py-2 px-3 rounded-lg mb-1"
              style={{ background: 'rgba(37,99,235,0.03)', border: '1px solid rgba(37,99,235,0.10)' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <Search className="w-3 h-3 shrink-0" style={{ color: '#2563eb' }} />
                <span className="text-[11px] font-semibold" style={{ color: '#2563eb' }}>
                  {entry.count} result{entry.count === 1 ? '' : 's'}
                </span>
                <span className="text-[11px] truncate" style={{ color: '#64748B', fontFamily: 'Inconsolata, monospace' }}>
                  “{entry.query}”
                </span>
                <span className="text-[10px] ml-auto shrink-0" style={{ color: '#94A3B8' }}>{fmtTs(entry.ts)}</span>
              </div>
              <div className="flex flex-col gap-1.5 pl-5">
                {(entry.items || []).map((it, k) => (
                  <div key={k}>
                    <div className="flex items-center gap-1">
                      <ExternalLink className="w-2.5 h-2.5 shrink-0" style={{ color: '#94A3B8' }} />
                      <a href={it.url} target="_blank" rel="noreferrer"
                        className="text-[11px] font-medium truncate hover:underline" style={{ color: '#0F172A' }}>
                        {it.title || it.url}
                      </a>
                    </div>
                    <p className="text-[10px] truncate" style={{ color: '#94A3B8', fontFamily: 'Inconsolata, monospace' }}>{it.url}</p>
                    {it.snippet && (
                      <p className="text-[11px] leading-snug mt-0.5" style={{ color: '#64748B' }}>{it.snippet}</p>
                    )}
                  </div>
                ))}
                {(!entry.items || entry.items.length === 0) && (
                  <p className="text-[11px]" style={{ color: '#94A3B8' }}>No results returned.</p>
                )}
              </div>
            </motion.div>
          );
        }

        // ── Scraped web data: fetched page content ───────────────────────────
        if (entry.type === 'tool_result' && entry.kind === 'fetch') {
          const ok = entry.ok !== false;
          return (
            <motion.div key={i} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
              className="ml-5 py-2 px-3 rounded-lg mb-1"
              style={{ background: ok ? 'rgba(16,163,74,0.03)' : 'rgba(220,38,38,0.03)',
                       border: `1px solid ${ok ? 'rgba(16,163,74,0.12)' : 'rgba(220,38,38,0.14)'}` }}>
              <div className="flex items-center gap-2 mb-1">
                <Globe className="w-3 h-3 shrink-0" style={{ color: ok ? '#16a34a' : '#dc2626' }} />
                <span className="text-[11px] font-medium truncate" style={{ color: '#0F172A', fontFamily: 'Inconsolata, monospace' }}>
                  {entry.url}
                </span>
                <span className="text-[10px] ml-auto shrink-0" style={{ color: '#94A3B8' }}>
                  {ok ? `${entry.chars.toLocaleString()} chars` : 'failed'} · {fmtTs(entry.ts)}
                </span>
              </div>
              {entry.preview && (
                <p className="text-[11px] leading-snug pl-5"
                  style={{ color: '#64748B', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {entry.preview}
                </p>
              )}
            </motion.div>
          );
        }

        // ── Research synthesis summary (provenance of the intel) ──────────────
        if (entry.type === 'research_summary') {
          const prov = entry.fieldProvenance || [];
          const srcColor = { research: '#2563eb', sheet: '#16a34a', 'sheet+research': '#d97706' };
          return (
            <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="rounded-lg p-3 my-2"
              style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.08)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-3.5 h-3.5 shrink-0" style={{ color: '#0F172A' }} />
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#0F172A' }}>
                  Research synthesized
                </span>
                <span className="text-[10px]" style={{ color: '#94A3B8' }}>{fmtTs(entry.ts)}</span>
              </div>
              <p className="text-[11px] mb-2" style={{ color: '#64748B' }}>
                {(entry.searches?.length || 0)} searches · {(entry.sources?.length || 0)} page{entry.sources?.length === 1 ? '' : 's'} scraped → {prov.length} fields populated
              </p>
              {entry.sources?.length > 0 && (
                <div className="mb-2 pl-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#94A3B8' }}>Sources scraped</p>
                  <div className="flex flex-col gap-0.5">
                    {entry.sources.map((s, k) => (
                      <a key={k} href={s} target="_blank" rel="noreferrer"
                        className="text-[11px] truncate hover:underline" style={{ color: '#2563eb', fontFamily: 'Inconsolata, monospace' }}>{s}</a>
                    ))}
                  </div>
                </div>
              )}
              {prov.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {prov.map((f, k) => (
                    <span key={k} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#374151' }}>
                      {f.field}
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: srcColor[f.source] || '#94A3B8' }} />
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3 mt-2 text-[10px]" style={{ color: '#94A3B8' }}>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#2563eb' }} />web research</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#16a34a' }} />sheet</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#d97706' }} />sheet+research</span>
              </div>
            </motion.div>
          );
        }

        // ── Data fed into report generation ──────────────────────────────────
        if (entry.type === 'generation_input') {
          return (
            <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="rounded-lg p-3 my-2"
              style={{ background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.14)' }}>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: '#2563eb' }} />
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#2563eb' }}>
                  Report built from this data
                </span>
                <span className="text-[10px]" style={{ color: '#94A3B8' }}>{fmtTs(entry.ts)}</span>
              </div>
              <p className="text-[11px] mb-2" style={{ color: '#64748B' }}>
                {(entry.intelFields?.length || 0)} intel fields · {(entry.productContextChars || 0).toLocaleString()} chars product context
                {entry.linkedinContact ? ` · contact: ${entry.linkedinContact}` : ''}
              </p>
              {entry.companyContext && (
                <pre className="text-[11px] leading-snug whitespace-pre-wrap p-2 rounded"
                  style={{ color: '#374151', background: '#fff', border: '1px solid #e2e8f0', fontFamily: 'Inconsolata, monospace',
                           maxHeight: '180px', overflowY: 'auto' }}>
                  {entry.companyContext}
                </pre>
              )}
            </motion.div>
          );
        }

        if (entry.type === 'tool') {
          const inputStr = entry.input
            ? Object.entries(entry.input)
                .map(([k, v]) => `${k}: ${String(v).slice(0, 70)}`)
                .join(' · ')
            : '';
          return (
            <motion.div key={i} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
              className="flex items-start gap-2.5 ml-5 py-1.5 px-3 rounded-lg"
              style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.06)' }}>
              <Wrench className="w-3 h-3 mt-0.5 shrink-0" style={{ color: '#64748B' }} />
              <div className="min-w-0 flex-1">
                <span className="text-[12px] font-medium" style={{ color: '#0F172A', fontFamily: 'Inconsolata, monospace' }}>
                  {entry.name}
                </span>
                {inputStr && (
                  <p className="text-[11px] mt-0.5 truncate" style={{ color: '#94A3B8', fontFamily: 'Inconsolata, monospace' }}>
                    {inputStr}
                  </p>
                )}
              </div>
              <span className="text-[10px] shrink-0" style={{ color: '#94A3B8' }}>{fmtTs(entry.ts)}</span>
            </motion.div>
          );
        }

        return null;
      })}

      <div ref={endRef} />
    </div>
  );
};

export default ExecutionLog;
