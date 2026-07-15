import DOMPurify from 'dompurify';
import { FileText, ShieldCheck } from 'lucide-react';

const Section = ({ icon: Icon, label, sub, children }) => (
  <div style={{ background: '#fff', border: '1px solid #EAECF0', borderRadius: '12px', overflow: 'hidden' }}>
    <div
      className="flex items-center gap-3 px-5 py-4"
      style={{ borderBottom: '1px solid #EAECF0', background: '#F9FAFB' }}
    >
      <div
        className="flex items-center justify-center rounded-lg shrink-0"
        style={{ width: '32px', height: '32px', background: '#E7F2FA' }}
      >
        <Icon className="w-4 h-4" style={{ color: '#136AB6' }} />
      </div>
      <div>
        <p className="text-[14px] font-semibold" style={{ color: '#101828' }}>{label}</p>
        <p className="text-[12px]" style={{ color: '#667085' }}>{sub}</p>
      </div>
    </div>
    <div className="px-5 py-5 markdown-content">{children}</div>
  </div>
);

const StrategyDisplay = ({ briefing, objections }) => (
  <div className="flex flex-col gap-4">
    <Section icon={FileText} label="Executive briefing" sub="AI-grounded company intelligence">
      <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(briefing) }} />
    </Section>
    <Section icon={ShieldCheck} label="Objection handling" sub="Strategic response playbook">
      <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(objections) }} />
    </Section>
  </div>
);

export default StrategyDisplay;
