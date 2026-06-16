import DOMPurify from 'dompurify';
import { FileText, ShieldCheck } from 'lucide-react';

const Section = ({ icon: Icon, label, sub, children }) => (
  <div className="card overflow-hidden" style={{ borderTop: '2px solid #2563eb' }}>
    <div
      className="flex items-center gap-3 px-6 py-4"
      style={{ borderBottom: '1px solid #e2e8f0', background: 'rgba(0,0,0,0.01)' }}
    >
      <div
        className="flex items-center justify-center rounded-lg shrink-0"
        style={{ width: '32px', height: '32px', background: 'rgba(37,99,235,0.10)', border: '1px solid rgba(37,99,235,0.18)' }}
      >
        <Icon className="w-4 h-4" style={{ color: '#2563eb' }} />
      </div>
      <div>
        <p className="text-[14px] font-semibold" style={{ color: '#0f172a' }}>{label}</p>
        <p className="text-[12px]" style={{ color: '#64748b' }}>{sub}</p>
      </div>
    </div>
    <div className="px-6 py-6 markdown-content">{children}</div>
  </div>
);

const StrategyDisplay = ({ briefing, objections }) => (
  <div className="flex flex-col gap-4">
    <Section icon={FileText} label="Executive Briefing" sub="AI-grounded company intelligence">
      <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(briefing) }} />
    </Section>
    <Section icon={ShieldCheck} label="Objection Handling" sub="Strategic response playbook">
      <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(objections) }} />
    </Section>
  </div>
);

export default StrategyDisplay;
