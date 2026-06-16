import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, Mail, Phone, MessageCircle, ChevronDown, Zap, Search, User, Briefcase, Truck, Send, X, FlaskConical } from 'lucide-react';
import LinkedInIcon from './LinkedInIcon.jsx';
import { saveOutcome } from '../lib/mcpClient.js';

const TYPE_ICON = {
  'LinkedIn Connection': LinkedInIcon,
  'LinkedIn Follow-up':  LinkedInIcon,
  'Cold Email #1':       Mail,
  'Cold Email #2':       Mail,
  'Cold Email':          Mail,
  'Cold Call Script':    Phone,
  'Message':             MessageCircle,
};

const val    = v => (v && v.trim() !== '' && v.toLowerCase() !== 'unknown' && v.toLowerCase() !== 'n/a') ? v : null;
const arrVal = a => Array.isArray(a) ? a.filter(v => val(v)) : [];

const CopyBtn = ({ text, size = 'sm' }) => {
  const [copied, setCopied] = useState(false);
  const copy = e => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const sz = size === 'sm' ? '22px' : '28px';
  return (
    <button onClick={copy} className="flex items-center justify-center rounded shrink-0"
      style={{ width: sz, height: sz, background: copied ? 'rgba(16,185,129,0.10)' : 'rgba(0,0,0,0.04)', border: `1px solid ${copied ? 'rgba(16,185,129,0.22)' : '#e2e8f0'}`, color: copied ? '#10B981' : '#64748b' }}>
      {copied ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
    </button>
  );
};

export const ContactCard = ({ intel }) => {
  if (!intel) return null;
  const name     = val(intel.contactName);
  const title    = val(intel.contactTitle);
  const email    = val(intel.contactEmail);
  const phone    = val(intel.contactPhone);
  const roleSub  = val(intel.contactRoleSummary);
  const platform = val(intel.currentFleetPlatform);
  const assets   = arrVal(intel.trackableAssets);
  const fleet    = val(intel.fleetSize);
  if (!name && !email && !phone && !platform && !assets.length) return null;

  return (
    <div className="card mb-5 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid #e2e8f0', background: 'rgba(0,0,0,0.01)' }}>
        <div className="flex items-center justify-center rounded-lg shrink-0"
          style={{ width: '32px', height: '32px', background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.18)' }}>
          <User className="w-4 h-4" style={{ color: '#2563eb' }} />
        </div>
        <div>
          <p className="text-[13px] font-semibold" style={{ color: '#0f172a' }}>{name || 'Decision Maker'}</p>
          {title && <p className="text-[12px]" style={{ color: '#64748b' }}>{title}</p>}
        </div>
      </div>
      <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-3">
          {email && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: '#64748b' }}>Email</p>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 shrink-0" style={{ color: '#2563eb' }} />
                <p className="text-[12px] truncate" style={{ color: '#374151' }}>{email}</p>
                <CopyBtn text={email} />
              </div>
            </div>
          )}
          {phone && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: '#64748b' }}>Phone</p>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 shrink-0" style={{ color: '#d97706' }} />
                <p className="text-[12px]" style={{ color: '#374151' }}>{phone}</p>
                <CopyBtn text={phone} />
              </div>
            </div>
          )}
          {platform && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: '#64748b' }}>Current Platform</p>
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px]"
                style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#374151' }}>
                <Briefcase className="w-3 h-3" />
                {platform}
              </span>
            </div>
          )}
          {fleet && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: '#64748b' }}>Fleet Size</p>
              <p className="text-[12px]" style={{ color: '#374151' }}>{fleet}</p>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          {roleSub && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: '#64748b' }}>Role Snapshot</p>
              <p className="text-[12px] leading-relaxed" style={{ color: '#374151' }}>{roleSub}</p>
            </div>
          )}
          {assets.length > 0 && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: '#64748b' }}>Trackable Assets</p>
              <div className="flex flex-wrap gap-1.5">
                {assets.map((a, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px]"
                    style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.18)', color: '#059669' }}>
                    <Truck className="w-2.5 h-2.5" />{a}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const SendLinkedInBtn = ({ profileUrl, message }) => {
  const [status, setStatus] = useState('idle');

  if (!profileUrl) return (
    <button disabled title="No LinkedIn profile URL found for this contact"
      className="flex items-center gap-1.5 rounded-lg"
      style={{ height: '36px', padding: '0 14px', fontSize: '12px', opacity: 0.35, cursor: 'not-allowed',
               background: 'rgba(10,102,194,0.06)', color: '#0A66C2', border: '1px solid rgba(10,102,194,0.16)' }}>
      <LinkedInIcon className="w-3.5 h-3.5" /> Send
    </button>
  );

  const send = async (e) => {
    e.stopPropagation();
    setStatus('sending');
    try {
      const res = await fetch('/api/linkedin/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileUrl, message }),
      });
      if (!res.ok) throw new Error(await res.text());
      setStatus('sent');
      setTimeout(() => setStatus('idle'), 3000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const styles = {
    idle:    { background: 'rgba(10,102,194,0.08)',  color: '#0A66C2', border: '1px solid rgba(10,102,194,0.20)' },
    sending: { background: 'rgba(10,102,194,0.08)',  color: '#0A66C2', border: '1px solid rgba(10,102,194,0.20)', opacity: 0.7 },
    sent:    { background: 'rgba(16,185,129,0.10)',  color: '#059669', border: '1px solid rgba(16,185,129,0.22)' },
    error:   { background: 'rgba(220,38,38,0.08)',   color: '#dc2626', border: '1px solid rgba(220,38,38,0.20)' },
  };

  return (
    <button onClick={send} disabled={status === 'sending'}
      className="flex items-center gap-1.5 rounded-lg transition-colors"
      style={{ height: '36px', padding: '0 14px', fontSize: '12px', ...styles[status] }}>
      {status === 'idle'    && <><LinkedInIcon className="w-3.5 h-3.5" /> Send</>}
      {status === 'sending' && <><Send className="w-3.5 h-3.5 animate-pulse" /> Sending…</>}
      {status === 'sent'    && <><Check className="w-3.5 h-3.5" /> Sent!</>}
      {status === 'error'   && <><X className="w-3.5 h-3.5" /> Failed</>}
    </button>
  );
};

const isLinkedInScript = type => type?.startsWith('LinkedIn');

const ScriptCard = ({ script, index, linkedInContactUrl }) => {
  const [copied, setCopied] = useState(false);
  const [open,   setOpen]   = useState(index === 0);
  const Icon = TYPE_ICON[script.type] || MessageCircle;

  const copy = () => {
    navigator.clipboard.writeText(script.subject ? `Subject: ${script.subject}\n\n${script.body}` : script.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 text-left px-5 py-4">
        <div className="flex items-center justify-center rounded-lg shrink-0"
          style={{ width: '36px', height: '36px', background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.16)' }}>
          <Icon className="w-4 h-4" style={{ color: '#2563eb' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13px] font-medium" style={{ color: '#0f172a' }}>{script.type}</p>
            {script.framework && (
              <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{ background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' }}>
                {script.framework}
              </span>
            )}
          </div>
          {script.subject && <p className="text-[11px] truncate mt-0.5" style={{ color: '#64748b' }}>{script.subject}</p>}
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.18 }}>
          <ChevronDown className="w-4 h-4" style={{ color: '#94a3b8' }} />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }} className="overflow-hidden">
            <div style={{ padding: '0 24px 24px', borderTop: '1px solid #e2e8f0' }}>
              {script.openingSignal && !['unknown', 'signal used', 'n/a', 'none'].includes(script.openingSignal.toLowerCase().trim()) && (
                <div className="flex items-start gap-2 mt-4 mb-3 px-3 py-2.5 rounded-lg"
                  style={{ background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.12)' }}>
                  <Search className="w-3 h-3 mt-0.5 shrink-0" style={{ color: '#2563eb' }} />
                  <p className="text-[12px] leading-relaxed" style={{ color: '#374151' }}>
                    <span className="font-medium" style={{ color: '#2563eb' }}>Signal: </span>{script.openingSignal}
                  </p>
                </div>
              )}
              {script.subject && (
                <div className="mb-3 mt-4 px-3 py-2 rounded-lg"
                  style={{ background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                  <span className="font-medium" style={{ color: '#64748b' }}>Subject: </span>
                  <span style={{ color: '#374151' }}>{script.subject}</span>
                </div>
              )}
              {!script.openingSignal && !script.subject && <div className="mt-4" />}

              <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: '#374151' }}>{script.body}</p>

              {script.tip && (
                <div className="flex items-start gap-2 mt-4 px-3 py-2.5 rounded-lg"
                  style={{ background: 'rgba(217,119,6,0.05)', border: '1px solid rgba(217,119,6,0.14)' }}>
                  <Zap className="w-3 h-3 mt-0.5 shrink-0" style={{ color: '#d97706' }} />
                  <p className="text-[12px] leading-relaxed" style={{ color: '#374151' }}>
                    <span className="font-medium" style={{ color: '#d97706' }}>Before sending: </span>{script.tip}
                  </p>
                </div>
              )}

              <div className="mt-4 flex items-center justify-end gap-2">
                {isLinkedInScript(script.type) && (
                  <SendLinkedInBtn profileUrl={linkedInContactUrl} message={script.body} />
                )}
                <button onClick={copy} className="flex items-center gap-1.5 rounded-lg transition-colors"
                  style={{
                    height: '36px', padding: '0 14px', fontSize: '12px',
                    ...(copied
                      ? { background: 'rgba(16,185,129,0.10)', color: '#059669', border: '1px solid rgba(16,185,129,0.22)' }
                      : { background: 'rgba(0,0,0,0.04)', color: '#64748b', border: '1px solid #e2e8f0' }),
                  }}>
                  {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const VARIANT_COLORS = {
  A: { bg: 'rgba(37,99,235,0.08)',  bd: 'rgba(37,99,235,0.20)',  fg: '#2563eb' },
  B: { bg: 'rgba(16,185,129,0.08)', bd: 'rgba(16,185,129,0.20)', fg: '#059669' },
  C: { bg: 'rgba(217,119,6,0.08)',  bd: 'rgba(217,119,6,0.20)',  fg: '#d97706' },
};

const VariantCard = ({ variant, companyName }) => {
  const [copied, setCopied] = useState(false);
  const [logState, setLogState] = useState('idle'); // idle | logging | logged | error
  const c = VARIANT_COLORS[variant.variant] || VARIANT_COLORS.A;

  const copy = () => {
    navigator.clipboard.writeText(variant.subject ? `Subject: ${variant.subject}\n\n${variant.body}` : variant.body);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const logSent = async () => {
    if (!companyName) return;
    setLogState('logging');
    try {
      await saveOutcome({ company: companyName, channel: 'Email', variant: variant.variant, status: 'SENT' });
      setLogState('logged'); setTimeout(() => setLogState('idle'), 3000);
    } catch {
      setLogState('error'); setTimeout(() => setLogState('idle'), 3000);
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5" style={{ borderBottom: '1px solid #e2e8f0' }}>
        <div className="flex items-center justify-center rounded-lg shrink-0 text-[13px] font-bold"
          style={{ width: '30px', height: '30px', background: c.bg, border: `1px solid ${c.bd}`, color: c.fg }}>
          {variant.variant}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium truncate" style={{ color: '#0f172a' }}>{variant.subject || 'Opener'}</p>
          {variant.angle && <p className="text-[11px] truncate" style={{ color: '#64748b' }}>{variant.angle}</p>}
        </div>
        <CopyBtn text={variant.subject ? `Subject: ${variant.subject}\n\n${variant.body}` : variant.body} />
      </div>
      <div className="px-5 py-4">
        <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: '#374151' }}>{variant.body}</p>
        <div className="mt-4 flex items-center justify-end">
          <button onClick={logSent} disabled={!companyName || logState === 'logging'}
            className="flex items-center gap-1.5 rounded-lg transition-colors"
            title={companyName ? `Log variant ${variant.variant} as sent to ${companyName}` : 'Research a prospect first'}
            style={{
              height: '32px', padding: '0 12px', fontSize: '11.5px', fontWeight: 500,
              cursor: companyName ? 'pointer' : 'not-allowed',
              ...(logState === 'logged'
                ? { background: 'rgba(16,185,129,0.10)', color: '#059669', border: '1px solid rgba(16,185,129,0.22)' }
                : logState === 'error'
                ? { background: 'rgba(220,38,38,0.08)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.20)' }
                : { background: c.bg, color: c.fg, border: `1px solid ${c.bd}`, opacity: companyName ? 1 : 0.4 }),
            }}>
            {logState === 'logged' ? <><Check className="w-3.5 h-3.5" /> Logged</>
              : logState === 'error' ? <><X className="w-3.5 h-3.5" /> Failed</>
              : logState === 'logging' ? <><Send className="w-3.5 h-3.5 animate-pulse" /> Logging…</>
              : <><Send className="w-3.5 h-3.5" /> Log as sent</>}
          </button>
        </div>
      </div>
    </div>
  );
};

const VariantsSection = ({ variants, companyName }) => {
  if (!variants?.length) return null;
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <FlaskConical className="w-4 h-4" style={{ color: '#2563eb' }} />
        <h2 className="text-[14px] font-semibold" style={{ color: '#0f172a' }}>A/B Opener Variants</h2>
        <span className="text-[11px]" style={{ color: '#64748b' }}>· rotate &amp; track which converts</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {variants.map((v, i) => <VariantCard key={i} variant={v} companyName={companyName} />)}
      </div>
    </div>
  );
};

const OutreachScripts = ({ scripts, variants, companyName, intel, linkedInContactUrl }) => {
  if (!scripts?.length && !variants?.length) return (
    <div className="flex items-center justify-center h-80">
      <div className="text-center">
        <div className="flex items-center justify-center rounded-xl mx-auto mb-4"
          style={{ width: '48px', height: '48px', background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.16)' }}>
          <Mail className="w-5 h-5" style={{ color: '#2563eb' }} />
        </div>
        <p className="text-[15px] font-semibold mb-1" style={{ color: '#0f172a' }}>No scripts yet</p>
        <p className="text-[13px]" style={{ color: '#64748b' }}>Research a prospect first to generate personalized outreach scripts.</p>
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#0f172a' }}>Outreach Scripts</h1>
          <p className="text-[13px] mt-1" style={{ color: '#64748b' }}>
            Personalized for <span className="font-medium" style={{ color: '#2563eb' }}>{companyName}</span>
          </p>
        </div>
        <span className="text-[11px] font-medium px-2.5 py-1 rounded-full"
          style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.18)', color: '#2563eb' }}>
          {scripts?.length || 0} scripts
        </span>
      </div>
      <ContactCard intel={intel} />
      <VariantsSection variants={variants} companyName={companyName} />
      <div className="flex flex-col gap-2">
        {(scripts || []).map((s, i) => <ScriptCard key={i} script={s} index={i} linkedInContactUrl={linkedInContactUrl} />)}
      </div>
      <p className="mt-5 text-[12px] leading-relaxed" style={{ color: '#64748b' }}>
        Scripts are grounded in real-time web signals and Zenduit product intelligence. Review before sending.
      </p>
    </div>
  );
};

export default OutreachScripts;
