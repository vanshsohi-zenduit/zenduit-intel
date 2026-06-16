import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Zap, CheckCircle, AlertCircle, Loader, Database, Menu, X, Settings } from 'lucide-react';
import { checkHealth } from '../lib/mcpClient.js';
import LinkedInIcon from './LinkedInIcon.jsx';

const Header = ({ activeIntel, onMenuToggle, sidebarOpen }) => {
  const [status,        setStatus]        = useState('connecting');
  const [brainOnline,   setBrainOnline]   = useState(false);
  const [linkedinOnline, setLinkedinOnline] = useState(false);
  const [showSetup,     setShowSetup]     = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const h = await checkHealth();
        if (h) {
          setStatus('online');
          setBrainOnline(!!h.brain_mcp);
          setLinkedinOnline(!!h.linkedin_mcp);
        } else {
          setStatus('offline');
          setBrainOnline(false);
          setLinkedinOnline(false);
        }
      } catch {
        setStatus('offline');
        setBrainOnline(false);
        setLinkedinOnline(false);
      }
    };
    check();
    const id = setInterval(check, 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <header
      className="flex items-center gap-4 px-4 sm:px-6 shrink-0 z-30 sticky top-0"
      style={{ height: '56px', background: '#1E293B', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* Mobile menu toggle */}
      <button
        onClick={onMenuToggle}
        className="flex items-center justify-center rounded-lg lg:hidden"
        style={{ width: '32px', height: '32px', color: '#64748B' }}
        aria-label="Toggle navigation"
      >
        {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>

      {/* Brand */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div
          className="flex items-center justify-center rounded-lg shrink-0"
          style={{ width: '30px', height: '30px', background: '#3B82F6', borderRadius: '8px' }}
        >
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div>
          <span className="text-[15px] font-semibold" style={{ color: '#F1F5F9', letterSpacing: '-0.01em' }}>
            Zenduit
          </span>
          <span className="text-[11px] ml-1.5" style={{ color: '#64748B' }}>Intel</span>
        </div>
      </div>

      <div className="flex-1" />

      {/* Active company badge */}
      {activeIntel && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg shrink-0"
          style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.22)', maxWidth: '200px' }}
        >
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#10B981' }} />
          <span className="text-[12px] font-medium truncate" style={{ color: '#3B82F6' }}>{activeIntel}</span>
        </motion.div>
      )}

      {/* Brain MCP badge */}
      {brainOnline && (
        <div
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
          title="Brain MCP connected"
        >
          <Database className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
          <span className="text-[11px] font-medium" style={{ color: '#10B981' }}>Brain</span>
        </div>
      )}

      {/* LinkedIn MCP badge */}
      {linkedinOnline && (
        <div
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
          title="LinkedIn MCP connected"
        >
          <LinkedInIcon className="w-3.5 h-3.5" style={{ color: '#0A66C2' }} />
          <span className="text-[11px] font-medium" style={{ color: '#0A66C2' }}>LinkedIn</span>
        </div>
      )}

      {/* API status */}
      <div className="relative shrink-0">
        <button
          onClick={() => setShowSetup(s => !s)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}
        >
          {status === 'connecting' && <Loader className="w-3.5 h-3.5 animate-spin" style={{ color: '#64748B' }} />}
          {status === 'online'     && <div className="w-2 h-2 rounded-full" style={{ background: '#10B981' }} />}
          {status === 'offline'    && <div className="w-2 h-2 rounded-full" style={{ background: '#DC2626' }} />}
          <span className="text-[12px] font-medium hidden sm:inline" style={{ color: '#94A3B8' }}>
            {status === 'connecting' ? 'Connecting…' : status === 'online' ? 'Online' : 'Offline'}
          </span>
          <Settings className="w-3.5 h-3.5" style={{ color: '#64748B' }} />
        </button>

        {showSetup && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="absolute top-full right-0 mt-2 w-72 rounded-xl p-5 z-50"
            style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.10)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-[13px] font-semibold" style={{ color: '#F1F5F9' }}>Backend Setup</p>
              <button onClick={() => setShowSetup(false)} style={{ color: '#64748B' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div
              className="rounded-lg p-3 mb-4"
              style={{ background: '#0F172A', border: '1px solid rgba(255,255,255,0.06)', fontFamily: 'Inconsolata, monospace', fontSize: '12px' }}
            >
              <p style={{ color: '#64748B' }}># Terminal — start backend</p>
              <p style={{ color: '#F1F5F9', marginTop: '4px' }}>uvicorn app.main:app --port 3001 --reload</p>
            </div>
            <p className="text-[12px] leading-relaxed" style={{ color: '#64748B' }}>
              Proxied at <span style={{ color: '#3B82F6' }}>/api</span>.
              {brainOnline
                ? <span className="block mt-2" style={{ color: '#10B981' }}>✓ Brain MCP connected</span>
                : <span className="block mt-2" style={{ color: '#64748B' }}>Brain MCP: set BRAIN_MCP_URL in .env</span>
              }
              {linkedinOnline
                ? <span className="block mt-1" style={{ color: '#0A66C2' }}>✓ LinkedIn MCP connected</span>
                : <span className="block mt-1" style={{ color: '#64748B' }}>LinkedIn MCP: set LINKEDIN_MCP_URL in .env</span>
              }
            </p>
          </motion.div>
        )}
      </div>
    </header>
  );
};

export default Header;
