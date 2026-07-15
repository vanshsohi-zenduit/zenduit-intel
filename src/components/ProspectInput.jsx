import { useState, useEffect } from 'react';
import { Globe, Zap, Trash2, User } from 'lucide-react';
import LinkedInIcon from './LinkedInIcon.jsx';
import { fetchReps } from '../lib/mcpClient.js';

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
    height: '40px',
    background: '#ffffff',
    border: '1px solid #D0D5DD',
    borderRadius: '8px',
    fontSize: '14px',
    color: '#101828',
    outline: 'none',
    width: '100%',
    boxShadow: '0 1px 2px rgba(16,24,40,.05)',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    fontFamily: 'var(--font-sans)',
  };

  const onFocus = e => {
    e.target.style.borderColor = '#136AB6';
    e.target.style.boxShadow   = '0 0 0 4px rgba(19,106,182,0.16)';
  };
  const onBlur = e => {
    e.target.style.borderColor = '#D0D5DD';
    e.target.style.boxShadow   = '0 1px 2px rgba(16,24,40,.05)';
  };

  const handleGenerate = () => {
    onGenerate({ linkedinUrl, websiteUrl, companyName, assignedRep: selectedRep });
  };

  const Label = ({ children, optional }) => (
    <label className="text-[13px] font-medium block mb-1.5" style={{ color: '#344054' }}>
      {children}
      {optional && <span className="ml-1 font-normal" style={{ color: '#98A2B3' }}>(optional)</span>}
    </label>
  );

  return (
    <div
      className="w-full lg:w-[360px] shrink-0"
      style={{ background: '#fff', border: '1px solid #EAECF0', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 2px rgba(16,24,40,.06)' }}
    >
      <div className="text-[16px] font-semibold" style={{ color: '#101828', marginBottom: '2px' }}>New research</div>
      <div className="text-[13px]" style={{ color: '#667085', marginBottom: '18px' }}>Run the AI pipeline on a prospect company.</div>

      <div className="flex flex-col gap-3.5">
        <div>
          <Label>Company name <span style={{ color: '#D92D20' }}>*</span></Label>
          <input
            type="text" placeholder="e.g. Meridian Freight Group"
            value={companyName} onChange={e => setCompanyName(e.target.value)}
            onFocus={onFocus} onBlur={onBlur}
            style={{ ...fieldStyle, padding: '0 12px' }}
          />
        </div>

        <div>
          <Label optional>Website URL</Label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#98A2B3' }} />
            <input
              type="text" placeholder="www.example.com"
              value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)}
              onFocus={onFocus} onBlur={onBlur}
              style={{ ...fieldStyle, paddingLeft: '36px', paddingRight: '12px' }}
            />
          </div>
        </div>

        <div>
          <Label optional>LinkedIn URL</Label>
          <div className="relative">
            <LinkedInIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#98A2B3' }} />
            <input
              type="text" placeholder="linkedin.com/company/…"
              value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)}
              onFocus={onFocus} onBlur={onBlur}
              style={{ ...fieldStyle, paddingLeft: '36px', paddingRight: '12px' }}
            />
          </div>
        </div>

        {/* Rep selector — real searchable dropdown */}
        <div>
          <Label optional>Assigned rep</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#98A2B3' }} />
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
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#98A2B3', fontSize: '16px' }}
              >×</button>
            )}
            {showRepList && filteredReps.length > 0 && !selectedRep && (
              <div style={{
                position: 'absolute', top: '44px', left: 0, right: 0, zIndex: 50,
                background: '#fff', border: '1px solid #EAECF0', borderRadius: '8px',
                boxShadow: 'var(--shadow-lg)', maxHeight: '200px', overflowY: 'auto',
              }}>
                {filteredReps.slice(0, 30).map(r => (
                  <button
                    key={r.id}
                    onMouseDown={() => { setSelectedRep({ name: r.name, clickupMemberId: r.id }); setRepQuery(''); setShowRepList(false); }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '9px 14px', fontSize: '13px', color: '#101828',
                      background: 'none', border: 'none', cursor: 'pointer',
                      borderBottom: '1px solid #F2F4F7',
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
            className="flex-1 flex items-center justify-center gap-2 rounded-lg text-[15px] font-semibold transition-colors active:scale-[0.99]"
            style={{
              height: '44px',
              background: canGenerate ? '#136AB6' : '#98A2B3',
              color: '#fff',
              border: `1px solid ${canGenerate ? '#136AB6' : '#98A2B3'}`,
              cursor: canGenerate ? 'pointer' : 'not-allowed',
            }}
          >
            <Zap className="w-4 h-4" strokeWidth={2} />
            Run research
          </button>
          <button
            onClick={() => { setLinkedinUrl(''); setWebsiteUrl(''); setCompanyName(''); setSelectedRep(null); setRepQuery(''); }}
            title="Clear fields"
            style={{
              width: '44px', height: '44px', flexShrink: 0,
              background: '#fff', border: '1px solid #D0D5DD',
              borderRadius: '8px', color: '#667085', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProspectInput;
