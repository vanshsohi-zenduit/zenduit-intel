import { FileText, ShieldCheck } from 'lucide-react';

const Section = ({ icon: Icon, label, sub, children }) => (
  <div className="overflow-hidden"
    style={{
      borderRadius: '20px',
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderLeft: '3px solid #10B981',
    }}>
    {/* Header */}
    <div className="flex items-center gap-3 px-6 py-5"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.025)' }}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.20)' }}>
        <Icon className="w-4 h-4 text-emerald-400" />
      </div>
      <div>
        <p className="text-[14px] font-bold leading-none" style={{ color: '#F0F0F5' }}>{label}</p>
        <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.30)' }}>{sub}</p>
      </div>
    </div>
    {/* Content */}
    <div className="px-6 py-5 markdown-content">
      {children}
    </div>
  </div>
);

const StrategyDisplay = ({ briefing, objections }) => (
  <div className="flex flex-col gap-4">
    <Section icon={FileText} label="Executive Briefing" sub="AI-grounded company intelligence">
      <div dangerouslySetInnerHTML={{ __html: briefing }} />
    </Section>
    <Section icon={ShieldCheck} label="Objection Handling" sub="Strategic response playbook">
      <div dangerouslySetInnerHTML={{ __html: objections }} />
    </Section>
  </div>
);

export default StrategyDisplay;
