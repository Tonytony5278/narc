import React, { useState } from 'react';
import { login } from '../../utils/api';
import { setToken, setUser } from '../../utils/auth';

interface LoginScreenProps {
  onLogin: () => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Email and password required'); return; }
    setLoading(true);
    setError(null);
    try {
      const result = await login(email, password);
      setToken(result.token);
      setUser(result.user);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#F8F9FA', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ width: 44, height: 44, background: '#9B2335', borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 10 }}>⚕</div>
        <div style={{ fontWeight: 700, fontSize: 16, color: '#1a1a2e' }}>NARC</div>
        <div style={{ fontSize: 11, color: '#718096' }}>Adverse Event Detector</div>
      </div>

      {/* Card */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '20px 18px', width: '100%', maxWidth: 280, boxShadow: '0 2px 10px rgba(0,0,0,0.07)' }}>
        {error && (
          <div style={{ background: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: 6, padding: '8px 10px', marginBottom: 12, color: '#C53030', fontSize: 12 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#4A5568', marginBottom: 4 }}>Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@mckesson.com" autoFocus
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#4A5568', marginBottom: 4 }}>Password</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>

          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '9px', background: loading ? '#718096' : '#9B2335', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>

      <div style={{ marginTop: 12, fontSize: 10, color: '#A0AEC0', textAlign: 'center' }}>
        Dev mode: leave NARC_AUTH unset to bypass login
      </div>
    </div>
  );
}
