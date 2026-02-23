import React from 'react';

interface EmptyStateProps {
  type: 'no-ae' | 'error' | 'no-email';
  message?: string;
  onRetry?: () => void;
}

export default function EmptyState({ type, message, onRetry }: EmptyStateProps) {
  const configs = {
    'no-ae': {
      icon: '✅',
      title: 'No adverse events detected',
      desc: 'NARC did not find any potential AEs in this email. If you believe this is incorrect, please review manually.',
    },
    error: {
      icon: '⚠️',
      title: 'Analysis failed',
      desc: message ?? 'Could not connect to the NARC backend. Make sure the server is running on port 3001.',
    },
    'no-email': {
      icon: '📧',
      title: 'No email selected',
      desc: 'Open an email in Outlook to start adverse event detection.',
    },
  };

  const config = configs[type];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: '32px 20px',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 36 }}>{config.icon}</div>
      <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a2e', marginTop: 4 }}>
        {config.title}
      </div>
      <div style={{ fontSize: 12, color: '#718096', lineHeight: 1.5, maxWidth: 240 }}>
        {config.desc}
      </div>
      {onRetry && type === 'error' && (
        <button
          onClick={onRetry}
          style={{
            marginTop: 8,
            padding: '6px 16px',
            background: '#9B2335',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
