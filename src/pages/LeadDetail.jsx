import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchLead } from '../lib/mcpClient.js';

const CANVAS = 'linear-gradient(180deg,#010658 0%,#050712 100%)';

const SectionLabel = ({ children }) => (
  <div style={{ fontSize: '13px', fontWeight: 600, color: '#98A2B3', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '10px' }}>
    {children}
  </div>
);

const Field = ({ label, value }) => {
  if (!value) return null;
  return (
    <div>
      <p style={{ fontSize: '11px', fontWeight: 600, color: '#98A2B3', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>{label}</p>
      <p style={{ fontSize: '14px', color: '#101828', lineHeight: 1.6 }}>{value}</p>
    </div>
  );
};

const fitBadge = (score) => (
  score >= 8 ? { label: 'High fit',   fg: '#027A48', bg: '#ECFDF3' }
: score >= 5 ? { label: 'Medium fit', fg: '#B54708', bg: '#FFFAEB' }
:              { label: 'Low fit',    fg: '#475467', bg: '#F2F4F7' }
);

const LeadDetail = () => {
  const { id } = useParams();
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLead(id)
      .then(setEntry)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: CANVAS, fontFamily: 'var(--font-sans)' }}>
        <div style={{ textAlign: 'center', color: '#C6CBD6' }}>
          <div style={{ width: '36px', height: '36px', border: '3px solid rgba(255,255,255,.2)', borderTopColor: '#67A7DA', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ fontSize: '14px' }}>Loading lead brief…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: CANVAS, padding: '20px', fontFamily: 'var(--font-sans)' }}>
        <div style={{ textAlign: 'center', padding: '40px', background: '#fff', borderRadius: '14px', boxShadow: '0 24px 48px -12px rgba(0,0,0,.35)', maxWidth: '380px' }}>
          <p style={{ fontSize: '20px', fontWeight: 700, color: '#101828', marginBottom: '8px' }}>Lead not found</p>
          <p style={{ fontSize: '14px', color: '#667085' }}>{error || 'This brief may have expired or the link is incorrect.'}</p>
        </div>
      </div>
    );
  }

  const intel = entry.intel || {};
  const rep = entry.assignedRep || {};
  const badge = intel.score != null ? fitBadge(intel.score) : null;

  const stats = [
    { label: 'Fleet size',   value: intel.fleetSize },
    { label: 'Employees',    value: intel.employeeCount },
    { label: 'Best product', value: intel.topProduct },
    { label: 'Platform',     value: intel.currentFleetPlatform },
  ].filter(s => s.value);

  const contactInitials = (intel.contactName || 'DM').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div style={{ width: '100%', minHeight: '100vh', boxSizing: 'border-box', display: 'flex', justifyContent: 'center', padding: '48px 20px', background: CANVAS, fontFamily: 'var(--font-sans)' }}>
      <div style={{ width: '100%', maxWidth: '760px', background: '#fff', borderRadius: '16px', boxShadow: '0 24px 48px -12px rgba(0,0,0,.35)', overflow: 'hidden', alignSelf: 'flex-start' }}>

        {/* Hero */}
        <div style={{ padding: '32px 36px', borderBottom: '1px solid #EAECF0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <div style={{ width: '26px', height: '26px', borderRadius: '7px', background: 'linear-gradient(135deg,#136AB6,#0A3A63)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '12px' }}>Z</div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#98A2B3', letterSpacing: '.04em', textTransform: 'uppercase' }}>Prospect brief — ZenIntel</span>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#101828', letterSpacing: '-.01em' }}>
              {entry.companyName || intel.companyName || '—'}
            </div>
            <div style={{ fontSize: '14px', color: '#667085', marginTop: '4px' }}>
              {[intel.industry, intel.hq].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
          {badge && (
            <span style={{ flexShrink: 0, fontSize: '12px', fontWeight: 600, color: badge.fg, background: badge.bg, borderRadius: '9999px', padding: '5px 12px' }}>
              {badge.label}
            </span>
          )}
        </div>

        {/* Stat row */}
        {stats.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stats.length}, 1fr)`, borderBottom: '1px solid #EAECF0' }}>
            {stats.map((s, i) => (
              <div key={s.label} style={{ padding: '18px 20px', borderRight: i < stats.length - 1 ? '1px solid #EAECF0' : 'none' }}>
                <div style={{ fontSize: '12px', color: '#667085' }}>{s.label}</div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: '#101828', marginTop: '2px' }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ padding: '32px 36px', display: 'flex', flexDirection: 'column', gap: '28px' }}>

          {/* Summary */}
          {(intel.summary || intel.topPainPoint) && (
            <div>
              <SectionLabel>Summary</SectionLabel>
              {intel.summary && <div style={{ fontSize: '15px', lineHeight: 1.7, color: '#344054' }}>{intel.summary}</div>}
              {intel.topPainPoint && (
                <div style={{ marginTop: '14px', padding: '12px 16px', background: '#FFFAEB', borderLeft: '3px solid #F79009', borderRadius: '0 6px 6px 0', fontSize: '14px', color: '#344054' }}>
                  <strong style={{ color: '#B54708' }}>Top pain point:</strong> {intel.topPainPoint}
                </div>
              )}
            </div>
          )}

          {/* Contact */}
          {(intel.contactName || intel.contactEmail || intel.contactPhone) && (
            <div>
              <SectionLabel>Primary contact</SectionLabel>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: '#F9FAFB', border: '1px solid #EAECF0', borderRadius: '10px', padding: '16px', flexWrap: 'wrap' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#E7F2FA', color: '#0F5795', fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {contactInitials}
                </div>
                <div style={{ flex: 1, minWidth: '160px' }}>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#101828' }}>{intel.contactName || 'Decision maker'}</div>
                  {intel.contactTitle && <div style={{ fontSize: '13px', color: '#667085' }}>{intel.contactTitle}</div>}
                </div>
                {(intel.contactEmail || intel.contactPhone) && (
                  <div style={{ textAlign: 'right', fontSize: '13px', color: '#475467' }}>
                    {intel.contactEmail && <div>{intel.contactEmail}</div>}
                    {intel.contactPhone && <div>{intel.contactPhone}</div>}
                  </div>
                )}
              </div>
              {intel.contactRoleSummary && (
                <p style={{ marginTop: '10px', fontSize: '13px', color: '#667085', fontStyle: 'italic' }}>{intel.contactRoleSummary}</p>
              )}
            </div>
          )}

          {/* Sales angle */}
          {(intel.displacementAngle || intel.decisionMakerHint || intel.recentEvent || intel.fundingOrExpansion || intel.hiringSignals) && (
            <div>
              <SectionLabel>Suggested angles</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <Field label="Displacement angle"  value={intel.displacementAngle} />
                <Field label="Decision maker hint" value={intel.decisionMakerHint} />
                <Field label="Recent event"        value={intel.recentEvent} />
                <Field label="Funding / expansion" value={intel.fundingOrExpansion} />
                <Field label="Hiring signals"      value={intel.hiringSignals} />
              </div>
            </div>
          )}

          {/* Recent news */}
          {intel.recentNews?.length > 0 && (
            <div>
              <SectionLabel>Recent news</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {intel.recentNews.map((n, i) => (
                  <div key={i} style={{ borderLeft: '2px solid #EAECF0', paddingLeft: '12px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#101828' }}>{n.headline}</div>
                    {n.relevance && <div style={{ fontSize: '13px', color: '#667085', marginTop: '2px' }}>{n.relevance}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assigned rep */}
          {rep.name && (
            <div style={{ background: '#ECFDF3', borderRadius: '10px', padding: '16px 20px', border: '1px solid #A6F4C5', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#12B76A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>
                {rep.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p style={{ fontSize: '12px', color: '#027A48', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 2px' }}>Assigned rep</p>
                <p style={{ fontSize: '14px', color: '#101828', fontWeight: 600, margin: 0 }}>{rep.name}</p>
                {rep.email && <p style={{ fontSize: '12px', color: '#667085', margin: 0 }}>{rep.email}</p>}
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '18px 36px', borderTop: '1px solid #EAECF0', fontSize: '12px', color: '#98A2B3', textAlign: 'center' }}>
          Prepared by ZenIntel · This link is shared for reference and cannot be edited.
        </div>
      </div>
    </div>
  );
};

export default LeadDetail;
