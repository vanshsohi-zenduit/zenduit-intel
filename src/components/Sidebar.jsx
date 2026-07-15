import { Zap, FileText, Calendar, Target, BarChart3, Activity, BookOpen, UploadCloud, Settings } from 'lucide-react';

const NAV = [
  { id: 'intelligence', label: 'Intelligence',    icon: Zap         },
  { id: 'outreach',     label: 'Scripts',         icon: FileText    },
  { id: 'sequence',     label: '14-Day Sequence', icon: Calendar    },
  { id: 'campaign',     label: 'Campaign',        icon: Target      },
  { id: 'leaderboard',  label: 'Leaderboard',     icon: BarChart3   },
  { id: 'log',          label: 'Execution Log',   icon: Activity    },
  { id: 'library',      label: 'Library',         icon: BookOpen    },
  { id: 'bulk',         label: 'Bulk Upload',     icon: UploadCloud },
];

const NavItem = ({ item, active, badge, onClick }) => {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-lg text-left transition-colors duration-150"
      style={{
        padding: '10px 12px',
        color: active ? 'var(--nav-fg-active)' : 'var(--nav-fg)',
        background: active ? 'var(--nav-active-bg)' : 'transparent',
        border: '1px solid transparent',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--nav-hover-bg)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      <Icon className="w-[19px] h-[19px] shrink-0" strokeWidth={1.8} />
      <span className="text-[14px] font-medium flex-1 truncate">{item.label}</span>
      {badge > 0 && (
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
          style={{ background: 'rgba(255,255,255,0.12)', color: '#F5F5F6' }}
        >
          {badge}
        </span>
      )}
    </button>
  );
};

const Sidebar = ({ activeTab, onTabChange, libraryCount, open }) => (
  <aside
    className={`
      w-[250px] shrink-0 flex flex-col z-40
      fixed inset-y-0 left-0 lg:relative
      transition-transform duration-200 lg:translate-x-0
      ${open ? 'translate-x-0' : '-translate-x-full'}
    `}
    style={{ padding: '16px 12px', background: open ? '#04061a' : 'transparent' }}
  >
    {/* Brand */}
    <div className="flex items-center gap-2.5" style={{ padding: '6px 8px 18px' }}>
      <div
        className="flex items-center justify-center shrink-0 text-white font-bold"
        style={{ width: '34px', height: '34px', borderRadius: '9px', fontSize: '15px', background: 'linear-gradient(135deg,#136AB6,#0A3A63)', boxShadow: '0 1px 2px rgba(0,0,0,.3)' }}
      >
        Z
      </div>
      <div className="text-[16px] font-bold" style={{ color: '#F5F5F6', letterSpacing: '-.01em' }}>ZenIntel</div>
    </div>

    <nav className="flex flex-col gap-1">
      {NAV.map(item => (
        <NavItem
          key={item.id}
          item={item}
          active={activeTab === item.id}
          badge={item.id === 'library' ? libraryCount : 0}
          onClick={() => onTabChange(item.id)}
        />
      ))}
    </nav>

    <div className="flex-1" />

    <NavItem
      item={{ id: 'settings', label: 'Settings', icon: Settings }}
      active={activeTab === 'settings'}
      onClick={() => onTabChange('settings')}
    />

    {/* Footer — pipeline status (informational) */}
    <div
      className="flex items-center gap-2.5"
      style={{ padding: '12px 8px 4px', marginTop: '6px', borderTop: '1px solid rgba(255,255,255,.10)' }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#12B76A', animation: 'pulse-subtle 2s ease-in-out infinite' }} />
      <div className="min-w-0">
        <div className="text-[12px] font-semibold" style={{ color: '#F5F5F6' }}>AI Pipeline</div>
        <div className="text-[11px]" style={{ color: '#8B93A8' }}>Research · Strategy</div>
      </div>
    </div>
  </aside>
);

export default Sidebar;
