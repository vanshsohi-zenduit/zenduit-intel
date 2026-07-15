import { motion } from 'framer-motion';
import { Mail, Phone, MessageSquare, Clock } from 'lucide-react';
import LinkedInIcon from './LinkedInIcon.jsx';

const CHANNELS = {
  Email:     { icon: Mail,          color: '#0F5795', bg: '#E7F2FA', border: '#C8E0F3' },
  LinkedIn:  { icon: LinkedInIcon,  color: '#0F5795', bg: '#E7F2FA', border: '#C8E0F3' },
  Call:      { icon: Phone,         color: '#027A48', bg: '#ECFDF3', border: '#A6F4C5' },
  Voicemail: { icon: Phone,         color: '#B54708', bg: '#FFFAEB', border: '#FEDF89' },
  Message:   { icon: MessageSquare, color: '#475467', bg: '#F2F4F7', border: '#EAECF0' },
};

const SequenceTimeline = ({ sequence }) => {
  if (!sequence?.length) return null;

  return (
    <div className="relative pl-8">
      <div
        className="absolute left-[20px] top-5 bottom-5 w-px"
        style={{ background: '#EAECF0' }}
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
                    color: ch.color, fontFamily: 'var(--font-sans)',
                  }}
                >
                  {item.day}
                </div>
              </div>

              <div
                className="flex-1 p-4 mb-0"
                style={{ background: '#fff', border: '1px solid #EAECF0', borderRadius: '10px' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] font-semibold rounded-full px-2 py-0.5" style={{ color: ch.color, background: ch.bg }}>
                    Day {item.day}
                  </span>
                  <span className="text-[11px] font-medium" style={{ color: '#667085', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {item.channel}
                  </span>
                  {item.subject && (
                    <>
                      <span className="text-[10px]" style={{ color: '#98A2B3' }}>·</span>
                      <span className="text-[11px] truncate max-w-[140px]" style={{ color: '#98A2B3' }}>{item.subject}</span>
                    </>
                  )}
                </div>
                <p className="text-[13px] leading-relaxed" style={{ color: '#344054' }}>{item.instruction}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default SequenceTimeline;
