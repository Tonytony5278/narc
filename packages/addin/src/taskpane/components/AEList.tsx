import React from 'react';
import type { AEFindingRecord } from '@narc/shared';
import AECard from './AECard';
import EmptyState from './EmptyState';

interface AEListProps {
  findings: AEFindingRecord[];
  eventId: string;
}

export default function AEList({ findings, eventId }: AEListProps) {
  if (findings.length === 0) {
    return <EmptyState type="no-ae" />;
  }

  return (
    <div style={{ padding: '12px 12px 0' }}>
      {findings.map((finding, i) => (
        <AECard key={finding.id} finding={finding} eventId={eventId} index={i} />
      ))}
    </div>
  );
}
