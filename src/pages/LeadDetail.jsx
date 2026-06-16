import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchLead } from '../lib/mcpClient.js';

const Field = ({ label, value }) => {
  if (!value) return null;
  return (
    <div>
      <p style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>{label}</p>
      <p style={{ fontSize: '14px', color: '#0f172a' }}>{value}</p>
    </div>
  );
};

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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f6f9' }}>
        <div style={{ textAlign: 'center', color: '#64748b' }}>
          <div style={{ width: '36px', height: '36px', border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ fontSize: '14px' }}>Loading lead brief…</p>
        </div>
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f6f9' }}>
        <div style={{ textAlign: 'center', padding: '40px', background: '#fff', borderRadius: '12px', boxShadow: '0 2px 12px rgba(0,0,0,.08)' }}>
          <p style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Lead Not Found</p>
          <p style={{ fontSize: '14px', color: '#64748b' }}>{error || 'This brief may have expired or the link is incorrect.'}</p>
        </div>
      </div>
    );
  }

  const intel = entry.intel || {};
  const rep = entry.assignedRep || {};

  return (
    <div style={{ minHeight: '100vh', background: '#f4f6f9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#0d1b2a', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: '#10b981', fontWeight: 700, fontSize: '12px', letterSpacing: '.1em', textTransform: 'uppercase' }}>
          Zenduit Intelligence
        </span>
        <span style={{ color: '#7c92ab', fontSize: '12px' }}>Read-only Brief</span>
      </div>

      <div style={{ maxWidth: '800px', margin: '32px auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Company hero */}
        <div style={{ background: '#fff', borderRadius: '12px', padding: '28px 32px', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#0d1b2a', margin: '0 0 4px' }}>
                {entry.companyName || intel.companyName || '—'}
              </h1>
              <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
                {intel.industry || '—'} &nbsp;·&nbsp; {intel.hq || '—'}
              </p>
            </div>
            {intel.score != null && (
              <div style={{
                width: '56px', height: '56px', borderRadius: '50%', flexShrink: 0,
                background: intel.score >= 8 ? '#d1fae5' : intel.score >= 5 ? '#fef3c7' : '#f1f5f9',
                border: `2px solid ${intel.score >= 8 ? '#10b981' : intel.score >= 5 ? '#f59e0b' : '#cbd5e1'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '18px', fontWeight: 800,
                color: intel.score >= 8 ? '#10b981' : intel.score >= 5 ? '#d97706' : '#64748b',
              }}>
                {intel.score}
              </div>
            )}
          </div>

          {/* Stat row */}
          <div style={{ display: 'flex', gap: '24px', marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e8edf3', flexWrap: 'wrap' }}>
            {[
              { label: 'Fleet Size', value: intel.fleetSize },
              { label: 'Employees', value: intel.employeeCount },
              { label: 'Best Product', value: intel.topProduct },
              { label: 'Platform', value: intel.currentFleetPlatform },
            ].filter(s => s.value).map(s => (
              <div key={s.label}>
                <p style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '2px' }}>{s.label}</p>
                <p style={{ fontSize: '14px', color: '#0f172a', fontWeight: 600, margin: 0 }}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Summary + Pain Points */}
        <div style={{ background: '#fff', borderRadius: '12px', padding: '24px 32px', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '12px' }}>Company Overview</h2>
          <p style={{ fontSize: '14px', color: '#334155', lineHeight: 1.7, margin: '0 0 16px' }}>{intel.summary || '—'}</p>
          {intel.topPainPoint && (
            <div style={{ padding: '12px 16px', background: '#fffbeb', borderLeft: '3px solid #f59e0b', borderRadius: '0 6px 6px 0', fontSize: '14px', color: '#44403c' }}>
              <strong>Top Pain Point:</strong> {intel.topPainPoint}
            </div>
          )}
        </div>

        {/* Contact */}
        {(intel.contactName || intel.contactEmail || intel.contactPhone) && (
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px 32px', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '16px' }}>Primary Contact</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
              <Field label="Name"  value={intel.contactName} />
              <Field label="Title" value={intel.contactTitle} />
              <Field label="Email" value={intel.contactEmail} />
              <Field label="Phone" value={intel.contactPhone} />
            </div>
            {intel.contactRoleSummary && (
              <p style={{ marginTop: '12px', fontSize: '13px', color: '#64748b', fontStyle: 'italic' }}>{intel.contactRoleSummary}</p>
            )}
          </div>
        )}

        {/* Displacement angle */}
        {(intel.displacementAngle || intel.decisionMakerHint) && (
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px 32px', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '16px' }}>Sales Angle</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Field label="Displacement Angle"  value={intel.displacementAngle} />
              <Field label="Decision Maker Hint" value={intel.decisionMakerHint} />
              <Field label="Recent Event"        value={intel.recentEvent} />
              <Field label="Funding / Expansion" value={intel.fundingOrExpansion} />
              <Field label="Hiring Signals"      value={intel.hiringSignals} />
            </div>
          </div>
        )}

        {/* Recent news */}
        {intel.recentNews?.length > 0 && (
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px 32px', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '12px' }}>Recent News</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {intel.recentNews.map((n, i) => (
                <div key={i} style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e8edf3' }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', margin: '0 0 2px' }}>{n.headline}</p>
                  {n.relevance && <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>{n.relevance}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Assigned rep */}
        {rep.name && (
          <div style={{ background: '#f0fdf4', borderRadius: '12px', padding: '18px 24px', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>
              {rep.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 2px' }}>Assigned Rep</p>
              <p style={{ fontSize: '14px', color: '#0f172a', fontWeight: 600, margin: 0 }}>{rep.name}</p>
              {rep.email && <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>{rep.email}</p>}
            </div>
          </div>
        )}

        <p style={{ textAlign: 'center', fontSize: '12px', color: '#94a3b8', paddingBottom: '32px' }}>
          Zenduit Outbound Intelligence · This brief is read-only
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default LeadDetail;
