import { motion } from 'framer-motion';

const GlassCard = ({ children, className = '', delay = 0, onClick }) => (
  <motion.div
    initial={{ opacity: 0, y: 14 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
    onClick={onClick}
    className={`glass rounded-2xl p-5 ${className}`}
  >
    {children}
  </motion.div>
);

export default GlassCard;
