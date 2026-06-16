import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import Layout from './components/Layout';
import ProspectInput from './components/ProspectInput';
import StrategyDisplay from './components/StrategyDisplay';
import SequenceTimeline from './components/SequenceTimeline';
import OutreachScripts, { ContactCard } from './components/OutreachScripts';
import SavedLibrary from './components/SavedLibrary';
import BulkUpload from './components/BulkUpload';
import ExecutionLog from './components/ExecutionLog';
import LiveCoach from './components/LiveCoach';
import CampaignDashboard from './components/CampaignDashboard';
import Settings from './components/Settings.jsx';
import { runIntelPipeline } from './lib/intelEngine.js';
import { fetchLibrary, saveLibrary, saveLibraryEntry } from './lib/mcpClient.js';
import {
  Target, Users, BarChart3, ArrowRight, RefreshCw,
  ChevronLeft, Brain, Globe, Cpu, Zap, AlertCircle
} from 'lucide-react';

// Max prospects retained in the persisted library. Sized to hold a full bulk
// sheet (e.g. ~200 rows) plus headroom — bulk entries are light (no briefing/scripts).
const MAX_LIBRARY = 500;

// Fields where seed data (e.g. a bulk CSV row) is ground truth — must mirror the
// backend's _CSV_AUTHORITATIVE set in research_node.py.
const CSV_AUTHORITATIVE = new Set([
  'companyName', 'hq', 'fleetSize', 'employeeCount',
  'contactName', 'contactTitle', 'contactPhone', 'contactEmail',
  'contactLinkedIn', 'contactRoleSummary', 'currentFleetPlatform', 'trackableAssets',
]);

const isEmptyVal = (v) =>
  v == null ||
  (typeof v === 'string' && !v.trim()) ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);

// Defensive merge so a full-research run never loses the sheet's authoritative
// facts: CSV-authoritative fields keep the seed value; others let research win and
// the seed only fills gaps research left empty.
const mergeIntel = (seed, fresh) => {
  if (!seed) return fresh || {};
  const out = { ...(fresh || {}) };
  for (const [k, v] of Object.entries(seed)) {
    if (isEmptyVal(v)) continue;
    if (CSV_AUTHORITATIVE.has(k) || isEmptyVal(out[k])) out[k] = v;
  }
  return out;
};

// ─── Research loader ────────────────────────────────────────────────────────────
const PHASE_LABELS = [
  { id: 1, label: 'Website Research',      desc: 'Website · Search · News · Hiring signals'   },
  { id: 2, label: 'LinkedIn Intelligence', desc: 'Contacts · Posts · Personalization hooks'   },
  { id: 3, label: 'Product Intelligence',  desc: 'Brain MCP · Similar accounts · Battlecards' },
  { id: 4, label: 'Strategy Generation',   desc: 'Briefing · Objections · Sequence · Scripts' },
];

const ResearchLoader = ({ phases, activeTool }) => (
  <div className="flex flex-col items-center justify-center min-h-[520px]">
    <div className="text-center max-w-md w-full">
      <div className="relative w-20 h-20 mx-auto mb-8">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(37,99,235,0.18), transparent 70%)',
            filter: 'blur(16px)',
            animation: 'pulse-ring 2.5s ease-in-out infinite',
          }}
        />
        <div
          className="relative w-20 h-20 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.22)' }}
        >
          <Brain className="w-9 h-9 animate-pulse" style={{ color: '#2563eb' }} />
        </div>
        <div className="absolute -inset-3 rounded-full"
          style={{ border: '1px dashed rgba(37,99,235,0.18)', animation: 'spin 10s linear infinite' }} />
      </div>

      <h3 className="text-xl font-bold mb-2" style={{ color: '#0f172a' }}>Gathering Intelligence</h3>
      <p className="text-[13px] mb-7" style={{ color: '#64748b' }}>
        {activeTool ? `Running ${activeTool.replace(/_/g, ' ')}…` : 'Analysing company profile…'}
      </p>

      <div className="flex flex-col gap-2">
        {PHASE_LABELS.map((p) => {
          const s        = phases[p.id] || 'pending';
          const isActive = s === 'start' || s === 'generating';
          const isDone   = s === 'complete';
          const isSkip   = s === 'skip';

          return (
            <div
              key={p.id}
              className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200"
              style={{
                background: isDone   ? 'rgba(37,99,235,0.05)'
                           : isActive ? '#ffffff'
                           :            '#ffffff',
                border: `1px solid ${isDone ? 'rgba(37,99,235,0.20)' : isActive ? 'rgba(37,99,235,0.18)' : '#e2e8f0'}`,
                boxShadow: isActive ? '0 1px 4px rgba(37,99,235,0.08)' : 'none',
              }}
            >
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  background: isDone   ? '#16a34a'
                             : isSkip   ? '#e2e8f0'
                             : isActive ? '#2563eb'
                             :            '#e2e8f0',
                  boxShadow: isActive ? '0 0 8px rgba(37,99,235,0.6)' : isDone ? '0 0 6px rgba(22,163,74,0.4)' : 'none',
                }}
              />
              <div className="flex-1 text-left">
                <p className="text-[13px] font-medium" style={{ color: s === 'pending' || isSkip ? '#94a3b8' : '#0f172a' }}>
                  {p.label}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: '#94a3b8' }}>{p.desc}</p>
              </div>
              {isDone   && <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: '#16a34a' }}>Done</span>}
              {isSkip   && <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: '#94a3b8' }}>Skip</span>}
              {isActive && (
                <div className="flex gap-1 items-center">
                  {[0, 1, 2].map(i => (
                    <motion.div key={i}
                      animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18 }}
                      className="w-1 h-1 rounded-full"
                      style={{ background: '#2563eb' }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {activeTool && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5 flex items-center justify-center gap-2">
          <Globe className="w-3 h-3" style={{ color: 'rgba(37,99,235,0.5)' }} />
          <span className="text-[11px]" style={{ color: '#64748b', fontFamily: 'Inconsolata, monospace' }}>{activeTool}</span>
        </motion.div>
      )}
    </div>
  </div>
);

// ─── Stat card ──────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, icon: Icon, delay }) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
    className="card relative overflow-hidden"
    style={{ padding: '20px' }}
  >
    <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t"
      style={{ background: 'linear-gradient(90deg, transparent, rgba(37,99,235,0.40), transparent)' }} />
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center justify-center rounded-lg"
        style={{ width: '36px', height: '36px', background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.16)' }}>
        <Icon className="w-4 h-4" style={{ color: '#2563eb' }} />
      </div>
      <ArrowRight className="w-3.5 h-3.5" style={{ color: 'rgba(0,0,0,0.12)' }} />
    </div>
    <p className="text-3xl font-bold" style={{ color: '#0f172a' }}>{value}</p>
    <p className="text-[11px] font-medium uppercase tracking-wider mt-1" style={{ color: '#64748b' }}>{label}</p>
  </motion.div>
);

// ─── Context builder ────────────────────────────────────────────────────────────
const buildCoachingContext = (results) => {
  if (!results) return '';
  const intel = results.intel || {};
  const li    = results.linkedinIntel || {};
  return [
    `Company: ${results.companyName || 'Unknown'}`,
    `Industry: ${intel.industry || 'unknown'} | Fleet: ${intel.fleetSize || 'unknown'}`,
    `Pain Points: ${(intel.painPoints || []).slice(0, 3).join(', ')}`,
    `Best Product: ${intel.topProduct || 'ZenduONE'}`,
    `Displacement: ${intel.displacementAngle || ''}`,
    `Contact: ${li.contactName || intel.contactName || ''} (${li.contactTitle || intel.contactTitle || ''})`,
    `Hook: ${(li.personalizationHooks || []).slice(0, 2).join(' | ')}`,
  ].filter(l => !l.endsWith(': ') && !l.endsWith('()') && !l.endsWith('( )') && !l.endsWith('()')).join('\n');
};

// ─── App ────────────────────────────────────────────────────────────────────────
function App() {
  const [activeTab,        setActiveTab]        = useState('intelligence');
  const [isGenerating,     setIsGenerating]     = useState(false);
  const [results,          setResults]          = useState(null);
  const [error,            setError]            = useState(null);
  const [phases,           setPhases]           = useState({});
  const [activeTool,       setActiveTool]       = useState(null);
  const [execLog,          setExecLog]          = useState([]);
  const [streamingBriefing, setStreamingBriefing] = useState('');
  const [coachingContext,  setCoachingContext]  = useState('');
  const execLogStartRef    = useRef(null);

  const [library, setLibrary] = useState(() => {
    try { return JSON.parse(localStorage.getItem('zenduit-library') || '[]'); }
    catch { return []; }
  });
  const libraryMounted = useRef(false);

  useEffect(() => {
    fetchLibrary().then(serverData => {
      if (serverData?.length) {
        setLibrary(serverData);
        localStorage.setItem('zenduit-library', JSON.stringify(serverData));
      }
    });
  }, []);

  useEffect(() => {
    if (!libraryMounted.current) { libraryMounted.current = true; return; }
    const existing = localStorage.getItem('zenduit-library');
    if (library.length === 0 && (!existing || existing === '[]')) return;
    localStorage.setItem('zenduit-library', JSON.stringify(library));
    saveLibrary(library);
  }, [library]);

  const saveToLibrary = (result, assignedRep = null) => {
    if (!result?.companyName) return;
    const entry = {
      id:                 crypto.randomUUID(),
      companyName:        result.companyName,
      websiteUrl:         result.websiteUrl || '',
      linkedinUrl:        '',
      intel:              result.intel,
      linkedinIntel:      result.linkedinIntel || {},
      linkedInContactUrl: result.linkedInContactUrl || '',
      briefing:           result.briefing,
      objections:         result.objections,
      sequence:           result.sequence,
      scripts:            result.scripts,
      variants:           result.variants || [],
      savedAt:            new Date().toISOString(),
      assignedRep:        assignedRep || null,
      source:             'manual',
    };
    // Save via server so it triggers email + ClickUp automations
    saveLibraryEntry(entry).catch(() => {});
    setLibrary(prev => {
      const filtered = prev.filter(e => e.companyName !== result.companyName);
      return [entry, ...filtered].slice(0, MAX_LIBRARY);
    });
  };

  const handleGenerate = async (data) => {
    const { assignedRep, ...pipelineData } = data;
    const seedIntel        = results?.intel || null;
    const seedLinkedInUrl  = results?.linkedInContactUrl || '';
    const seedLinkedinIntel = results?.linkedinIntel || null;

    setIsGenerating(true);
    setError(null);
    setResults(null);
    setStreamingBriefing('');
    setPhases({});
    setActiveTool(null);
    setExecLog([]);
    execLogStartRef.current = Date.now();
    try {
      const result = await runIntelPipeline({ ...pipelineData, seedIntel }, (progress) => {
        if (progress.type === 'phase') setPhases(prev => ({ ...prev, [progress.phase]: progress.status }));
        if (progress.type === 'tool')  setActiveTool(progress.name);
        if (progress.type === 'briefing_chunk') setStreamingBriefing(prev => prev + (progress.chunk || ''));

        setExecLog(prev => {
          const entry = { ts: Date.now(), ...progress };
          if (progress.type === 'briefing_chunk') {
            const last = prev[prev.length - 1];
            if (last?.type === 'briefing_chunk') {
              return [...prev.slice(0, -1), { ...last, accumulated: (last.accumulated || '') + (progress.chunk || '') }];
            }
            return [...prev, { ...entry, accumulated: progress.chunk || '' }];
          }
          return [...prev, entry];
        });
      });
      if (seedIntel) result.intel = mergeIntel(seedIntel, result.intel);
      if (seedLinkedInUrl && !result.linkedInContactUrl) result.linkedInContactUrl = seedLinkedInUrl;
      if (seedLinkedinIntel && !isEmptyVal(seedLinkedinIntel) && isEmptyVal(result.linkedinIntel)) {
        result.linkedinIntel = seedLinkedinIntel;
      }
      setResults(result);
      setCoachingContext(buildCoachingContext(result));
      if (!result.partial) saveToLibrary(result, assignedRep || null);
    } catch (err) {
      setError(err.message || 'Pipeline failed. Ensure backend is running.');
    } finally {
      setIsGenerating(false);
      setActiveTool(null);
    }
  };

  const handleReset  = () => { setResults(null); setError(null); setPhases({}); };
  const handleDelete = (id) => setLibrary(prev => prev.filter(e => e.id !== id));

  const handleBulkResults = (completedResults) => {
    // Bulk returns flat extracted fields — nest them under `intel` so bulk entries
    // integrate with library stats, the intelligence view, and coaching context.
    const newEntries = completedResults
      .filter(r => r.companyName)
      .map(r => ({
        id:                 crypto.randomUUID(),
        companyName:        r.companyName,
        websiteUrl:         r.website || r.websiteUrl || '',
        linkedinUrl:        '',
        intel: {
          companyName:         r.companyName,
          industry:            r.industry,
          hq:                  r.hq,
          fleetSize:           r.fleetSize,
          employeeCount:       r.employeeCount,
          summary:             r.summary || r.reason,
          topPainPoint:        r.topPainPoint,
          topProduct:          r.topProduct,
          painPoints:          r.painPoints || [],
          competitors:         r.competitors || [],
          trackableAssets:     r.trackableAssets || [],
          signals:             r.signals || [],
          displacementAngle:   r.displacementAngle,
          decisionMakerHint:   r.decisionMakerHint,
          contactName:         r.contactName,
          contactTitle:        r.contactTitle,
          contactPhone:        r.contactPhone,
          contactEmail:        r.contactEmail,
          contactRoleSummary:  r.contactRoleSummary,
          currentFleetPlatform: r.currentFleetPlatform,
          score:               r.score,
        },
        linkedinIntel:      {},
        linkedInContactUrl: r.contactLinkedIn || '',
        briefing:           '',
        objections:         '',
        sequence:           [],
        scripts:            [],
        variants:           [],
        savedAt:            new Date().toISOString(),
      }));
    if (!newEntries.length) return;
    setLibrary(prev => {
      const existing = new Set(prev.map(e => e.companyName));
      return [...newEntries.filter(e => !existing.has(e.companyName)), ...prev].slice(0, MAX_LIBRARY);
    });
  };

  // ── Intelligence tab ──────────────────────────────────────────────────────────
  const renderIntelligence = () => {
    if (isGenerating) return (
      <div className="flex flex-col gap-5">
        <ResearchLoader phases={phases} activeTool={activeTool} />
        {streamingBriefing && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="card overflow-hidden"
            style={{ padding: '24px' }}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#2563eb' }} />
              <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#2563eb' }}>
                Generating Briefing…
              </span>
            </div>
            <div
              className="prose prose-sm max-w-none text-[13px] leading-relaxed"
              style={{ color: '#374151' }}
              dangerouslySetInnerHTML={{ __html: streamingBriefing }}
            />
          </motion.div>
        )}
      </div>
    );

    if (error) return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div
          className="text-center max-w-md px-6 py-10 rounded-2xl"
          style={{ background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.16)' }}
        >
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.18)' }}>
            <AlertCircle className="w-7 h-7" style={{ color: '#dc2626' }} />
          </div>
          <h3 className="text-[17px] font-bold mb-2" style={{ color: '#dc2626' }}>Research Failed</h3>
          <p className="text-[13px] mb-5 leading-relaxed" style={{ color: '#64748b' }}>{error}</p>
          <div className="rounded-lg p-4 text-[11px] space-y-1.5 mb-5 text-left"
            style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid #e2e8f0', fontFamily: 'Inconsolata, monospace' }}>
            <p style={{ color: '#94a3b8' }}># Start the backend:</p>
            <p style={{ color: '#374151' }}>uvicorn app.main:app --port 3001 --reload</p>
          </div>
          <button
            onClick={handleReset}
            className="px-5 py-2.5 rounded-xl text-[12px] font-bold transition-colors"
            style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', color: '#374151', cursor: 'pointer' }}
          >
            Try Again
          </button>
        </div>
      </div>
    );

    if (results) return (
      <div className="flex flex-col gap-5">
        {results.partial && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 px-4 py-3 rounded-xl"
            style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.25)' }}
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#b45309' }} />
            <p className="text-[12px] leading-relaxed" style={{ color: '#92400e' }}>
              The pipeline stream ended before completing — showing partial results. Sequences and scripts may be missing. <button onClick={() => handleGenerate({ companyName: results.companyName, websiteUrl: '' })} className="underline font-medium" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e' }}>Rerun to get full output.</button>
            </p>
          </motion.div>
        )}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-[12px] font-medium transition-colors hover:opacity-70"
            style={{ color: '#64748b' }}
          >
            <ChevronLeft className="w-4 h-4" /> New Research
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-full"
              style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.20)', color: '#2563eb' }}
            >
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#2563eb' }} />
              {results.companyName}
            </span>
            <button
              onClick={() => handleGenerate({ companyName: results.companyName, websiteUrl: results.websiteUrl })}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
              style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.07)'; e.currentTarget.style.color = '#0f172a'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = '#64748b'; }}
            >
              <RefreshCw className="w-3 h-3" /> Rerun
            </button>
          </div>
        </div>

        {results.intel && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Industry',   value: results.intel.industry   || '—', icon: Target },
              { label: 'Fleet Size', value: results.intel.fleetSize   || '—', icon: Users  },
              { label: 'Best Fit',   value: results.intel.topProduct  || '—', icon: Zap    },
              { label: 'HQ',         value: results.intel.hq          || '—', icon: Globe  },
            ].map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="card flex items-center gap-3 px-4 py-3.5"
              >
                <div className="flex items-center justify-center rounded-lg shrink-0"
                  style={{ width: '32px', height: '32px', background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.16)' }}>
                  <s.icon className="w-4 h-4" style={{ color: '#2563eb' }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider font-medium" style={{ color: '#64748b' }}>{s.label}</p>
                  <p className="text-[13px] font-medium truncate" style={{ color: '#0f172a' }}>{s.value}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        <ContactCard intel={results.intel} />

        <div className="flex flex-col lg:flex-row gap-5">
          <div className="flex-1 min-w-0">
            {(results.briefing || results.objections) ? (
              <StrategyDisplay briefing={results.briefing} objections={results.objections} />
            ) : (
              <div className="card flex flex-col items-center text-center px-8 py-12" style={{ borderTop: '2px solid #2563eb' }}>
                <div className="flex items-center justify-center rounded-xl mb-4"
                  style={{ width: '48px', height: '48px', background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.18)' }}>
                  <Brain className="w-6 h-6" style={{ color: '#2563eb' }} />
                </div>
                <h3 className="text-[15px] font-semibold mb-1.5" style={{ color: '#0f172a' }}>Prospect data extracted</h3>
                <p className="text-[13px] leading-relaxed mb-5 max-w-sm" style={{ color: '#64748b' }}>
                  Company facts and contact details above are pulled from your data. Run full research to generate the executive briefing, objection playbook, 14-day sequence, and outreach scripts.
                </p>
                <button
                  onClick={() => handleGenerate({ companyName: results.companyName, websiteUrl: results.websiteUrl })}
                  className="inline-flex items-center gap-2 rounded-lg text-[13px] font-medium"
                  style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}
                >
                  <Zap className="w-3.5 h-3.5" /> Run full research
                </button>
              </div>
            )}
          </div>
          {results.sequence?.length > 0 && (
            <div className="lg:w-[360px] xl:w-[400px] shrink-0">
              <div className="lg:sticky lg:top-4">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="flex items-center justify-center rounded-lg"
                    style={{ width: '32px', height: '32px', background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.16)' }}>
                    <Target className="w-4 h-4" style={{ color: '#2563eb' }} />
                  </div>
                  <h3 className="text-[14px] font-semibold" style={{ color: '#0f172a' }}>14-Day Sequence</h3>
                </div>
                <div className="lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto pr-1"
                  style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,0,0,0.12) transparent' }}>
                  <SequenceTimeline sequence={results.sequence} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );

    // Landing state
    return (
      <div className="flex flex-col lg:flex-row gap-5 min-h-[600px]">
        <div className="w-full lg:w-[300px] xl:w-[320px] shrink-0">
          <ProspectInput onGenerate={handleGenerate} />
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label="Avg Fit Score"
              value={library.length ? (library.reduce((s, e) => s + (e.intel?.score || 5), 0) / library.length).toFixed(1) : '—'}
              icon={BarChart3} delay={0.06}
            />
            <StatCard label="Saved Prospects" value={library.length}                                           icon={Target} delay={0.10} />
            <StatCard label="High-Fit (8+)"   value={library.filter(e => (e.intel?.score || 0) >= 8).length}  icon={Users}  delay={0.14} />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.20 }}
            className="flex-1 flex flex-col items-center justify-center relative overflow-hidden rounded-2xl"
            style={{
              minHeight: '260px',
              background: '#ffffff',
              border: '1px dashed #e2e8f0',
            }}
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: 'radial-gradient(circle at 1.5px 1.5px, rgba(0,0,0,0.04) 1px, transparent 0)',
                backgroundSize: '24px 24px',
              }}
            />

            <div className="relative z-10 text-center max-w-[360px] px-8">
              <div className="flex items-center justify-center rounded-xl mx-auto mb-5"
                style={{ width: '56px', height: '56px', background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.18)' }}>
                <Cpu className="w-6 h-6" style={{ color: '#2563eb' }} />
              </div>

              <h3 className="text-[18px] font-bold mb-2" style={{ color: '#0f172a' }}>Intelligence Engine Ready</h3>
              <p className="text-[13px] leading-relaxed mb-6" style={{ color: '#64748b' }}>
                Enter a company name or website to trigger the research pipeline — real-time web search, LinkedIn signals, and Zenduit product matching.
              </p>

              {library.length > 0 ? (
                <button
                  onClick={() => setActiveTab('library')}
                  className="inline-flex items-center gap-2 rounded-lg text-[13px] font-medium"
                  style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}
                >
                  <Users className="w-3.5 h-3.5" />
                  View {library.length} saved prospect{library.length !== 1 ? 's' : ''}
                </button>
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {['Fleet Visibility', 'Driver Safety', 'Fuel Savings', 'ELD Compliance'].map(tag => (
                    <span key={tag} className="text-[11px] px-3 py-1 rounded-full"
                      style={{ background: 'rgba(37,99,235,0.07)', border: '1px solid rgba(37,99,235,0.14)', color: '#2563eb' }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'intelligence': return renderIntelligence();
      case 'outreach':     return <OutreachScripts scripts={results?.scripts} variants={results?.variants} companyName={results?.companyName} intel={results?.intel} linkedInContactUrl={results?.linkedInContactUrl} />;
      case 'campaign':     return <CampaignDashboard />;
      case 'sequence':
        return (
          <div className="w-full max-w-3xl">
            <div className="mb-5">
              <h1 className="text-xl font-bold" style={{ color: '#0f172a' }}>14-Day Sequence</h1>
              <p className="text-[13px] mt-1" style={{ color: '#64748b' }}>
                Outreach timeline for{' '}
                <span className="font-medium" style={{ color: '#2563eb' }}>{results?.companyName}</span>
              </p>
            </div>
            <SequenceTimeline sequence={results?.sequence} />
          </div>
        );
      case 'log':
        return (
          <div className="w-full max-w-3xl">
            <div className="mb-5">
              <h1 className="text-xl font-bold" style={{ color: '#0f172a' }}>Execution Log</h1>
              <p className="text-[13px] mt-1" style={{ color: '#64748b' }}>
                {execLog.length > 0
                  ? `${execLog.length} events recorded${results?.companyName ? ` for ${results.companyName}` : ''}`
                  : 'Run Intel to see live pipeline events'}
              </p>
            </div>
            <ExecutionLog execLog={execLog} runStartTs={execLogStartRef.current} />
          </div>
        );
      case 'coach':
        return (
          <LiveCoach
            prospectContext={coachingContext}
            companyName={results?.companyName || ''}
          />
        );
      case 'library':
        return (
          <SavedLibrary
            library={library}
            onLoad={(entry) => {
              const loaded = {
                companyName:        entry.companyName,
                websiteUrl:         entry.websiteUrl || '',
                intel:              entry.intel,
                linkedinIntel:      entry.linkedinIntel || {},
                linkedInContactUrl: entry.linkedInContactUrl || '',
                briefing:           entry.briefing,
                objections:         entry.objections,
                sequence:           entry.sequence,
                scripts:            entry.scripts,
                variants:           entry.variants || [],
              };
              setResults(loaded);
              setCoachingContext(buildCoachingContext(loaded));
              setActiveTab('intelligence');
            }}
            onDelete={handleDelete}
          />
        );
      case 'bulk':     return <BulkUpload onSaveResults={handleBulkResults} />;
      case 'settings': return <Settings />;
      default:         return null;
    }
  };

  return (
    <Layout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      activeIntel={results?.companyName}
      resultsAvailable={!!results}
      libraryCount={library.length}
    >
      {renderContent()}
    </Layout>
  );
}

export default App;
