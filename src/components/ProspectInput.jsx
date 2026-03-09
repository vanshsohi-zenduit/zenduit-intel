import { useState } from 'react';
import { Globe, Search, Trash2, ShieldCheck, Target } from 'lucide-react';
import LinkedInIcon from './LinkedInIcon.jsx';

const GOALS = ['Fleet Visibility', 'Safety & Compliance', 'Downtime Reduction', 'Data Centralization'];

const inputBase = {
  height: '44px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: '12px',
  fontSize: '14px',
  color: '#F0F0F5',
  outline: 'none',
  width: '100%',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

const ProspectInput = ({ onGenerate }) => {
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [websiteUrl,  setWebsiteUrl]  = useState('');
  const [companyName, setCompanyName] = useState('');

  const canGenerate = !!(websiteUrl.trim() || companyName.trim());

  const handleFocus = (e) => {
    e.target.style.borderColor = 'rgba(16,185,129,0.6)';
    e.target.style.boxShadow   = '0 0 0 3px rgba(16,185,129,0.10)';
  };
  const handleBlur = (e) => {
    e.target.style.borderColor = 'rgba(255,255,255,0.10)';
    e.target.style.boxShadow   = 'none';
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Main input card */}
      <div className="flex flex-col gap-5"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '24px' }}>

        {/* Card header with left-border accent */}
        <div className="flex items-center gap-3 pl-3"
          style={{ borderLeft: '4px solid #10B981', borderRadius: '0 0 4px 4px' }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.22)' }}>
            <Target className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-[14px] font-bold" style={{ color: '#F0F0F5' }}>Target Prospect</p>
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Enter details to trigger research pipeline</p>
          </div>
        </div>

        {/* Fields */}
        {[
          { label: 'Company Name',    placeholder: 'Werner Enterprises',    value: companyName, onChange: setCompanyName, icon: null,        optional: false },
          { label: 'Company Website', placeholder: 'https://company.com',   value: websiteUrl,  onChange: setWebsiteUrl,  icon: Globe,       optional: false },
          { label: 'LinkedIn Profile',placeholder: 'linkedin.com/in/name',  value: linkedinUrl, onChange: setLinkedinUrl, icon: LinkedInIcon, optional: true  },
        ].map(f => (
          <div key={f.label}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.40)', marginBottom: '8px' }}>
              {f.label}{f.optional && <span style={{ marginLeft: '4px', textTransform: 'none', color: 'rgba(255,255,255,0.22)', fontWeight: 400 }}>(optional)</span>}
            </label>
            <div className="relative">
              {f.icon && <f.icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'rgba(255,255,255,0.25)' }} />}
              <input
                type="text"
                placeholder={f.placeholder}
                value={f.value}
                onChange={e => f.onChange(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={{ ...inputBase, paddingLeft: f.icon ? '40px' : '14px', paddingRight: '14px' }}
              />
            </div>
          </div>
        ))}

        {/* CTA row */}
        <div className="flex gap-2">
          <button
            onClick={() => onGenerate({ linkedinUrl, websiteUrl, companyName })}
            disabled={!canGenerate}
            className="flex-1 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            style={{
              height: '44px',
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: 700,
              color: '#fff',
              boxShadow: canGenerate ? '0 4px 20px rgba(16,185,129,0.25)' : 'none',
              opacity: canGenerate ? 1 : 0.35,
              cursor: canGenerate ? 'pointer' : 'not-allowed',
              border: 'none',
            }}
          >
            <Search className="w-4 h-4" strokeWidth={2.5} />
            Generate Strategy
          </button>
          <button
            onClick={() => { setLinkedinUrl(''); setWebsiteUrl(''); setCompanyName(''); }}
            className="flex items-center justify-center transition-colors"
            style={{ width: '44px', height: '44px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '12px', color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}
            onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}>
            <Trash2 className="w-4 h-4" style={{ color: 'inherit' }} />
          </button>
        </div>
      </div>

      {/* Goals card */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '20px 24px' }}>
        <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.40)', marginBottom: '14px' }}>Targeting Goals</p>
        <div className="grid grid-cols-2 gap-2">
          {GOALS.map(g => (
            <div key={g} className="flex items-center gap-2 px-3 py-2 rounded-full"
              style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)' }}>
              <ShieldCheck className="w-3 h-3 shrink-0" style={{ color: 'rgba(16,185,129,0.60)' }} />
              <span style={{ fontSize: '11px', color: 'rgba(16,185,129,0.75)', fontWeight: 500 }}>{g}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProspectInput;
