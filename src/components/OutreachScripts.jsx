import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, Mail, Phone, MessageCircle, ChevronDown, Zap, Search, User, Briefcase, Truck, Tag } from 'lucide-react';
import LinkedInIcon from './LinkedInIcon.jsx';

const TYPES = {
  'LinkedIn Connection': { icon: LinkedInIcon,  color: '#60A5FA', bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.2)'   },
  'LinkedIn Follow-up':  { icon: LinkedInIcon,  color: '#818CF8', bg: 'rgba(129,140,248,0.1)',  border: 'rgba(129,140,248,0.2)'  },
  'Cold Email #1':       { icon: Mail,          color: '#10B981', bg: 'rgba(16,185,129,0.1)',   border: 'rgba(16,185,129,0.2)'   },
  'Cold Email #2':       { icon: Mail,          color: '#34D399', bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.18)'  },
  'Cold Email':          { icon: Mail,          color: '#10B981', bg: 'rgba(16,185,129,0.1)',   border: 'rgba(16,185,129,0.2)'   },
  'Cold Call Script':    { icon: Phone,         color: '#FBBF24', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.2)'   },
  'Message':             { icon: MessageCircle, color: '#A78BFA', bg: 'rgba(167,139,250,0.1)',  border: 'rgba(167,139,250,0.2)'  },
};

const FRAMEWORK_COLORS = {
  'AIDA':                { color: '#10B981', bg: 'rgba(16,185,129,0.10)',  border: 'rgba(16,185,129,0.20)'  },
  'Pattern Interrupt':   { color: '#60A5FA', bg: 'rgba(96,165,250,0.10)',  border: 'rgba(96,165,250,0.20)'  },
  'Trigger + Value':     { color: '#818CF8', bg: 'rgba(129,140,248,0.10)', border: 'rgba(129,140,248,0.20)' },
  'Permission Opener':   { color: '#FBBF24', bg: 'rgba(251,191,36,0.10)',  border: 'rgba(251,191,36,0.20)'  },
  'New Angle':           { color: '#34D399', bg: 'rgba(52,211,153,0.10)',  border: 'rgba(52,211,153,0.18)'  },
};

const CopyButton = ({ text, size = 'sm' }) => {
  const [copied, setCopied] = useState(false);
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy}
      className="flex items-center justify-center shrink-0 transition-all rounded-md"
      style={{
        width: size === 'sm' ? '22px' : '28px',
        height: size === 'sm' ? '22px' : '28px',
        ...(copied
          ? { background: 'rgba(16,185,129,0.15)', color: '#10B981', border: '1px solid rgba(16,185,129,0.25)' }
          : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.30)', border: '1px solid rgba(255,255,255,0.08)' })
      }}>
      {copied ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
    </button>
  );
};

const ContactCard = ({ intel }) => {
  if (!intel) return null;

  const {
    contactName, contactTitle, contactEmail, contactPhone,
    contactRoleSummary, currentFleetPlatform, trackableAssets,
    fleetSize, industry,
  } = intel;

  // Only render if we have at least some contact info
  const hasContact = contactName || contactEmail || contactPhone;
  if (!hasContact) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
      className="mb-5 rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)' }}>

      {/* Card header */}
      <div className="flex items-center gap-3 px-5 py-4"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.20)' }}>
          <User className="w-4 h-4" style={{ color: '#60A5FA' }} />
        </div>
        <div>
          <p className="text-[13px] font-bold text-white">{contactName || 'Contact Details'}</p>
          {contactTitle && <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.40)' }}>{contactTitle}</p>}
        </div>
      </div>

      {/* Card body */}
      <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Contact info column */}
        <div className="flex flex-col gap-3">
          {contactEmail && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'rgba(255,255,255,0.25)' }}>Email</p>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 shrink-0" style={{ color: 'rgba(16,185,129,0.7)' }} />
                <p className="text-[12px] font-medium truncate" style={{ color: 'rgba(255,255,255,0.70)' }}>{contactEmail}</p>
                <CopyButton text={contactEmail} />
              </div>
            </div>
          )}

          {contactPhone && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'rgba(255,255,255,0.25)' }}>Phone</p>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 shrink-0" style={{ color: 'rgba(251,191,36,0.7)' }} />
                <p className="text-[12px] font-medium" style={{ color: 'rgba(255,255,255,0.70)' }}>{contactPhone}</p>
                <CopyButton text={contactPhone} />
              </div>
            </div>
          )}

          {currentFleetPlatform && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'rgba(255,255,255,0.25)' }}>Current Fleet Platform</p>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.18)' }}>
                <Briefcase className="w-3 h-3" style={{ color: 'rgba(167,139,250,0.7)' }} />
                <span className="text-[11px] font-semibold" style={{ color: 'rgba(167,139,250,0.9)' }}>{currentFleetPlatform}</span>
              </div>
            </div>
          )}

          {fleetSize && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.25)' }}>Est. Fleet Size</p>
              <p className="text-[12px] font-semibold" style={{ color: 'rgba(255,255,255,0.60)' }}>{fleetSize}</p>
            </div>
          )}
        </div>

        {/* Role + assets column */}
        <div className="flex flex-col gap-3">
          {contactRoleSummary && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'rgba(255,255,255,0.25)' }}>Role Snapshot</p>
              <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.50)' }}>{contactRoleSummary}</p>
            </div>
          )}

          {trackableAssets?.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'rgba(255,255,255,0.25)' }}>Trackable Assets</p>
              <div className="flex flex-wrap gap-1.5">
                {trackableAssets.map((asset, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold"
                    style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.18)', color: 'rgba(16,185,129,0.80)' }}>
                    <Truck className="w-2.5 h-2.5" />
                    {asset}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

const ScriptCard = ({ script, index }) => {
  const [copied, setCopied] = useState(false);
  const [open,   setOpen]   = useState(index === 0);
  const cfg  = TYPES[script.type] || TYPES.Message;
  const Icon = cfg.icon;
  const fw   = script.framework ? (FRAMEWORK_COLORS[script.framework] || FRAMEWORK_COLORS['New Angle']) : null;

  const copy = () => {
    navigator.clipboard.writeText(script.subject ? `Subject: ${script.subject}\n\n${script.body}` : script.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.07 }}
      className="overflow-hidden"
      style={{
        borderRadius: '16px',
        background: 'rgba(255,255,255,0.025)',
        border: `1px solid ${open ? cfg.border : 'rgba(255,255,255,0.07)'}`,
        transition: 'border-color 0.2s',
      }}>

      {/* Header row */}
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 text-left"
        style={{ padding: '16px 20px' }}>
        <div className="flex items-center justify-center shrink-0"
          style={{ width: '36px', height: '36px', borderRadius: '50%', background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13px] font-semibold" style={{ color: '#F0F0F5' }}>{script.type}</p>
            {fw && script.framework && (
              <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                style={{ background: fw.bg, color: fw.color, border: `1px solid ${fw.border}` }}>
                {script.framework}
              </span>
            )}
          </div>
          {script.subject && <p className="text-[11px] truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{script.subject}</p>}
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.25)' }} />
        </motion.div>
      </button>

      {/* Body */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }} className="overflow-hidden">
            <div style={{ padding: '0 24px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>

              {/* Research signal used */}
              {script.openingSignal && (
                <div className="flex items-start gap-2 mt-4 mb-3 px-3 py-2.5 rounded-lg"
                  style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.12)' }}>
                  <Search className="w-3 h-3 mt-0.5 shrink-0" style={{ color: 'rgba(16,185,129,0.6)' }} />
                  <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.40)' }}>
                    <span className="font-semibold" style={{ color: 'rgba(16,185,129,0.7)' }}>Signal used: </span>
                    {script.openingSignal}
                  </p>
                </div>
              )}

              {script.subject && (
                <div className="mb-3 mt-4 px-3 py-2 rounded-lg text-[12px]"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.35)' }}>Subject: </span>
                  <span style={{ color: 'rgba(255,255,255,0.70)' }}>{script.subject}</span>
                </div>
              )}

              {!script.openingSignal && !script.subject && <div className="mt-4" />}

              <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(255,255,255,0.60)' }}>{script.body}</p>

              {/* Sender tip */}
              {script.tip && (
                <div className="flex items-start gap-2 mt-4 px-3 py-2.5 rounded-lg"
                  style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
                  <Zap className="w-3 h-3 mt-0.5 shrink-0" style={{ color: 'rgba(251,191,36,0.7)' }} />
                  <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.40)' }}>
                    <span className="font-semibold" style={{ color: 'rgba(251,191,36,0.8)' }}>Before sending: </span>
                    {script.tip}
                  </p>
                </div>
              )}

              <div className="mt-4 flex justify-end">
                <button onClick={copy}
                  className="flex items-center gap-1.5 font-bold uppercase tracking-wider transition-all"
                  style={{
                    height: '36px',
                    padding: '0 14px',
                    borderRadius: '10px',
                    fontSize: '11px',
                    ...(copied
                      ? { background: 'rgba(16,185,129,0.15)', color: '#10B981', border: '1px solid rgba(16,185,129,0.25)' }
                      : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.09)' })
                  }}>
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const OutreachScripts = ({ scripts, companyName, intel }) => {
  if (!scripts?.length) return (
    <div className="flex items-center justify-center h-96">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}>
          <Mail className="w-6 h-6 text-emerald-400/50" />
        </div>
        <p className="text-[15px] font-bold mb-1" style={{ color: '#F0F0F5' }}>No scripts yet</p>
        <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.40)' }}>Research a prospect first to generate personalized outreach scripts.</p>
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-3xl">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#F0F0F5' }}>Outreach Scripts</h1>
          <p className="text-[13px] mt-0.5" style={{ color: 'rgba(255,255,255,0.40)' }}>
            Personalized for <span className="text-emerald-400 font-semibold">{companyName}</span>
          </p>
        </div>
        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest px-2.5 py-1 rounded-full"
          style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.20)' }}>
          {scripts.length} Scripts
        </span>
      </div>

      {/* Contact card */}
      <ContactCard intel={intel} />

      <div className="flex flex-col gap-2.5">
        {scripts.map((s, i) => <ScriptCard key={i} script={s} index={i} />)}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed px-1" style={{ color: 'rgba(255,255,255,0.25)' }}>
        Scripts are grounded in real-time LinkedIn signals, company news, and Zenduit product intelligence. Review and personalise before sending.
      </p>
    </div>
  );
};

export default OutreachScripts;
