import { motion } from 'framer-motion';
import { Mail, Phone, MessageSquare, Clock } from 'lucide-react';
import LinkedInIcon from './LinkedInIcon.jsx';

const CHANNELS = {
  Email:    { icon: Mail,          color: '#2563eb', bg: 'rgba(37,99,235,0.10)',  border: 'rgba(37,99,235,0.22)'   },
  LinkedIn: { icon: LinkedInIcon,  color: '#2563eb', bg: 'rgba(37,99,235,0.10)',  border: 'rgba(37,99,235,0.22)'   },
  Call:     { icon: Phone,         color: '#d97706', bg: 'rgba(217,119,6,0.10)',  border: 'rgba(217,119,6,0.22)'   },
  Message:  { icon: MessageSquare, color: '#64748b', bg: 'rgba(100,116,139,0.10)', border: 'rgba(100,116,139,0.20)' },
};

const SequenceTimeline = ({ sequence }) => {
  if (!sequence?.length) return null;

  return (
    <div className="relative pl-8">
      <div
        className="absolute left-[20px] top-5 bottom-5 w-px"
        style={{ background: '#e2e8f0' }}
      />

      <div className="flex flex-col gap-3">
        {sequence.map((item, i) => {
          const ch   = CHANNELS[item.channel] || CHANNELS.Message;
          const Icon = ch.icon;

          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05, duration: 0.2 }}
              className="relative flex items-start gap-3"
            >
              <div
                className="relative z-10 flex items-center justify-center shrink-0"
                style={{
                  width: '40px', height: '40px', borderRadius: '50%',
                  background: ch.bg, border: `1px solid ${ch.border}`,
                }}
              >
                <Icon className="w-4 h-4" style={{ color: ch.color }} />
                <div
                  className="absolute flex items-center justify-center text-[8px] font-bold"
                  style={{
                    top: '-4px', right: '-4px',
                    width: '16px', height: '16px', borderRadius: '50%',
                    background: '#ffffff', border: `1px solid ${ch.border}`,
                    color: ch.color, fontFamily: 'Inter, sans-serif',
                  }}
                >
                  {item.day}
                </div>
              </div>

              <div
                className="flex-1 card p-4 mb-0"
                style={{ borderRadius: '8px' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: ch.color }}>
                    Day {item.day}
                  </span>
                  <span className="text-[10px]" style={{ color: '#94a3b8' }}>·</span>
                  <span className="text-[10px] font-medium" style={{ color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {item.channel}
                  </span>
                  {item.subject && (
                    <>
                      <span className="text-[10px]" style={{ color: '#94a3b8' }}>·</span>
                      <span className="text-[11px] truncate max-w-[140px]" style={{ color: '#94a3b8' }}>{item.subject}</span>
                    </>
                  )}
                </div>
                <p className="text-[13px] leading-relaxed" style={{ color: '#374151' }}>{item.instruction}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default SequenceTimeline;
