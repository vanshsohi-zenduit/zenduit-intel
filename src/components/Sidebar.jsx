import { Target, FileText, Clock, BookOpen, Upload, Activity, Mic, BarChart3, Settings } from 'lucide-react';
import { motion } from 'framer-motion';

const NAV = [
  { id: 'intelligence', label: 'Intelligence',    icon: Target,    desc: 'Research & strategy',     locked: false },
  { id: 'outreach',     label: 'Scripts',         icon: FileText,  desc: 'Personalized copy',        locked: true  },
  { id: 'sequence',     label: '14-Day Sequence', icon: Clock,     desc: 'Outreach timeline',        locked: true  },
  { id: 'campaign',     label: 'Campaign',        icon: BarChart3, desc: 'Outcomes & A/B tracking',  locked: false },
  { id: 'log',          label: 'Execution Log',   icon: Activity,  desc: 'Live pipeline events',     locked: false },
  { id: 'coach',        label: 'Live Coach',      icon: Mic,       desc: 'Real-time AI coaching',    locked: false },
  { id: 'library',      label: 'Library',         icon: BookOpen,  desc: 'Saved prospects',          locked: false },
  { id: 'bulk',         label: 'Bulk Upload',     icon: Upload,    desc: 'CSV processing',           locked: false },
  { id: 'settings',     label: 'Settings',        icon: Settings,  desc: 'API credentials',          locked: false },
];

const Sidebar = ({ activeTab, onTabChange, resultsAvailable, libraryCount, open }) => (
  <aside
    className={`
      shrink-0 flex flex-col z-30
      fixed top-[56px] bottom-0 left-0 lg:relative lg:top-auto
      transition-transform duration-200 lg:translate-x-0
      ${open ? 'translate-x-0' : '-translate-x-full'}
    `}
    style={{ width: '220px', background: '#0f1923', borderRight: '1px solid rgba(255,255,255,0.07)' }}
  >
    <div className="px-4 pt-5 pb-2">
      <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: '#7c92ab' }}>
        Navigation
      </p>
    </div>

    <nav className="flex flex-col gap-1 px-3 flex-1">
      {NAV.map(item => {
        const needsResults = item.locked;
        const locked = needsResults && !resultsAvailable;
        const active = activeTab === item.id;
        const Icon   = item.icon;

        return (
          <button
            key={item.id}
            onClick={() => !locked && onTabChange(item.id)}
            disabled={locked}
            className="relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-150"
            style={
              active  ? { background: 'rgba(59,130,246,0.14)', border: '1px solid rgba(59,130,246,0.25)' }
              : locked ? { opacity: 0.30, cursor: 'not-allowed', border: '1px solid transparent' }
              :          { border: '1px solid transparent' }
            }
            onMouseEnter={e => { if (!active && !locked) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            onMouseLeave={e => { if (!active && !locked) e.currentTarget.style.background = 'transparent'; }}
          >
            {active && (
              <motion.div
                layoutId="nav-bar"
                className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                style={{ background: '#3b82f6' }}
              />
            )}

            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={active ? { background: 'rgba(59,130,246,0.18)' } : { background: 'rgba(255,255,255,0.05)' }}
            >
              <Icon className="w-3.5 h-3.5" style={{ color: active ? '#3b82f6' : '#7c92ab' }} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span
                  className="text-[13px] leading-none"
                  style={{ fontWeight: active ? 600 : 400, color: active ? '#e8f0fb' : '#94a3b8' }}
                >
                  {item.label}
                </span>
                {item.id === 'library' && libraryCount > 0 && (
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(59,130,246,0.18)', color: '#3b82f6' }}
                  >
                    {libraryCount}
                  </span>
                )}
              </div>
              <span className="text-[11px] mt-0.5 block" style={{ color: '#4b6279' }}>{item.desc}</span>
            </div>
          </button>
        );
      })}
    </nav>

    <div className="p-3">
      <div
        className="px-3 py-3 rounded-lg"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#16a34a', animation: 'pulse-subtle 2s ease-in-out infinite' }} />
          <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: '#16a34a' }}>AI Pipeline</span>
        </div>
        <p className="text-[11px] leading-relaxed" style={{ color: '#7c92ab' }}>
          Research · Strategy<br />Gemini 3.5 Flash
        </p>
      </div>
    </div>
  </aside>
);

export default Sidebar;
