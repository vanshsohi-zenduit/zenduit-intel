import { useState, useEffect } from 'react';
import { Globe, Search, Trash2, Target, User } from 'lucide-react';
import LinkedInIcon from './LinkedInIcon.jsx';
import { fetchReps } from '../lib/mcpClient.js';

const GOALS = ['Fleet Visibility', 'Safety & Compliance', 'Downtime Reduction', 'Data Centralization'];

const ProspectInput = ({ onGenerate }) => {
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [websiteUrl,  setWebsiteUrl]  = useState('');
  const [companyName, setCompanyName] = useState('');
  const [selectedRep, setSelectedRep] = useState(null);
  const [reps,        setReps]        = useState([]);
  const [repQuery,    setRepQuery]    = useState('');
  const [showRepList, setShowRepList] = useState(false);

  useEffect(() => {
    fetchReps().then(setReps).catch(() => {});
  }, []);

  const canGenerate = !!(companyName.trim());

  const filteredReps = repQuery.trim()
    ? reps.filter(r => r.name.toLowerCase().includes(repQuery.toLowerCase()))
    : reps;

  const fieldStyle = {
    height: '44px',
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    color: '#0f172a',
    outline: 'none',
    width: '100%',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  };

  const onFocus = e => {
    e.target.style.borderColor = 'rgba(37,99,235,0.60)';
    e.target.style.boxShadow   = '0 0 0 3px rgba(37,99,235,0.10)';
  };
  const onBlur = e => {
    e.target.style.borderColor = '#e2e8f0';
    e.target.style.boxShadow   = 'none';
  };

  const handleGenerate = () => {
    onGenerate({ linkedinUrl, websiteUrl, companyName, assignedRep: selectedRep });
  };

  return (
    <div className="flex flex-col gap-4">

      <div className="card p-6 flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center rounded-lg shrink-0"
            style={{ width: '36px', height: '36px', background: 'rgba(37,99,235,0.10)', border: '1px solid rgba(37,99,235,0.20)' }}
          >
            <Target className="w-4 h-4" style={{ color: '#2563eb' }} />
          </div>
          <div>
            <p className="text-[14px] font-semibold" style={{ color: '#0f172a' }}>Target Prospect</p>
            <p className="text-[12px]" style={{ color: '#64748b' }}>Enter details to trigger research pipeline</p>
          </div>
        </div>

        <div className="h-px" style={{ background: '#e2e8f0' }} />

        {[
          { label: 'Company Name',     placeholder: 'Werner Enterprises',   value: companyName, onChange: setCompanyName, icon: null,        optional: false },
          { label: 'Company Website',  placeholder: 'https://company.com',  value: websiteUrl,  onChange: setWebsiteUrl,  icon: Globe,       optional: true  },
          { label: 'LinkedIn Profile', placeholder: 'linkedin.com/in/name', value: linkedinUrl, onChange: setLinkedinUrl, icon: LinkedInIcon, optional: true  },
        ].map(f => (
          <div key={f.label} className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium" style={{ color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {f.label}
              {f.optional && <span className="ml-1.5 normal-case font-normal" style={{ color: '#94a3b8' }}>— optional</span>}
            </label>
            <div className="relative">
              {f.icon && (
                <f.icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#94a3b8' }} />
              )}
              <input
                type="text"
                placeholder={f.placeholder}
                value={f.value}
                onChange={e => f.onChange(e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
                style={{ ...fieldStyle, paddingLeft: f.icon ? '36px' : '12px', paddingRight: '12px' }}
              />
            </div>
          </div>
        ))}

        {/* Rep selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium" style={{ color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Assign to Rep
            <span className="ml-1.5 normal-case font-normal" style={{ color: '#94a3b8' }}>— optional</span>
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#94a3b8' }} />
            <input
              type="text"
              placeholder={selectedRep ? selectedRep.name : 'Search rep name…'}
              value={selectedRep ? selectedRep.name : repQuery}
              onChange={e => { setRepQuery(e.target.value); setSelectedRep(null); setShowRepList(true); }}
              onFocus={e => { setShowRepList(true); onFocus(e); }}
              onBlur={e => { setTimeout(() => setShowRepList(false), 150); onBlur(e); }}
              style={{ ...fieldStyle, paddingLeft: '36px', paddingRight: selectedRep ? '32px' : '12px' }}
            />
            {selectedRep && (
              <button
                onClick={() => { setSelectedRep(null); setRepQuery(''); }}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '16px' }}
              >×</button>
            )}
            {showRepList && filteredReps.length > 0 && !selectedRep && (
              <div style={{
                position: 'absolute', top: '48px', left: 0, right: 0, zIndex: 50,
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px',
                boxShadow: '0 4px 16px rgba(0,0,0,.12)', maxHeight: '200px', overflowY: 'auto',
              }}>
                {filteredReps.slice(0, 30).map(r => (
                  <button
                    key={r.id}
                    onMouseDown={() => { setSelectedRep({ name: r.name, clickupMemberId: r.id }); setRepQuery(''); setShowRepList(false); }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '9px 14px', fontSize: '13px', color: '#0f172a',
                      background: 'none', border: 'none', cursor: 'pointer',
                      borderBottom: '1px solid #f1f5f9',
                    }}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg text-[14px] font-medium transition-opacity active:scale-[0.99]"
            style={{
              height: '44px',
              background: canGenerate ? '#2563eb' : 'rgba(0,0,0,0.05)',
              color:      canGenerate ? '#fff'    : '#94a3b8',
              border:     canGenerate ? 'none'    : '1px solid #e2e8f0',
              cursor:     canGenerate ? 'pointer' : 'not-allowed',
              opacity:    canGenerate ? 1         : 0.5,
            }}
          >
            <Search className="w-4 h-4" strokeWidth={2} />
            Generate Strategy
          </button>
          <button
            onClick={() => { setLinkedinUrl(''); setWebsiteUrl(''); setCompanyName(''); setSelectedRep(null); setRepQuery(''); }}
            title="Clear fields"
            style={{
              width: '44px', height: '44px', flexShrink: 0,
              background: 'rgba(0,0,0,0.04)',
              border: '1px solid #e2e8f0',
              borderRadius: '8px', color: '#94a3b8', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="card p-5">
        <p className="text-[11px] font-medium uppercase tracking-wider mb-3" style={{ color: '#94a3b8' }}>Targeting Goals</p>
        <div className="grid grid-cols-2 gap-2">
          {GOALS.map(g => (
            <div
              key={g}
              className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.14)' }}
            >
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#2563eb' }} />
              <span className="text-[12px]" style={{ color: '#64748b' }}>{g}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProspectInput;
