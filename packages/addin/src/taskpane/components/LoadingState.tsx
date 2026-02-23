import React from 'react';

interface LoadingStateProps {
  message?: string;
}

export default function LoadingState({ message = 'Analyzing email…' }: LoadingStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        gap: 12,
        color: '#718096',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          border: '3px solid #E2E8F0',
          borderTopColor: '#9B2335',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ fontWeight: 600, color: '#4A5568' }}>{message}</div>
      <div style={{ fontSize: 11, textAlign: 'center', maxWidth: 200 }}>
        NARC is scanning for potential adverse events
      </div>
    </div>
  );
}
