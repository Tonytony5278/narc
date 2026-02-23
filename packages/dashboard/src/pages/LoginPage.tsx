import React, { useState } from 'react';

interface LoginPageProps {
  onLogin: (email: string, password: string) => Promise<void>;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Email and password are required'); return; }
    setLoading(true);
    setError(null);
    try {
      await onLogin(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0d1117 0%, #1a1a2e 45%, #16213e 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Decorative grid overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(rgba(155,35,53,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(155,35,53,0.04) 1px, transparent 1px)
        `,
        backgroundSize: '48px 48px',
      }} />

      {/* Decorative glow blobs */}
      <div style={{
        position: 'absolute', top: '15%', left: '10%',
        width: 360, height: 360,
        background: 'radial-gradient(circle, rgba(155,35,53,0.12) 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '10%', right: '8%',
        width: 280, height: 280,
        background: 'radial-gradient(circle, rgba(43,108,176,0.08) 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none',
      }} />

      {/* Login card */}
      <div style={{
        background: 'rgba(255,255,255,0.98)',
        borderRadius: '16px',
        padding: '44px 40px',
        width: '100%',
        maxWidth: 420,
        boxShadow: '0 24px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)',
        animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both',
        position: 'relative',
        zIndex: 1,
      }}>

        {/* Logo area */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          {/* Shield icon */}
          <div style={{
            width: 60, height: 60,
            margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #9B2335 0%, #C53030 100%)',
            borderRadius: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(155,35,53,0.35)',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7l-9-5z"
                fill="rgba(255,255,255,0.9)" />
              <path d="M9 12l2 2 4-4" stroke="rgba(155,35,53,0.8)" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ fontWeight: 800, fontSize: 22, color: '#1a1a2e', letterSpacing: '-0.03em' }}>NARC</div>
          <div style={{ fontSize: 13, color: '#718096', marginTop: 3, letterSpacing: '0.02em' }}>
            Pharmacovigilance Dashboard
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{
            background: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: 8,
            padding: '10px 14px', marginBottom: 20,
            color: '#C53030', fontSize: 13,
            display: 'flex', gap: 8, alignItems: 'flex-start',
            animation: 'fadeIn 0.2s ease',
          }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}>⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* Email */}
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: 'block', fontSize: 12, fontWeight: 600,
              color: '#4A5568', marginBottom: 6, letterSpacing: '0.02em',
            }}>
              Email address
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                color: '#A0AEC0', fontSize: 14, pointerEvents: 'none',
              }}>
                ✉
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@hospital.com"
                autoFocus
                autoComplete="email"
                style={{
                  width: '100%', padding: '10px 12px 10px 36px',
                  border: '1.5px solid #E2E8F0', borderRadius: 8,
                  fontSize: 14, boxSizing: 'border-box',
                  outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
                  background: '#FAFAFA', color: '#1a1a2e',
                }}
                onFocus={(e) => { e.target.style.borderColor = '#9B2335'; e.target.style.boxShadow = '0 0 0 3px rgba(155,35,53,0.12)'; e.target.style.background = '#fff'; }}
                onBlur={(e)  => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; e.target.style.background = '#FAFAFA'; }}
              />
            </div>
          </div>

          {/* Password */}
          <div style={{ marginBottom: 28 }}>
            <label style={{
              display: 'block', fontSize: 12, fontWeight: 600,
              color: '#4A5568', marginBottom: 6, letterSpacing: '0.02em',
            }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                color: '#A0AEC0', fontSize: 14, pointerEvents: 'none',
              }}>
                🔒
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{
                  width: '100%', padding: '10px 12px 10px 36px',
                  border: '1.5px solid #E2E8F0', borderRadius: 8,
                  fontSize: 14, boxSizing: 'border-box',
                  outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
                  background: '#FAFAFA', color: '#1a1a2e',
                }}
                onFocus={(e) => { e.target.style.borderColor = '#9B2335'; e.target.style.boxShadow = '0 0 0 3px rgba(155,35,53,0.12)'; e.target.style.background = '#fff'; }}
                onBlur={(e)  => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; e.target.style.background = '#FAFAFA'; }}
              />
            </div>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '11px',
              background: loading
                ? '#CBD5E0'
                : 'linear-gradient(135deg, #9B2335 0%, #C53030 100%)',
              color: '#fff', border: 'none', borderRadius: 8,
              fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.15s, transform 0.1s',
              boxShadow: loading ? 'none' : '0 4px 14px rgba(155,35,53,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              letterSpacing: '0.01em',
            }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.opacity = '0.92'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
            onMouseDown={(e)  => { if (!loading) e.currentTarget.style.transform = 'scale(0.99)'; }}
            onMouseUp={(e)    => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {loading ? (
              <>
                <span style={{
                  width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff', borderRadius: '50%',
                  animation: 'spin 0.7s linear infinite', display: 'inline-block',
                }} />
                Signing in…
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* Footer */}
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 11, color: '#A0AEC0',
            background: '#F7FAFC', border: '1px solid #E2E8F0',
            borderRadius: 20, padding: '4px 12px',
          }}>
            <span style={{ width: 6, height: 6, background: '#48BB78', borderRadius: '50%', display: 'inline-block' }} />
            Dev mode: NARC_AUTH unset — backend bypasses login
          </div>
        </div>
      </div>

      {/* Bottom branding */}
      <div style={{
        position: 'absolute', bottom: 20, left: 0, right: 0,
        textAlign: 'center', fontSize: 11,
        color: 'rgba(255,255,255,0.25)',
        letterSpacing: '0.04em',
      }}>
        NARC Pharmacovigilance v2.0 · ICH E2B(R3) · Confidential
      </div>
    </div>
  );
}
