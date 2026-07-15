import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, Mail, Phone, MessageCircle, ChevronDown, Zap, Search, User, Briefcase, Truck, Send, X, FlaskConical, Lock } from 'lucide-react';
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
      style={{ width: sz, height: sz, background: copied ? '#ECFDF3' : '#F9FAFB', border: `1px solid ${copied ? '#A6F4C5' : '#EAECF0'}`, color: copied ? '#027A48' : '#667085' }}>
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
    <div className="mb-5 overflow-hidden" style={{ background: '#fff', border: '1px solid #EAECF0', borderRadius: '12px' }}>
      <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid #EAECF0', background: '#F9FAFB' }}>
        <div className="flex items-center justify-center rounded-full shrink-0 text-[13px] font-semibold"
          style={{ width: '38px', height: '38px', background: '#E7F2FA', color: '#0F5795' }}>
          {(name || 'DM').split(' ').map(w => w[0]).join('').slice(0, 2)}
        </div>
        <div>
          <p className="text-[13px] font-semibold" style={{ color: '#101828' }}>{name || 'Decision maker'}</p>
          {title && <p className="text-[12px]" style={{ color: '#667085' }}>{title}</p>}
        </div>
      </div>
      <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-3">
          {email && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: '#667085' }}>Email</p>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 shrink-0" style={{ color: '#136AB6' }} />
                <p className="text-[12px] truncate" style={{ color: '#344054' }}>{email}</p>
                <CopyBtn text={email} />
              </div>
            </div>
          )}
          {phone && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: '#667085' }}>Phone</p>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 shrink-0" style={{ color: '#027A48' }} />
                <p className="text-[12px]" style={{ color: '#344054' }}>{phone}</p>
                <CopyBtn text={phone} />
              </div>
            </div>
          )}
          {platform && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: '#667085' }}>Current platform</p>
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px]"
                style={{ background: '#F9FAFB', border: '1px solid #EAECF0', color: '#344054' }}>
                <Briefcase className="w-3 h-3" />
                {platform}
              </span>
            </div>
          )}
          {fleet && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: '#667085' }}>Fleet size</p>
              <p className="text-[12px]" style={{ color: '#344054' }}>{fleet}</p>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          {roleSub && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: '#667085' }}>Role snapshot</p>
              <p className="text-[12px] leading-relaxed" style={{ color: '#344054' }}>{roleSub}</p>
            </div>
          )}
          {assets.length > 0 && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: '#667085' }}>Trackable assets</p>
              <div className="flex flex-wrap gap-1.5">
                {assets.map((a, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px]"
                    style={{ background: '#ECFDF3', border: '1px solid #A6F4C5', color: '#027A48' }}>
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
               background: '#E7F2FA', color: '#0F5795', border: '1px solid #C8E0F3' }}>
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
    idle:    { background: '#E7F2FA', color: '#0F5795', border: '1px solid #C8E0F3' },
    sending: { background: '#E7F2FA', color: '#0F5795', border: '1px solid #C8E0F3', opacity: 0.7 },
    sent:    { background: '#ECFDF3', color: '#027A48', border: '1px solid #A6F4C5' },
    error:   { background: '#FEF3F2', color: '#B42318', border: '1px solid #FECDCA' },
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
    <div className="overflow-hidden" style={{ background: '#fff', border: '1px solid #EAECF0', borderRadius: '12px' }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 text-left px-5 py-4">
        <div className="flex items-center justify-center rounded-lg shrink-0"
          style={{ width: '36px', height: '36px', background: '#E7F2FA' }}>
          <Icon className="w-4 h-4" style={{ color: '#136AB6' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13px] font-semibold" style={{ color: '#101828' }}>{script.type}</p>
            {script.framework && (
              <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{ background: '#F9FAFB', color: '#667085', border: '1px solid #EAECF0' }}>
                {script.framework}
              </span>
            )}
          </div>
          {script.subject && <p className="text-[11px] truncate mt-0.5" style={{ color: '#667085' }}>{script.subject}</p>}
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.18 }}>
          <ChevronDown className="w-4 h-4" style={{ color: '#98A2B3' }} />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }} className="overflow-hidden">
            <div style={{ padding: '0 24px 24px', borderTop: '1px solid #EAECF0' }}>
              {script.openingSignal && !['unknown', 'signal used', 'n/a', 'none'].includes(script.openingSignal.toLowerCase().trim()) && (
                <div className="flex items-start gap-2 mt-4 mb-3 px-3 py-2.5 rounded-lg"
                  style={{ background: '#E7F2FA', border: '1px solid #C8E0F3' }}>
                  <Search className="w-3 h-3 mt-0.5 shrink-0" style={{ color: '#136AB6' }} />
                  <p className="text-[12px] leading-relaxed" style={{ color: '#344054' }}>
                    <span className="font-medium" style={{ color: '#0F5795' }}>Signal: </span>{script.openingSignal}
                  </p>
                </div>
              )}
              {script.subject && (
                <div className="mb-3 mt-4 px-3 py-2 rounded-lg"
                  style={{ background: '#F9FAFB', border: '1px solid #EAECF0', fontSize: '13px' }}>
                  <span className="font-medium" style={{ color: '#667085' }}>Subject: </span>
                  <span style={{ color: '#344054' }}>{script.subject}</span>
                </div>
              )}
              {!script.openingSignal && !script.subject && <div className="mt-4" />}

              <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: '#344054' }}>{script.body}</p>

              {script.tip && (
                <div className="flex items-start gap-2 mt-4 px-3 py-2.5 rounded-lg"
                  style={{ background: '#FFFAEB', border: '1px solid #FEDF89' }}>
                  <Zap className="w-3 h-3 mt-0.5 shrink-0" style={{ color: '#B54708' }} />
                  <p className="text-[12px] leading-relaxed" style={{ color: '#344054' }}>
                    <span className="font-medium" style={{ color: '#B54708' }}>Before sending: </span>{script.tip}
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
                      ? { background: '#ECFDF3', color: '#027A48', border: '1px solid #A6F4C5' }
                      : { background: '#fff', color: '#344054', border: '1px solid #D0D5DD' }),
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
  A: { bg: '#E7F2FA', bd: '#C8E0F3', fg: '#0F5795' },
  B: { bg: '#ECFDF3', bd: '#A6F4C5', fg: '#027A48' },
  C: { bg: '#FFFAEB', bd: '#FEDF89', fg: '#B54708' },
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
    <div className="overflow-hidden" style={{ background: '#fff', border: '1px solid #EAECF0', borderRadius: '12px' }}>
      <div className="flex items-center gap-3 px-5 py-3.5" style={{ borderBottom: '1px solid #EAECF0' }}>
        <div className="flex items-center justify-center rounded-lg shrink-0 text-[13px] font-bold"
          style={{ width: '30px', height: '30px', background: c.bg, border: `1px solid ${c.bd}`, color: c.fg }}>
          {variant.variant}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium truncate" style={{ color: '#101828' }}>{variant.subject || 'Opener'}</p>
          {variant.angle && <p className="text-[11px] truncate" style={{ color: '#667085' }}>{variant.angle}</p>}
        </div>
        <CopyBtn text={variant.subject ? `Subject: ${variant.subject}\n\n${variant.body}` : variant.body} />
      </div>
      <div className="px-5 py-4">
        <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: '#344054' }}>{variant.body}</p>
        <div className="mt-4 flex items-center justify-end">
          <button onClick={logSent} disabled={!companyName || logState === 'logging'}
            className="flex items-center gap-1.5 rounded-lg transition-colors"
            title={companyName ? `Log variant ${variant.variant} as sent to ${companyName}` : 'Research a prospect first'}
            style={{
              height: '32px', padding: '0 12px', fontSize: '11.5px', fontWeight: 500,
              cursor: companyName ? 'pointer' : 'not-allowed',
              ...(logState === 'logged'
                ? { background: '#ECFDF3', color: '#027A48', border: '1px solid #A6F4C5' }
                : logState === 'error'
                ? { background: '#FEF3F2', color: '#B42318', border: '1px solid #FECDCA' }
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
        <FlaskConical className="w-4 h-4" style={{ color: '#136AB6' }} />
        <h2 className="text-[14px] font-semibold" style={{ color: '#101828' }}>A/B opener variants</h2>
        <span className="text-[12px]" style={{ color: '#667085' }}>· rotate &amp; track which converts</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {variants.map((v, i) => <VariantCard key={i} variant={v} companyName={companyName} />)}
      </div>
    </div>
  );
};

const OutreachScripts = ({ scripts, variants, companyName, intel, linkedInContactUrl }) => {
  if (!scripts?.length && !variants?.length) return (
    <div className="flex flex-col items-center justify-center text-center gap-2.5"
      style={{ padding: '100px 24px', background: '#fff', border: '1px dashed #D0D5DD', borderRadius: '12px' }}>
      <div className="flex items-center justify-center rounded-xl mb-1"
        style={{ width: '48px', height: '48px', background: '#F2F4F7' }}>
        <Lock className="w-5 h-5" style={{ color: '#98A2B3' }} />
      </div>
      <p className="text-[15px] font-semibold" style={{ color: '#475467' }}>Scripts are locked</p>
      <p className="text-[13px] max-w-xs" style={{ color: '#667085' }}>
        Run the Intelligence pipeline for a lead first — scripts are generated from that research.
      </p>
    </div>
  );

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[16px] font-semibold" style={{ color: '#101828' }}>Outreach scripts</h1>
          <p className="text-[13px] mt-1" style={{ color: '#667085' }}>
            Personalized from the research briefing for <span className="font-medium" style={{ color: '#136AB6' }}>{companyName}</span>.
          </p>
        </div>
        <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full"
          style={{ background: '#E7F2FA', color: '#0F5795' }}>
          {scripts?.length || 0} scripts
        </span>
      </div>
      <ContactCard intel={intel} />
      <VariantsSection variants={variants} companyName={companyName} />
      <div className="flex flex-col gap-2">
        {(scripts || []).map((s, i) => <ScriptCard key={i} script={s} index={i} linkedInContactUrl={linkedInContactUrl} />)}
      </div>
      <p className="mt-5 text-[12px] leading-relaxed" style={{ color: '#667085' }}>
        Scripts are grounded in real-time web signals and Zenduit product intelligence. Review before sending.
      </p>
    </div>
  );
};

export default OutreachScripts;
