import React from 'react';

interface AttachmentBadgeProps {
  count: number;
  names?: string[];   // attachment file names for tooltip
  highlight?: boolean; // true if any attachment is a processable doc type
}

const PROCESSABLE_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.docx', '.rtf', '.txt'];

function isProcessable(filename: string): boolean {
  const lower = filename.toLowerCase();
  return PROCESSABLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export default function AttachmentBadge({ count, names = [], highlight }: AttachmentBadgeProps) {
  if (count === 0) return null;

  const hasProcessable = highlight ?? names.some(isProcessable);
  const tooltipText = names.length > 0
    ? names.join(', ')
    : `${count} attachment${count !== 1 ? 's' : ''}`;

  return (
    <span
      title={tooltipText}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 9.5,
        fontWeight: 700,
        padding: '1px 5px',
        borderRadius: 4,
        background: hasProcessable ? '#FFFBEB' : '#F7FAFC',
        color: hasProcessable ? '#B7791F' : '#718096',
        border: `1px solid ${hasProcessable ? '#F6E05E' : '#E2E8F0'}`,
        cursor: 'help',
        whiteSpace: 'nowrap',
      }}
    >
      📎 {count}
    </span>
  );
}
