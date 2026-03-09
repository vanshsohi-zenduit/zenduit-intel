import Header from './Header';
import { motion, AnimatePresence } from 'framer-motion';

const Layout = ({ children, activeTab, onTabChange, activeIntel, resultsAvailable, libraryCount }) => (
  <div className="min-h-screen" style={{ background: '#07070C' }}>
    {/* Ambient background glows */}
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      <div className="absolute top-0 left-1/3 w-[700px] h-[500px] rounded-full opacity-25"
        style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      <div className="absolute bottom-0 right-0 w-[500px] h-[400px] rounded-full opacity-15"
        style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 70%)', filter: 'blur(80px)' }} />
    </div>

    <Header
      activeTab={activeTab}
      onTabChange={onTabChange}
      activeIntel={activeIntel}
      resultsAvailable={resultsAvailable}
      libraryCount={libraryCount}
    />

    <main className="relative overflow-y-auto" style={{ height: 'calc(100vh - 56px)' }}>
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-12 py-5 sm:py-8 h-full">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="h-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  </div>
);

export default Layout;
