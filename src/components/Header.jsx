import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Loader, Database, Menu, X, LogOut } from 'lucide-react';
import { checkHealth } from '../lib/mcpClient.js';
import { clearAuthToken } from '../lib/auth.js';
import LinkedInIcon from './LinkedInIcon.jsx';

// Toolbar — lives inside the floating white content card (per ZenduONE design).
// Left: mobile menu toggle + active tab label. Right: active company + live
// backend/MCP health status (real, from checkHealth).
const Header = ({ tabLabel, activeIntel, onMenuToggle, sidebarOpen }) => {
  const [status,         setStatus]         = useState('connecting');
  const [brainOnline,    setBrainOnline]    = useState(false);
  const [linkedinOnline, setLinkedinOnline] = useState(false);
  const [showSetup,      setShowSetup]      = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const h = await checkHealth();
        if (h) {
          setStatus('online');
          setBrainOnline(!!h.brain_mcp);
          setLinkedinOnline(!!h.linkedin_mcp);
        } else {
          setStatus('offline'); setBrainOnline(false); setLinkedinOnline(false);
        }
      } catch {
        setStatus('offline'); setBrainOnline(false); setLinkedinOnline(false);
      }
    };
    check();
    const id = setInterval(check, 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="flex items-center justify-between shrink-0"
      style={{ height: '60px', padding: '0 20px', borderBottom: '1px solid #EAECF0' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuToggle}
          className="flex items-center justify-center rounded-lg lg:hidden shrink-0"
          style={{ width: '34px', height: '34px', color: '#667085' }}
          aria-label="Toggle navigation"
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <div className="text-[16px] font-bold truncate" style={{ color: '#101828' }}>{tabLabel}</div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {activeIntel && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="hidden md:flex items-center gap-2 rounded-full"
            style={{ padding: '4px 12px', background: '#E7F2FA', maxWidth: '220px' }}
          >
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#12B76A' }} />
            <span className="text-[12px] font-semibold truncate" style={{ color: '#0F5795' }}>{activeIntel}</span>
          </motion.div>
        )}

        {brainOnline && (
          <div
            className="hidden sm:flex items-center gap-1.5 rounded-lg"
            style={{ padding: '5px 10px', background: '#F2F4F7' }}
            title="Brain MCP connected"
          >
            <Database className="w-3.5 h-3.5" style={{ color: '#039855' }} />
            <span className="text-[11px] font-semibold" style={{ color: '#039855' }}>Brain</span>
          </div>
        )}
        {linkedinOnline && (
          <div
            className="hidden sm:flex items-center gap-1.5 rounded-lg"
            style={{ padding: '5px 10px', background: '#F2F4F7' }}
            title="LinkedIn MCP connected"
          >
            <LinkedInIcon className="w-3.5 h-3.5" style={{ color: '#0F5795' }} />
            <span className="text-[11px] font-semibold" style={{ color: '#0F5795' }}>LinkedIn</span>
          </div>
        )}

        <div className="relative">
          <button
            onClick={() => setShowSetup(s => !s)}
            className="flex items-center gap-2 rounded-lg"
            style={{ padding: '6px 12px', background: '#F9FAFB', border: '1px solid #EAECF0', cursor: 'pointer' }}
          >
            {status === 'connecting' && <Loader className="w-3.5 h-3.5 animate-spin" style={{ color: '#98A2B3' }} />}
            {status === 'online'     && <span className="w-2 h-2 rounded-full" style={{ background: '#12B76A' }} />}
            {status === 'offline'    && <span className="w-2 h-2 rounded-full" style={{ background: '#F04438' }} />}
            <span className="text-[12px] font-semibold hidden sm:inline" style={{ color: '#475467' }}>
              {status === 'connecting' ? 'Connecting…' : status === 'online' ? 'Online' : 'Offline'}
            </span>
          </button>

          {showSetup && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="absolute top-full right-0 mt-2 w-72 rounded-xl p-5 z-50"
              style={{ background: '#fff', border: '1px solid #EAECF0', boxShadow: 'var(--shadow-lg)' }}
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-[13px] font-semibold" style={{ color: '#101828' }}>Backend setup</p>
                <button onClick={() => setShowSetup(false)} style={{ color: '#98A2B3' }} aria-label="Close">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div
                className="rounded-lg p-3 mb-4"
                style={{ background: '#F9FAFB', border: '1px solid #EAECF0', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
              >
                <p style={{ color: '#98A2B3' }}># Start the backend</p>
                <p style={{ color: '#101828', marginTop: '4px' }}>uvicorn app.main:app --port 3001 --reload</p>
              </div>
              <div className="text-[12px] leading-relaxed" style={{ color: '#667085' }}>
                Proxied at <span style={{ color: '#136AB6' }}>/api</span>.
                <span className="flex items-center gap-1.5 mt-2" style={{ color: brainOnline ? '#039855' : '#98A2B3' }}>
                  {brainOnline && <CheckCircle className="w-3.5 h-3.5" />} Brain MCP {brainOnline ? 'connected' : '— set BRAIN_MCP_URL in Settings'}
                </span>
                <span className="flex items-center gap-1.5 mt-1" style={{ color: linkedinOnline ? '#0F5795' : '#98A2B3' }}>
                  {linkedinOnline && <CheckCircle className="w-3.5 h-3.5" />} LinkedIn MCP {linkedinOnline ? 'connected' : '— set LINKEDIN_MCP_URL in Settings'}
                </span>
              </div>
              <button
                onClick={() => { clearAuthToken(); window.location.href = '/login'; }}
                className="flex items-center justify-center gap-2 w-full mt-4 rounded-lg"
                style={{ height: '38px', background: '#FEF3F2', border: '1px solid #FECDCA', color: '#B42318', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Header;
