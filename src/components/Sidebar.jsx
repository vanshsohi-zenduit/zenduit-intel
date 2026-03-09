import { Target, FileText, Clock, BookOpen, Upload } from 'lucide-react';
import { motion } from 'framer-motion';

const NAV = [
  { id: 'intelligence', label: 'Intelligence',     icon: Target,   desc: 'Research & strategy' },
  { id: 'outreach',     label: 'Scripts',          icon: FileText, desc: 'Personalized copy'    },
  { id: 'sequence',     label: '14-Day Sequence',  icon: Clock,    desc: 'Outreach timeline'    },
  { id: 'library',      label: 'Library',          icon: BookOpen, desc: 'Saved prospects'      },
  { id: 'bulk',         label: 'Bulk Upload',      icon: Upload,   desc: 'CSV processing'       },
];

const Sidebar = ({ activeTab, onTabChange, resultsAvailable, libraryCount }) => (
  <aside className="w-56 h-[calc(100vh-64px)] sticky top-16 flex flex-col py-5 px-3 shrink-0"
    style={{ background: 'rgba(7,7,12,0.6)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>

    <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/25 px-2 mb-3">Navigation</p>

    <nav className="flex flex-col gap-0.5 flex-1">
      {NAV.map(item => {
        const locked = ['outreach', 'sequence'].includes(item.id) && !resultsAvailable;
        const active  = activeTab === item.id;
        const Icon    = item.icon;

        return (
          <button key={item.id}
            onClick={() => !locked && onTabChange(item.id)}
            disabled={locked}
            className={`group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 ${
              active  ? 'text-white'
              : locked ? 'opacity-25 cursor-not-allowed text-white/40'
              : 'text-white/45 hover:text-white/80 hover:bg-white/[0.04]'
            }`}
            style={active ? { background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' } : { border: '1px solid transparent' }}
          >
            {active && (
              <motion.div layoutId="sidebar-pill"
                className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-emerald-400"
              />
            )}
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
              active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/[0.05] text-white/40 group-hover:text-white/60'
            }`}>
              <Icon className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={`text-[13px] font-semibold leading-none ${active ? 'text-white' : ''}`}>{item.label}</span>
                {item.id === 'library' && libraryCount > 0 && (
                  <span className="text-[9px] font-bold bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">{libraryCount}</span>
                )}
              </div>
              <span className="text-[10px] text-white/25 mt-0.5 block">{item.desc}</span>
            </div>
          </button>
        );
      })}
    </nav>

    {/* Status footer */}
    <div className="mt-4 mx-1 px-3 py-3 rounded-xl" style={{ background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.1)' }}>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-400/80">MBLM Pipeline</span>
      </div>
      <p className="text-[10px] leading-relaxed text-white/25">
        Phase 0 Web Research<br />Phase 3 Strategy via Opus 4.6
      </p>
    </div>
  </aside>
);

export default Sidebar;
