import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import DOMPurify from 'dompurify';
import Layout from './components/Layout';
import ProspectInput from './components/ProspectInput';
import StrategyDisplay from './components/StrategyDisplay';
import SequenceTimeline from './components/SequenceTimeline';
import OutreachScripts, { ContactCard } from './components/OutreachScripts';
import SavedLibrary from './components/SavedLibrary';
import BulkUpload from './components/BulkUpload';
import ExecutionLog from './components/ExecutionLog';
import CampaignDashboard from './components/CampaignDashboard';
import Leaderboard from './components/Leaderboard';
import Settings from './components/Settings.jsx';
import { runIntelPipeline } from './lib/intelEngine.js';
import { fetchLibrary, saveLibrary, saveLibraryEntry } from './lib/mcpClient.js';
import {
  Target, Users, BarChart3, ArrowRight, RefreshCw,
  ChevronLeft, Brain, Globe, Cpu, Zap, AlertCircle, CheckCircle
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
  <div
    className="w-full"
    style={{ background: '#fff', border: '1px solid #EAECF0', borderRadius: '12px', padding: '22px' }}
  >
    <div className="flex items-center gap-2 mb-1">
      <Brain className="w-4 h-4 animate-pulse" style={{ color: '#136AB6' }} />
      <span className="text-[15px] font-semibold" style={{ color: '#101828' }}>Gathering intelligence</span>
    </div>
    <p className="text-[13px] mb-5" style={{ color: '#667085' }}>
      {activeTool ? `Running ${activeTool.replace(/_/g, ' ')}…` : 'This usually takes 2–3 minutes. You can switch tabs — results will be waiting.'}
    </p>

    <div className="flex flex-col gap-4">
      {PHASE_LABELS.map((p) => {
        const s        = phases[p.id] || 'pending';
        const isActive = s === 'start' || s === 'generating';
        const isDone   = s === 'complete';
        const isSkip   = s === 'skip';

        return (
          <div key={p.id} className="flex items-center gap-3">
            <div
              className="shrink-0 flex items-center justify-center rounded-full"
              style={{
                width: '20px', height: '20px',
                background: isDone ? '#12B76A' : isActive ? '#136AB6' : '#F2F4F7',
                color: '#fff',
                animation: isActive ? 'pulse 1.1s ease-in-out infinite' : 'none',
              }}
            >
              {isDone && <CheckCircle className="w-3 h-3" strokeWidth={3} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px]" style={{ fontWeight: (s === 'pending' || isSkip) ? 500 : 600, color: (s === 'pending' || isSkip) ? '#98A2B3' : '#101828' }}>
                {p.label}
              </p>
              <p className="text-[12px]" style={{ color: '#98A2B3' }}>{p.desc}</p>
            </div>
            {isDone && <span className="text-[11px] font-semibold" style={{ color: '#027A48' }}>Done</span>}
            {isSkip && <span className="text-[11px] font-semibold" style={{ color: '#98A2B3' }}>Skipped</span>}
          </div>
        );
      })}
    </div>

    {activeTool && (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5 flex items-center gap-2">
        <Globe className="w-3 h-3" style={{ color: '#99C5E8' }} />
        <span className="text-[11px]" style={{ color: '#667085', fontFamily: 'var(--font-mono)' }}>{activeTool}</span>
      </motion.div>
    )}
  </div>
);

// ─── Stat card ──────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, icon: Icon, delay }) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
    style={{ background: '#fff', border: '1px solid #EAECF0', borderRadius: '10px', padding: '16px' }}
  >
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center justify-center rounded-lg"
        style={{ width: '36px', height: '36px', background: '#E7F2FA' }}>
        <Icon className="w-4 h-4" style={{ color: '#136AB6' }} />
      </div>
      <ArrowRight className="w-3.5 h-3.5" style={{ color: '#D0D5DD' }} />
    </div>
    <p className="text-[26px] font-semibold" style={{ color: '#101828' }}>{value}</p>
    <p className="text-[12px] font-medium mt-1" style={{ color: '#475467' }}>{label}</p>
  </motion.div>
);

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
    // integrate with library stats and the intelligence view.
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
      <div className="flex flex-col gap-4">
        <ResearchLoader phases={phases} activeTool={activeTool} />
        {streamingBriefing && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            style={{ background: '#fff', border: '1px solid #EAECF0', borderRadius: '12px', padding: '22px' }}
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#136AB6', animation: 'pulse 1.1s ease-in-out infinite' }} />
              <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#136AB6' }}>
                Generating briefing…
              </span>
            </div>
            <div
              className="markdown-content max-w-none"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(streamingBriefing) }}
            />
          </motion.div>
        )}
      </div>
    );

    if (error) return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div
          className="text-center max-w-md px-6 py-10 rounded-xl"
          style={{ background: '#FEF3F2', border: '1px solid #FECDCA' }}
        >
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: '#FEE4E2' }}>
            <AlertCircle className="w-7 h-7" style={{ color: '#D92D20' }} />
          </div>
          <h3 className="text-[17px] font-bold mb-2" style={{ color: '#B42318' }}>Research failed</h3>
          <p className="text-[13px] mb-5 leading-relaxed" style={{ color: '#667085' }}>{error}</p>
          <div className="rounded-lg p-4 text-[11px] space-y-1.5 mb-5 text-left"
            style={{ background: '#fff', border: '1px solid #EAECF0', fontFamily: 'var(--font-mono)' }}>
            <p style={{ color: '#98A2B3' }}># Start the backend:</p>
            <p style={{ color: '#344054' }}>uvicorn app.main:app --port 3001 --reload</p>
          </div>
          <button
            onClick={handleReset}
            className="px-5 py-2.5 rounded-lg text-[13px] font-semibold transition-colors"
            style={{ background: '#fff', border: '1px solid #D0D5DD', color: '#344054', cursor: 'pointer' }}
          >
            Try again
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
            style={{ background: '#FFFAEB', border: '1px solid #FEDF89' }}
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#B54708' }} />
            <p className="text-[12px] leading-relaxed" style={{ color: '#B54708' }}>
              The pipeline stream ended before completing — showing partial results. Sequences and scripts may be missing. <button onClick={() => handleGenerate({ companyName: results.companyName, websiteUrl: '' })} className="underline font-medium" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B54708' }}>Rerun to get full output.</button>
            </p>
          </motion.div>
        )}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-[13px] font-medium transition-colors hover:opacity-70"
            style={{ color: '#667085' }}
          >
            <ChevronLeft className="w-4 h-4" /> New research
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-full"
              style={{ background: '#E7F2FA', color: '#0F5795' }}
            >
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#12B76A' }} />
              {results.companyName}
            </span>
            <button
              onClick={() => handleGenerate({ companyName: results.companyName, websiteUrl: results.websiteUrl })}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition-colors"
              style={{ background: '#fff', border: '1px solid #D0D5DD', color: '#344054', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F9FAFB'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
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
                className="flex items-center gap-3 px-4 py-3.5"
                style={{ background: '#fff', border: '1px solid #EAECF0', borderRadius: '10px' }}
              >
                <div className="flex items-center justify-center rounded-lg shrink-0"
                  style={{ width: '32px', height: '32px', background: '#E7F2FA' }}>
                  <s.icon className="w-4 h-4" style={{ color: '#136AB6' }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider font-medium" style={{ color: '#667085' }}>{s.label}</p>
                  <p className="text-[13px] font-medium truncate" style={{ color: '#101828' }}>{s.value}</p>
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
              <div
                className="flex flex-col items-center text-center px-8 py-12"
                style={{ background: '#fff', border: '1px solid #EAECF0', borderRadius: '12px' }}
              >
                <div className="flex items-center justify-center rounded-xl mb-4"
                  style={{ width: '48px', height: '48px', background: '#E7F2FA' }}>
                  <Brain className="w-6 h-6" style={{ color: '#136AB6' }} />
                </div>
                <h3 className="text-[15px] font-semibold mb-1.5" style={{ color: '#101828' }}>Prospect data extracted</h3>
                <p className="text-[13px] leading-relaxed mb-5 max-w-sm" style={{ color: '#667085' }}>
                  Company facts and contact details above are pulled from your data. Run full research to generate the executive briefing, objection playbook, 14-day sequence, and outreach scripts.
                </p>
                <button
                  onClick={() => handleGenerate({ companyName: results.companyName, websiteUrl: results.websiteUrl })}
                  className="inline-flex items-center gap-2 rounded-lg text-[14px] font-semibold"
                  style={{ padding: '10px 20px', background: '#136AB6', color: '#fff', border: '1px solid #136AB6', cursor: 'pointer' }}
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
                    style={{ width: '32px', height: '32px', background: '#E7F2FA' }}>
                    <Target className="w-4 h-4" style={{ color: '#136AB6' }} />
                  </div>
                  <h3 className="text-[14px] font-semibold" style={{ color: '#101828' }}>14-Day sequence</h3>
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
      <div className="flex flex-col lg:flex-row gap-6 items-start min-h-[600px]">
        <ProspectInput onGenerate={handleGenerate} />

        <div className="flex-1 min-w-0 w-full flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label="Avg fit score"
              value={library.length ? (library.reduce((s, e) => s + (e.intel?.score || 5), 0) / library.length).toFixed(1) : '—'}
              icon={BarChart3} delay={0.06}
            />
            <StatCard label="Saved prospects" value={library.length}                                          icon={Target} delay={0.10} />
            <StatCard label="High-fit (8+)"    value={library.filter(e => (e.intel?.score || 0) >= 8).length} icon={Users}  delay={0.14} />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.20 }}
            className="flex-1 flex flex-col items-center justify-center text-center rounded-xl"
            style={{ minHeight: '300px', background: '#fff', border: '1px dashed #D0D5DD' }}
          >
            <div className="max-w-[380px] px-8 py-16">
              <div className="flex items-center justify-center rounded-xl mx-auto mb-5"
                style={{ width: '56px', height: '56px', background: '#E7F2FA' }}>
                <Cpu className="w-6 h-6" style={{ color: '#136AB6' }} />
              </div>

              <h3 className="text-[18px] font-bold mb-2" style={{ color: '#101828' }}>Intelligence engine ready</h3>
              <p className="text-[13px] leading-relaxed mb-6" style={{ color: '#667085' }}>
                Enter a company name and run the pipeline to generate a briefing, objections, scripts, and a 14-day sequence.
              </p>

              {library.length > 0 ? (
                <button
                  onClick={() => setActiveTab('library')}
                  className="inline-flex items-center gap-2 rounded-lg text-[14px] font-semibold"
                  style={{ padding: '10px 20px', background: '#136AB6', color: '#fff', border: '1px solid #136AB6', cursor: 'pointer' }}
                >
                  <Users className="w-3.5 h-3.5" />
                  View {library.length} saved prospect{library.length !== 1 ? 's' : ''}
                </button>
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {['Fleet Visibility', 'Driver Safety', 'Fuel Savings', 'ELD Compliance'].map(tag => (
                    <span key={tag} className="text-[11px] px-3 py-1 rounded-full"
                      style={{ background: '#E7F2FA', color: '#0F5795' }}>
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
      case 'leaderboard':  return <Leaderboard />;
      case 'sequence':
        return (
          <div className="w-full max-w-3xl mx-auto">
            <div className="mb-5">
              <h1 className="text-[16px] font-semibold" style={{ color: '#101828' }}>14-day sequence</h1>
              <p className="text-[13px] mt-1" style={{ color: '#667085' }}>
                {results?.sequence?.length
                  ? <>Calls, emails, and LinkedIn touches for <span className="font-medium" style={{ color: '#136AB6' }}>{results.companyName}</span>, timed from today.</>
                  : 'Run the Intelligence pipeline for a lead first — the day-by-day sequence is generated from that research.'}
              </p>
            </div>
            <SequenceTimeline sequence={results?.sequence} />
          </div>
        );
      case 'log':
        return (
          <div className="w-full max-w-3xl mx-auto">
            <div className="mb-5">
              <h1 className="text-[16px] font-semibold" style={{ color: '#101828' }}>Execution log</h1>
              <p className="text-[13px] mt-1" style={{ color: '#667085' }}>
                {execLog.length > 0
                  ? `${execLog.length} events recorded${results?.companyName ? ` for ${results.companyName}` : ''}`
                  : 'Every research/generation step the pipeline runs will appear here, most recent first.'}
              </p>
            </div>
            <ExecutionLog execLog={execLog} runStartTs={execLogStartRef.current} />
          </div>
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
      libraryCount={library.length}
    >
      {renderContent()}
    </Layout>
  );
}

export default App;
