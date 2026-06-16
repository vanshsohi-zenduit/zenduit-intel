import { useState, useEffect } from 'react';
import { fetchSettings, saveSettings, checkHealth } from '../lib/mcpClient.js';
import { CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';

const GROUP_HELP = {
  'Zoho Webhook': 'In Zoho Flow: create a trigger on Lead/Contact create → HTTP Action → POST https://your-domain.com/api/zoho/lead → set X-Zoho-Signature header to this secret.',
  'Email (Gmail)': 'Use a Gmail App Password (not your regular password). Enable 2FA first, then go to Google Account → Security → App Passwords.',
  'ClickUp': 'Get API Token from ClickUp → Settings → My Apps. List ID is visible in the URL when you open a list: /l/{LIST_ID}/.',
};

const FIELD_LABELS = {
  GOOGLE_API_KEY: 'Google API Key',
  GEMINI_RESEARCH_MODEL: 'Research Model',
  GEMINI_GENERATION_MODEL: 'Generation Model',
  GEMINI_DEEP_RESEARCH_MODEL: 'Deep Research Model (leave blank to use standard loop)',
  BRAIN_MCP_URL: 'Brain MCP URL',
  BRAIN_MCP_API_KEY: 'Brain MCP API Key',
  LINKEDIN_MCP_URL: 'LinkedIn MCP URL',
  CLICKUP_API_TOKEN: 'ClickUp API Token',
  CLICKUP_LIST_ID: 'ClickUp List ID',
  CLICKUP_OVERDUE_HOURS: 'Overdue Threshold (hours)',
  CLICKUP_POLL_INTERVAL_SEC: 'Poll Interval (seconds)',
  GMAIL_USER: 'Gmail Address',
  GMAIL_APP_PASSWORD: 'Gmail App Password',
  MANAGER_EMAIL: 'Manager Email (overdue alerts)',
  ZOHO_WEBHOOK_SECRET: 'Webhook Secret',
  SLACK_WEBHOOK_URL: 'Slack Webhook URL',
  PUBLIC_APP_URL: 'Public App URL',
  API_SECRET: 'API Bearer Secret',
};

const PLAINTEXT_KEYS = new Set([
  'GEMINI_RESEARCH_MODEL', 'GEMINI_GENERATION_MODEL', 'GEMINI_DEEP_RESEARCH_MODEL',
  'BRAIN_MCP_URL', 'LINKEDIN_MCP_URL', 'PUBLIC_APP_URL',
  'CLICKUP_LIST_ID', 'CLICKUP_OVERDUE_HOURS', 'CLICKUP_POLL_INTERVAL_SEC',
  'GMAIL_USER', 'MANAGER_EMAIL',
]);

const SettingField = ({ fieldKey, info, localValue, onChange, showSecret, onToggleSecret }) => {
  const isPlain = PLAINTEXT_KEYS.has(fieldKey);
  const configured = info?.configured;
  const label = FIELD_LABELS[fieldKey] || fieldKey;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.07em' }}>
          {label}
        </label>
        {configured
          ? <CheckCircle style={{ width: '13px', height: '13px', color: '#10b981', flexShrink: 0 }} />
          : <AlertCircle  style={{ width: '13px', height: '13px', color: '#d97706', flexShrink: 0 }} />
        }
      </div>
      <div style={{ position: 'relative' }}>
        <input
          type={!isPlain && !showSecret ? 'password' : 'text'}
          placeholder={configured && !isPlain ? '● configured — type new value to update' : `Enter ${label}`}
          value={localValue}
          onChange={e => onChange(fieldKey, e.target.value)}
          style={{
            width: '100%', height: '38px', paddingLeft: '12px', paddingRight: isPlain ? '12px' : '38px',
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: '7px',
            fontSize: '13px', color: '#0f172a', outline: 'none', boxSizing: 'border-box',
          }}
          onFocus={e => { e.target.style.borderColor = 'rgba(37,99,235,0.6)'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)'; }}
          onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
        />
        {!isPlain && (
          <button
            onClick={() => onToggleSecret(fieldKey)}
            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, display: 'flex' }}
          >
            {showSecret ? <EyeOff style={{ width: '15px', height: '15px' }} /> : <Eye style={{ width: '15px', height: '15px' }} />}
          </button>
        )}
      </div>
    </div>
  );
};

const Settings = () => {
  const [settings, setSettings]   = useState({});
  const [health,   setHealth]     = useState({});
  const [locals,   setLocals]     = useState({});
  const [shown,    setShown]      = useState({});
  const [saving,   setSaving]     = useState({});
  const [saved,    setSavedMsg]   = useState({});
  const [loading,  setLoading]    = useState(true);

  useEffect(() => {
    Promise.all([fetchSettings(), checkHealth()]).then(([s, h]) => {
      setSettings(s || {});
      setHealth(h || {});
    }).finally(() => setLoading(false));
  }, []);

  const groupedKeys = {};
  Object.entries(settings).forEach(([key, info]) => {
    const g = info.group || 'Other';
    if (!groupedKeys[g]) groupedKeys[g] = [];
    groupedKeys[g].push(key);
  });

  const handleChange = (key, val) => setLocals(prev => ({ ...prev, [key]: val }));
  const toggleSecret = (key) => setShown(prev => ({ ...prev, [key]: !prev[key] }));

  const handleSave = async (group, keys) => {
    setSaving(prev => ({ ...prev, [group]: true }));
    const payload = {};
    keys.forEach(k => { if (locals[k] !== undefined && locals[k] !== '') payload[k] = locals[k]; });
    try {
      await saveSettings(payload);
      const updated = await fetchSettings();
      setSettings(updated || {});
      setLocals(prev => { const n = { ...prev }; keys.forEach(k => delete n[k]); return n; });
      setSavedMsg(prev => ({ ...prev, [group]: true }));
      setTimeout(() => setSavedMsg(prev => ({ ...prev, [group]: false })), 2500);
    } catch {
      // silent — fields remain editable
    } finally {
      setSaving(prev => ({ ...prev, [group]: false }));
    }
  };

  const groupConfigured = (keys) => keys.filter(k => settings[k]?.configured).length;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px' }}>
        <div style={{ width: '28px', height: '28px', border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '680px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Settings</h1>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
          All credentials are stored in <code style={{ fontSize: '12px', background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px' }}>credentials.json</code> on the server and never sent to the browser.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {Object.entries(groupedKeys).map(([group, keys]) => {
          const configured = groupConfigured(keys);
          const isOk = configured === keys.length;
          const isSaving = saving[group];
          const isSaved  = saved[group];
          const help = GROUP_HELP[group];

          return (
            <div key={group} style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
              {/* Group header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isOk ? '#10b981' : configured > 0 ? '#f59e0b' : '#e2e8f0' }} />
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{group}</span>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>{configured}/{keys.length} configured</span>
                </div>
                <button
                  onClick={() => handleSave(group, keys)}
                  disabled={isSaving}
                  style={{
                    height: '32px', padding: '0 16px', borderRadius: '6px', border: 'none',
                    background: isSaved ? '#10b981' : '#2563eb',
                    color: '#fff', fontSize: '12px', fontWeight: 600, cursor: isSaving ? 'wait' : 'pointer',
                    opacity: isSaving ? 0.6 : 1, transition: 'background 0.2s',
                  }}
                >
                  {isSaved ? 'Saved ✓' : isSaving ? 'Saving…' : 'Save'}
                </button>
              </div>

              {/* Fields */}
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {help && (
                  <div style={{ padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '12px', color: '#1d4ed8', lineHeight: 1.6 }}>
                    {help}
                  </div>
                )}
                {keys.map(k => (
                  <SettingField
                    key={k}
                    fieldKey={k}
                    info={settings[k]}
                    localValue={locals[k] ?? (PLAINTEXT_KEYS.has(k) ? (settings[k]?.value || '') : '')}
                    onChange={handleChange}
                    showSecret={shown[k]}
                    onToggleSecret={toggleSecret}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Settings;
