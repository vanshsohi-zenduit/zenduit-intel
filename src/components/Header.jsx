import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Target, FileText, Clock, BookOpen, Upload, Zap, Settings, X, CheckCircle, AlertCircle, Loader, Database } from 'lucide-react';
import { checkHealth } from '../lib/mcpClient.js';

const NAV = [
  { id: 'intelligence', label: 'Intelligence', icon: Target },
  { id: 'outreach',     label: 'Scripts',      icon: FileText },
  { id: 'sequence',     label: 'Sequence',     icon: Clock },
  { id: 'library',      label: 'Library',      icon: BookOpen },
  { id: 'bulk',         label: 'Bulk',         icon: Upload },
];

const Header = ({ activeTab, onTabChange, activeIntel, resultsAvailable, libraryCount }) => {
  const [status,     setStatus]     = useState('connecting');
  const [nlmOnline,  setNlmOnline]  = useState(false);
  const [showSetup,  setShowSetup]  = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const health = await checkHealth();
        if (health) {
          setStatus('online');
          setNlmOnline(!!health.notebooklm);
        } else {
          setStatus('offline');
          setNlmOnline(false);
        }
      } catch {
        setStatus('offline');
        setNlmOnline(false);
      }
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-50"
      style={{ background: 'rgba(8,8,15,0.90)', borderBottom: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)' }}>
      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 h-[56px] flex items-center gap-3 min-w-0">

        {/* Brand */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.25), rgba(16,185,129,0.08))', border: '1px solid rgba(16,185,129,0.28)' }}>
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[14px] font-black tracking-tight" style={{ color: '#F0F0F5' }}>Zenduit</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] hidden sm:inline" style={{ color: 'rgba(255,255,255,0.28)' }}>Intel</span>
          </div>
        </div>

        {/* Thin vertical divider */}
        <div className="w-px h-5 shrink-0 hidden sm:block" style={{ background: 'rgba(255,255,255,0.10)' }} />

        {/* Nav tabs — scrollable on small screens */}
        <nav className="flex items-center gap-0.5 flex-1 overflow-x-auto min-w-0" style={{ scrollbarWidth: 'none' }}>
          {NAV.map(item => {
            const locked = ['outreach', 'sequence'].includes(item.id) && !resultsAvailable;
            const active = activeTab === item.id;
            const Icon   = item.icon;

            return (
              <button key={item.id}
                onClick={() => !locked && onTabChange(item.id)}
                disabled={locked}
                className="relative flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl transition-all duration-150 shrink-0"
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  ...(active
                    ? { background: 'rgba(16,185,129,0.12)', color: '#10B981', border: '1px solid rgba(16,185,129,0.20)' }
                    : locked
                    ? { color: 'rgba(255,255,255,0.20)', cursor: 'not-allowed', border: '1px solid transparent' }
                    : { color: 'rgba(255,255,255,0.38)', border: '1px solid transparent' })
                }}
                onMouseEnter={e => { if (!active && !locked) e.currentTarget.style.color = 'rgba(255,255,255,0.70)'; }}
                onMouseLeave={e => { if (!active && !locked) e.currentTarget.style.color = 'rgba(255,255,255,0.38)'; }}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden xs:inline sm:inline">{item.label}</span>
                {item.id === 'library' && libraryCount > 0 && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full ml-0.5"
                    style={{ background: 'rgba(16,185,129,0.20)', color: '#10B981' }}>
                    {libraryCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-1.5 shrink-0">

          {/* Active company badge — hide on very small */}
          {activeIntel && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
              style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.20)', color: '#10B981', maxWidth: '160px' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block shrink-0" />
              <span className="truncate">{activeIntel}</span>
            </motion.div>
          )}

          {/* NotebookLM status pill */}
          {nlmOnline && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl"
              style={{ background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.20)' }}
              title="NotebookLM MCP connected — fleet intel database active">
              <Database className="w-3 h-3" style={{ color: '#818cf8' }} />
              <span className="text-[10px] font-semibold hidden sm:inline" style={{ color: '#818cf8' }}>NLM</span>
            </div>
          )}

          {/* API status pill */}
          <div className="relative">
            <button
              onClick={() => setShowSetup(s => !s)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {status === 'connecting' && <Loader className="w-3 h-3 animate-spin" style={{ color: 'rgba(255,255,255,0.40)' }} />}
              {status === 'online'     && <CheckCircle className="w-3 h-3 text-emerald-400" />}
              {status === 'offline'    && <AlertCircle className="w-3 h-3 text-red-400" />}
              <span className="text-[11px] font-semibold hidden sm:inline"
                style={{ color: status === 'online' ? '#10B981' : status === 'offline' ? '#f87171' : 'rgba(255,255,255,0.40)' }}>
                {status === 'connecting' ? 'Connecting' : status === 'online' ? 'Groq Online' : 'Offline'}
              </span>
              <Settings className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.28)' }} />
            </button>

            {/* Setup dropdown */}
            {showSetup && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="absolute top-full right-0 mt-2 w-72 sm:w-80 rounded-2xl p-4 z-50"
                style={{ background: '#0F0F1A', border: '1px solid rgba(255,255,255,0.10)' }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[12px] font-bold" style={{ color: '#F0F0F5' }}>Backend Setup</p>
                  <button onClick={() => setShowSetup(false)}>
                    <X className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.40)' }} />
                  </button>
                </div>
                <div className="rounded-xl p-3 font-mono text-[11px] space-y-1.5 mb-3"
                  style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <p style={{ color: 'rgba(255,255,255,0.35)' }}># In a separate terminal:</p>
                  <p className="text-emerald-400">cd outbound-intel</p>
                  <p style={{ color: 'rgba(255,255,255,0.8)' }}>{'ANTHROPIC_API_KEY=sk-ant-... \\'}</p>
                  <p style={{ color: 'rgba(255,255,255,0.8)' }}>{'  node server.js'}</p>
                </div>
                <p className="text-[10px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.30)' }}>
                  Backend runs on port 3001. Proxied via Vite at <span className="text-emerald-400/70">/api</span>.
                  {nlmOnline
                    ? <span className="block mt-1.5" style={{ color: '#818cf8' }}>✓ NotebookLM MCP connected — fleet intel active</span>
                    : <span className="block mt-1.5">NotebookLM: run <code className="text-indigo-400/80">notebooklm-mcp --transport http --port 8001</code></span>
                  }
                </p>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
