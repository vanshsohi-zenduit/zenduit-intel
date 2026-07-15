import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Header from './Header';
import Sidebar from './Sidebar';

const TAB_LABELS = {
  intelligence: 'Intelligence',
  outreach:     'Scripts',
  sequence:     '14-Day Sequence',
  campaign:     'Campaign',
  leaderboard:  'Leaderboard',
  log:          'Execution Log',
  library:      'Library',
  bulk:         'Bulk Upload',
  settings:     'Settings',
};

const Layout = ({ children, activeTab, onTabChange, activeIntel, libraryCount }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div
      className="flex w-full overflow-hidden"
      style={{ height: '100vh', background: 'var(--canvas-gradient)' }}
    >
      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => { onTabChange(tab); setSidebarOpen(false); }}
        libraryCount={libraryCount}
        open={sidebarOpen}
      />

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          style={{ background: 'rgba(1,6,18,0.6)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Floating white content card */}
      <main
        className="flex-1 min-w-0 flex flex-col overflow-hidden"
        style={{ background: '#fff', borderRadius: '14px', margin: '12px 12px 12px 4px', boxShadow: '0 1px 2px rgba(0,0,0,.25)' }}
      >
        <Header
          tabLabel={TAB_LABELS[activeTab] || ''}
          activeIntel={activeIntel}
          onMenuToggle={() => setSidebarOpen(o => !o)}
          sidebarOpen={sidebarOpen}
        />

        <div className="flex-1 min-h-0 overflow-auto" style={{ background: '#F9FAFB' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="min-h-full p-5 sm:p-7"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

export default Layout;
