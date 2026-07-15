import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setAuthToken } from '../lib/auth.js';

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const CANVAS = 'linear-gradient(180deg,#010658 0%,#050712 100%)';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        setError('Incorrect email or password. Try again.');
        return;
      }
      const { token } = await res.json();
      setAuthToken(token);
      navigate('/', { replace: true });
    } catch {
      setError('Could not reach the server. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: CANVAS, padding: '24px', fontFamily: 'var(--font-sans)',
    }}>
      <div style={{ width: '380px', maxWidth: '100%', background: '#fff', borderRadius: '14px', boxShadow: '0 24px 48px -12px rgba(0,0,0,.35)', padding: '32px' }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px' }}>
          <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: 'linear-gradient(135deg,#136AB6,#0A3A63)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '15px', flexShrink: 0 }}>Z</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#101828' }}>ZenIntel</div>
        </div>

        <div style={{ fontSize: '20px', fontWeight: 700, color: '#101828', marginBottom: '4px' }}>Sign in</div>
        <div style={{ fontSize: '13px', color: '#667085', marginBottom: '22px' }}>This tool is restricted to the Zenduit sales team.</div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', fontWeight: 500, color: '#344054' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              placeholder="you@zenduit.com"
              autoFocus
              required
              autoComplete="username"
              style={{
                width: '100%', height: '40px', padding: '0 12px',
                background: '#fff',
                border: `1px solid ${error ? '#FDA29B' : '#D0D5DD'}`,
                borderRadius: '8px', fontSize: '14px', color: '#101828',
                outline: 'none', boxSizing: 'border-box',
                boxShadow: '0 1px 2px rgba(16,24,40,.05)',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onFocus={e => { e.target.style.borderColor = '#136AB6'; e.target.style.boxShadow = '0 0 0 4px rgba(19,106,182,0.16)'; }}
              onBlur={e => { e.target.style.borderColor = error ? '#FDA29B' : '#D0D5DD'; e.target.style.boxShadow = '0 1px 2px rgba(16,24,40,.05)'; }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', fontWeight: 500, color: '#344054' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              style={{
                width: '100%', height: '40px', padding: '0 12px',
                background: '#fff',
                border: `1px solid ${error ? '#FDA29B' : '#D0D5DD'}`,
                borderRadius: '8px', fontSize: '14px', color: '#101828',
                outline: 'none', boxSizing: 'border-box',
                boxShadow: '0 1px 2px rgba(16,24,40,.05)',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onFocus={e => { e.target.style.borderColor = '#136AB6'; e.target.style.boxShadow = '0 0 0 4px rgba(19,106,182,0.16)'; }}
              onBlur={e => { e.target.style.borderColor = error ? '#FDA29B' : '#D0D5DD'; e.target.style.boxShadow = '0 1px 2px rgba(16,24,40,.05)'; }}
            />
            {error && <div style={{ fontSize: '13px', color: '#B42318', marginTop: '2px' }}>{error}</div>}
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            style={{
              width: '100%', height: '42px', borderRadius: '8px',
              background: loading || !email || !password ? '#98A2B3' : '#136AB6',
              border: `1px solid ${loading || !email || !password ? '#98A2B3' : '#136AB6'}`,
              color: '#fff', fontSize: '14px', fontWeight: 600,
              cursor: loading || !email || !password ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
