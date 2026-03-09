import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import Layout from './components/Layout';
import ProspectInput from './components/ProspectInput';
import StrategyDisplay from './components/StrategyDisplay';
import SequenceTimeline from './components/SequenceTimeline';
import OutreachScripts from './components/OutreachScripts';
import SavedLibrary from './components/SavedLibrary';
import BulkUpload from './components/BulkUpload';
import { runIntelPipeline } from './lib/intelEngine.js';
import { fetchLibrary, saveLibrary } from './lib/mcpClient.js';
import {
  Target, Users, BarChart3, ArrowRight, RefreshCw,
  ChevronLeft, Brain, Globe, Cpu, Zap, AlertCircle
} from 'lucide-react';

// ─── Research loader ───────────────────────────────────────────────────────────
const ResearchLoader = ({ phases, activeTool }) => {
  const phaseLabels = [
    { id: 1, label: 'Product Intelligence',  desc: 'NotebookLM · Zenduit features · ROI data' },
    { id: 2, label: 'Prospect Research',     desc: 'Website · LinkedIn · News · Hiring signals' },
    { id: 3, label: 'Strategy Generation',   desc: 'Briefing · Objections · Sequence · Scripts' },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-[520px]">
      <div className="text-center max-w-md w-full">

        {/* Brain orb */}
        <div className="relative w-24 h-24 mx-auto mb-8">
          {/* Outer glow */}
          <div className="absolute inset-0 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.25), transparent 70%)', filter: 'blur(16px)', animation: 'pulse-ring 2.5s ease-in-out infinite' }} />
          {/* Main circle */}
          <div className="relative w-24 h-24 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.22)', boxShadow: '0 0 40px rgba(16,185,129,0.12)' }}>
            <Brain className="w-10 h-10 text-emerald-400 animate-pulse" />
          </div>
          {/* Spinning ring */}
          <div className="absolute -inset-4 rounded-full"
            style={{ border: '1px dashed rgba(16,185,129,0.15)', animation: 'spin 8s linear infinite' }} />
          <div className="absolute -inset-2 rounded-full"
            style={{ border: '1px solid rgba(16,185,129,0.08)', animation: 'spin 5s linear infinite reverse' }} />
        </div>

        <h3 className="text-xl font-bold mb-2" style={{ color: '#F0F0F5' }}>Gathering Intelligence</h3>
        <p className="text-[13px] mb-8" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {activeTool
            ? `Running ${activeTool.replace(/_/g, ' ')}…`
            : 'Analysing company profile…'}
        </p>

        {/* Phase cards */}
        <div className="flex flex-col gap-2.5">
          {phaseLabels.map((p) => {
            const s        = phases[p.id] || 'pending';
            const isActive = s === 'start' || s === 'generating';
            const isDone   = s === 'complete';
            const isSkip   = s === 'skip';
            return (
              <div key={p.id} className="flex items-center gap-3 px-5 py-3.5 transition-all"
                style={{
                  borderRadius: '14px',
                  background: isDone ? 'rgba(16,185,129,0.07)' : isActive ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isDone ? 'rgba(16,185,129,0.22)' : isActive ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.07)'}`,
                }}>
                <div className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: isDone ? '#10B981' : isSkip ? 'rgba(255,255,255,0.12)' : isActive ? '#34d399' : 'rgba(255,255,255,0.15)', boxShadow: isActive ? '0 0 8px rgba(16,185,129,0.7)' : isDone ? '0 0 6px rgba(16,185,129,0.4)' : 'none' }} />
                <div className="flex-1 text-left">
                  <p className="text-[13px] font-bold" style={{ color: s === 'pending' ? 'rgba(255,255,255,0.30)' : isSkip ? 'rgba(255,255,255,0.40)' : '#F0F0F5' }}>{p.label}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>{p.desc}</p>
                </div>
                {isDone && <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">Done</span>}
                {isSkip && <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.20)' }}>Skip</span>}
                {isActive && (
                  <div className="flex gap-1 items-center">
                    {[0, 1, 2].map(i => (
                      <motion.div key={i}
                        animate={{ scale: [1, 1.6, 1], opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18 }}
                        className="w-1 h-1 rounded-full bg-emerald-400"
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {activeTool && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="mt-5 flex items-center justify-center gap-2">
            <Globe className="w-3 h-3" style={{ color: 'rgba(16,185,129,0.5)' }} />
            <span className="text-[11px] font-mono" style={{ color: 'rgba(255,255,255,0.30)' }}>{activeTool}</span>
          </motion.div>
        )}
      </div>
    </div>
  );
};

// ─── Stat card ─────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, icon: Icon, delay }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
    className="flex flex-col gap-3 relative overflow-hidden"
    style={{ padding: '24px', borderRadius: '20px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
    {/* Top gradient accent line */}
    <div className="absolute top-0 left-0 right-0 h-px"
      style={{ background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.5), transparent)' }} />
    <div className="flex items-center justify-between">
      <div className="w-9 h-9 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.18)' }}>
        <Icon className="w-4 h-4 text-emerald-400" />
      </div>
      <ArrowRight className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.12)' }} />
    </div>
    <p className="text-3xl font-black" style={{ color: '#F0F0F5' }}>{value}</p>
    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.30)' }}>{label}</p>
  </motion.div>
);

// ─── App ───────────────────────────────────────────────────────────────────────
function App() {
  const [activeTab,    setActiveTab]    = useState('intelligence');
  const [isGenerating, setIsGenerating] = useState(false);
  const [results,      setResults]      = useState(null);
  const [error,        setError]        = useState(null);
  const [phases,       setPhases]       = useState({});
  const [activeTool,   setActiveTool]   = useState(null);
  const [library,      setLibrary]      = useState(() => {
    try { return JSON.parse(localStorage.getItem('zenduit-library') || '[]'); }
    catch { return []; }
  });
  const libraryMounted = useRef(false);

  // On mount: load from server (source of truth), fall back to localStorage
  useEffect(() => {
    fetchLibrary().then(serverData => {
      if (serverData?.length) {
        setLibrary(serverData);
        localStorage.setItem('zenduit-library', JSON.stringify(serverData));
      }
    });
  }, []);

  // On change: persist to both server and localStorage
  useEffect(() => {
    if (!libraryMounted.current) { libraryMounted.current = true; return; }
    const existing = localStorage.getItem('zenduit-library');
    if (library.length === 0 && (!existing || existing === '[]')) return;
    localStorage.setItem('zenduit-library', JSON.stringify(library));
    saveLibrary(library);
  }, [library]);

  const saveToLibrary = (result) => {
    if (!result?.companyName) return;
    const entry = {
      id:          Date.now().toString(),
      companyName: result.companyName,
      websiteUrl:  '',
      linkedinUrl: '',
      intel:       result.intel,
      // preserve full results so library entries can be reloaded
      briefing:    result.briefing,
      objections:  result.objections,
      sequence:    result.sequence,
      scripts:     result.scripts,
      savedAt:     new Date().toISOString(),
    };
    setLibrary(prev => {
      const filtered = prev.filter(e => e.companyName !== result.companyName);
      return [entry, ...filtered].slice(0, 100);
    });
  };

  const handleGenerate = async (data) => {
    setIsGenerating(true);
    setError(null);
    setResults(null);
    setPhases({});
    setActiveTool(null);
    try {
      const result = await runIntelPipeline(data, (progress) => {
        if (progress.type === 'phase') setPhases(prev => ({ ...prev, [progress.phase]: progress.status }));
        if (progress.type === 'tool')  setActiveTool(progress.name);
      });
      setResults(result);
      saveToLibrary(result);
    } catch (err) {
      setError(err.message || 'Pipeline failed. Ensure backend is running.');
    } finally {
      setIsGenerating(false);
      setActiveTool(null);
    }
  };

  const handleReset  = () => { setResults(null); setError(null); setPhases({}); };
  const handleDelete = (id) => setLibrary(prev => prev.filter(e => e.id !== id));

  // Called once per company as bulk research completes
  const handleBulkResults = (completedResults) => {
    const newEntries = completedResults
      .filter(r => r.status === 'success')
      .map(r => ({
        id:          Date.now().toString() + Math.random(),
        companyName: r.companyName,
        websiteUrl:  r.websiteUrl  || '',
        linkedinUrl: r.linkedinUrl || '',
        intel:       r.intel,
        briefing:    r.briefing,
        objections:  r.objections,
        sequence:    r.sequence,
        scripts:     r.scripts,
        savedAt:     new Date().toISOString(),
      }));
    if (!newEntries.length) return;
    setLibrary(prev => {
      const existing = new Set(prev.map(e => e.companyName));
      return [...newEntries.filter(e => !existing.has(e.companyName)), ...prev].slice(0, 100);
    });
  };

  // ── Intelligence tab ─────────────────────────────────────────────────────────
  const renderIntelligence = () => {
    if (isGenerating) return <ResearchLoader phases={phases} activeTool={activeTool} />;

    // Error state
    if (error) return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="text-center max-w-md px-6 py-10 rounded-2xl"
          style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.18)' }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertCircle className="w-7 h-7 text-red-400" />
          </div>
          <h3 className="text-[17px] font-bold text-red-400 mb-2">Research Failed</h3>
          <p className="text-[13px] mb-5 leading-relaxed" style={{ color: 'rgba(255,255,255,0.40)' }}>{error}</p>
          <div className="rounded-xl p-4 font-mono text-[11px] space-y-1.5 mb-5 text-left"
            style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={{ color: 'rgba(255,255,255,0.30)' }}># Start the backend:</p>
            <p style={{ color: 'rgba(255,255,255,0.80)' }}>{'ANTHROPIC_API_KEY=sk-ant-... node server.js'}</p>
          </div>
          <button onClick={handleReset}
            className="px-5 py-2.5 rounded-xl text-[12px] font-bold transition-colors"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.60)' }}>
            Try Again
          </button>
        </div>
      </div>
    );

    // Results state
    if (results) return (
      <div className="flex flex-col gap-5">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button onClick={handleReset}
            className="flex items-center gap-1.5 text-[12px] font-semibold transition-colors"
            style={{ color: 'rgba(255,255,255,0.35)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.70)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}>
            <ChevronLeft className="w-4 h-4" /> New Research
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-full"
              style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.20)', color: '#10B981' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
              {results.companyName}
            </span>
            <button onClick={() => handleGenerate({ companyName: results.companyName, websiteUrl: results.websiteUrl })}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[12px] font-bold transition-all"
              style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.22)', color: '#10B981' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,0.18)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(16,185,129,0.10)'}>
              <RefreshCw className="w-3 h-3" /> Rerun Research
            </button>
          </div>
        </div>

        {/* Intel pills */}
        {results.intel && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Industry',   value: results.intel.industry   || '—', icon: Target },
              { label: 'Fleet Size', value: results.intel.fleetSize   || '—', icon: Users  },
              { label: 'Best Fit',   value: results.intel.topProduct  || '—', icon: Zap    },
              { label: 'HQ',         value: results.intel.hq          || '—', icon: Globe  },
            ].map((s, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 px-4 py-3.5"
                style={{ borderRadius: '20px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.18)' }}>
                  <s.icon className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'rgba(255,255,255,0.30)' }}>{s.label}</p>
                  <p className="text-[13px] font-bold truncate" style={{ color: '#F0F0F5' }}>{s.value}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Main content — responsive two-column, both independently scrollable */}
        <div className="flex flex-col lg:flex-row gap-5">
          {/* Left: Executive Briefing + Objections */}
          <div className="flex-1 min-w-0">
            <StrategyDisplay briefing={results.briefing} objections={results.objections} />
          </div>

          {/* Right: 14-Day Sequence — sticky on large screens */}
          <div className="lg:w-[380px] xl:w-[420px] shrink-0">
            <div className="lg:sticky lg:top-4">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.18)' }}>
                  <Target className="w-4 h-4 text-emerald-400" />
                </div>
                <h3 className="text-[14px] font-bold" style={{ color: '#F0F0F5' }}>14-Day Sequence</h3>
              </div>
              <div className="lg:max-h-[calc(100vh-180px)] lg:overflow-y-auto pr-1"
                style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
                <SequenceTimeline sequence={results.sequence} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );

    // Default / landing state — fills full viewport height
    return (
      <div className="flex flex-col lg:flex-row gap-5 h-full min-h-[600px]">

        {/* Left: input form */}
        <div className="w-full lg:w-[300px] xl:w-[340px] shrink-0 flex flex-col gap-4">
          <ProspectInput onGenerate={handleGenerate} />
        </div>

        {/* Right: stats + expanding hero */}
        <div className="flex-1 min-w-0 flex flex-col gap-4 min-h-0">

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Avg Fit Score"   value={library.length ? (library.reduce((s,e)=>s+(e.intel?.score||5),0)/library.length).toFixed(1):'—'} icon={BarChart3} delay={0.06} />
            <StatCard label="Saved Prospects" value={library.length}                                                                              icon={Target}   delay={0.10} />
            <StatCard label="High-Fit (8+)"   value={library.filter(e=>(e.intel?.score||0)>=8).length}                                           icon={Users}    delay={0.14} />
          </div>

          {/* Hero — expands to fill remaining height */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.20 }}
            className="flex-1 flex flex-col items-center justify-center relative overflow-hidden"
            style={{ borderRadius: '24px', background: 'rgba(255,255,255,0.015)', border: '1px dashed rgba(255,255,255,0.08)', minHeight: '260px' }}>

            {/* Dot grid background */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
              style={{ backgroundImage: 'radial-gradient(circle at 1.5px 1.5px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />

            <div className="relative z-10 text-center max-w-[380px] px-8">
              <div className="relative w-20 h-20 mx-auto mb-6">
                <div className="absolute inset-0 rounded-full"
                  style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.20), transparent 70%)', filter: 'blur(16px)' }} />
                <div className="relative w-20 h-20 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.20)' }}>
                  <Cpu className="w-9 h-9" style={{ color: 'rgba(16,185,129,0.60)' }} />
                </div>
              </div>
              <h3 className="text-[20px] font-bold mb-3" style={{ color: '#F0F0F5' }}>Intelligence Engine Ready</h3>
              <p className="text-[13px] leading-relaxed mb-8" style={{ color: 'rgba(255,255,255,0.38)' }}>
                Enter a company name or website to trigger the research pipeline — real-time web search, LinkedIn signals, and Zenduit product matching.
              </p>
              {library.length > 0 ? (
                <button onClick={() => setActiveTab('library')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-wider transition-all"
                  style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.22)', color: '#10B981' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,0.16)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(16,185,129,0.10)'}>
                  <Users className="w-3.5 h-3.5" />
                  View {library.length} saved prospect{library.length !== 1 ? 's' : ''}
                </button>
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {['Fleet Visibility', 'Driver Safety', 'Fuel Savings', 'ELD Compliance'].map(tag => (
                    <span key={tag} className="text-[11px] px-3 py-1 rounded-full"
                      style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)', color: 'rgba(16,185,129,0.55)' }}>
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
      case 'outreach':     return <OutreachScripts scripts={results?.scripts} companyName={results?.companyName} intel={results?.intel} />;
      case 'sequence':
        return (
          <div className="w-full max-w-3xl">
            <div className="mb-5">
              <h1 className="text-xl font-bold" style={{ color: '#F0F0F5' }}>14-Day Sequence</h1>
              <p className="text-[13px] mt-0.5" style={{ color: 'rgba(255,255,255,0.40)' }}>
                Outreach timeline for <span className="text-emerald-400 font-semibold">{results?.companyName}</span>
              </p>
            </div>
            <SequenceTimeline sequence={results?.sequence} />
          </div>
        );
      case 'library': return <SavedLibrary library={library} onLoad={(entry) => {
        setResults({ companyName: entry.companyName, intel: entry.intel, briefing: entry.briefing, objections: entry.objections, sequence: entry.sequence, scripts: entry.scripts });
        setActiveTab('intelligence');
      }} onDelete={handleDelete} />;
      case 'bulk':    return <BulkUpload onSaveResults={handleBulkResults} />;
      default:        return null;
    }
  };

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}
      activeIntel={results?.companyName} resultsAvailable={!!results} libraryCount={library.length}>
      {renderContent()}
    </Layout>
  );
}

export default App;
