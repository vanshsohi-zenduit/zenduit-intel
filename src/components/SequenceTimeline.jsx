import { motion } from 'framer-motion';
import { Mail, Phone, MessageSquare, Clock } from 'lucide-react';
import LinkedInIcon from './LinkedInIcon.jsx';

const CHANNELS = {
  Email:    { icon: Mail,          color: '#10B981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.25)'  },
  LinkedIn: { icon: LinkedInIcon,  color: '#60A5FA', bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.25)' },
  Call:     { icon: Phone,         color: '#FBBF24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.25)' },
  Message:  { icon: MessageSquare, color: '#A78BFA', bg: 'rgba(167,139,250,0.1)',border: 'rgba(167,139,250,0.25)'},
};

const SequenceTimeline = ({ sequence }) => {
  if (!sequence?.length) return null;

  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div className="absolute left-[18px] top-5 bottom-5 w-px"
        style={{ background: 'linear-gradient(to bottom, rgba(16,185,129,0.35), rgba(16,185,129,0.05))' }} />

      <div className="flex flex-col gap-3">
        {sequence.map((item, i) => {
          const ch = CHANNELS[item.channel] || CHANNELS.Message;
          const Icon = ch.icon;
          return (
            <motion.div key={i}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.07, type: 'spring', stiffness: 260, damping: 24 }}
              className="relative flex items-start gap-3 group"
            >
              {/* Node — 36px circle */}
              <div
                className="relative z-10 flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: ch.bg,
                  border: `1px solid ${ch.border}`,
                  color: ch.color,
                  boxShadow: `0 0 16px ${ch.bg}`,
                }}>
                <Icon className="w-3.5 h-3.5" />
                {/* Day badge */}
                <div className="absolute flex items-center justify-center text-[8px] font-black"
                  style={{
                    top: '-6px',
                    right: '-6px',
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: '#08080F',
                    border: `1px solid ${ch.border}`,
                    color: ch.color,
                  }}>
                  {item.day}
                </div>
              </div>

              {/* Card */}
              <div className="flex-1 transition-all duration-150 group-hover:bg-white/[0.04]"
                style={{ borderRadius: '16px', padding: '16px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
                {/* Meta row */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: ch.color }}>
                    <Clock className="w-2.5 h-2.5" />
                    Day {item.day}
                  </span>
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.20)' }}>·</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.50)' }}>{item.channel}</span>
                  {item.subject && (
                    <>
                      <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.20)' }}>·</span>
                      <span className="text-[10px] truncate max-w-[120px]" style={{ color: 'rgba(255,255,255,0.30)' }}>{item.subject}</span>
                    </>
                  )}
                </div>
                <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.60)' }}>{item.instruction}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default SequenceTimeline;
