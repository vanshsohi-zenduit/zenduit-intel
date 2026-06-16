import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Header from './Header';
import Sidebar from './Sidebar';

const Layout = ({ children, activeTab, onTabChange, activeIntel, resultsAvailable, libraryCount }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#f0f4f8' }}>
      <Header
        activeIntel={activeIntel}
        onMenuToggle={() => setSidebarOpen(o => !o)}
        sidebarOpen={sidebarOpen}
      />

      <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 56px)' }}>
        <Sidebar
          activeTab={activeTab}
          onTabChange={(tab) => { onTabChange(tab); setSidebarOpen(false); }}
          resultsAvailable={resultsAvailable}
          libraryCount={libraryCount}
          open={sidebarOpen}
        />

        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 lg:hidden"
            style={{ background: 'rgba(15,23,42,0.5)' }}
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main className="flex-1 overflow-y-auto min-w-0" style={{ background: '#f0f4f8' }}>
          <div className="max-w-[1400px] mx-auto px-6 sm:px-8 py-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
