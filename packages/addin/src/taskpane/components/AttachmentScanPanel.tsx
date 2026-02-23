/**
 * AttachmentScanPanel
 *
 * Scans email attachments for adverse events.
 * For each attachment (PDF, image/fax, DOCX, RTF, TXT):
 *   1. Fetches content bytes from Outlook REST API
 *   2. Sends to backend /api/analyze/document
 *   3. Backend extracts text (Claude Vision OCR for scanned faxes / handwriting)
 *   4. Returns AE findings which are displayed inline
 *
 * This covers the critical fax-to-AE pipeline:
 *   Fax arrives as image attachment → Claude Vision OCR → AE detection → findings
 */

import React, { useState, useCallback } from 'react';
import type { AttachmentFinding, DocumentAnalysisResult } from '../../utils/api';
import { analyzeDocumentAttachment } from '../../utils/api';
import {
  listAttachmentsWithDetails,
  fetchAttachmentContent,
  isProcessableAttachment,
  type AttachmentMeta,
} from '../../utils/office';

// ─── Types ────────────────────────────────────────────────────────────────────

type AttachmentStatus = 'pending' | 'fetching' | 'analyzing' | 'done' | 'skipped' | 'error';

interface AttachmentItem {
  meta: AttachmentMeta;
  status: AttachmentStatus;
  result: DocumentAnalysisResult | null;
  error: string | null;
  isProcessable: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
  critical: { bg: '#000000', text: '#fff' },
  high:     { bg: '#7B0000', text: '#fff' },
  medium:   { bg: '#C45000', text: '#fff' },
  low:      { bg: '#B07A00', text: '#fff' },
};

const CATEGORY_LABELS: Record<string, string> = {
  adverse_reaction:    'Adverse Reaction',
  off_label_use:       'Off-Label Use',
  off_label_dosing:    'Off-Label Dosing',
  pregnancy_exposure:  'Pregnancy Exposure',
  drug_interaction:    'Drug Interaction',
  serious_adverse_event: 'Serious AE',
  overdose:            'Overdose',
  medication_error:    'Medication Error',
};

const FILE_ICON: Record<string, string> = {
  pdf:   '📄',
  image: '🖼️',
  docx:  '📝',
  rtf:   '📋',
  txt:   '📃',
  fax:   '📠',
};

function getFileIcon(name: string, contentType: string): string {
  if (contentType.startsWith('image/') || name.toLowerCase().endsWith('.tif') || name.toLowerCase().endsWith('.tiff')) {
    return FILE_ICON.image;
  }
  if (contentType === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) return FILE_ICON.pdf;
  if (name.toLowerCase().endsWith('.docx')) return FILE_ICON.docx;
  if (name.toLowerCase().endsWith('.rtf')) return FILE_ICON.rtf;
  if (name.toLowerCase().endsWith('.txt')) return FILE_ICON.txt;
  return '📎';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FindingCard({ finding, index }: { finding: AttachmentFinding; index: number }) {
  const sev = SEVERITY_COLORS[finding.severity] ?? { bg: '#718096', text: '#fff' };
  return (
    <div style={{
      border: '1px solid #E2E8F0',
      borderLeft: `4px solid ${sev.bg}`,
      borderRadius: 6,
      marginBottom: 7,
      background: '#fff',
      fontSize: 11,
    }}>
      {/* Header */}
      <div style={{
        padding: '5px 10px',
        background: '#F7FAFC',
        borderBottom: '1px solid #EDF2F7',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 6,
      }}>
        <span style={{
          fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
          background: '#4A5568', color: '#fff',
        }}>
          {CATEGORY_LABELS[finding.category] ?? finding.category}
        </span>
        <span style={{
          fontSize: 9.5, fontWeight: 800, padding: '1px 6px', borderRadius: 3,
          background: sev.bg, color: sev.text, textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          {finding.severity}
        </span>
      </div>

      {/* Excerpt */}
      <blockquote style={{
        margin: 0, padding: '7px 10px',
        background: '#FFFBEA', borderBottom: '1px solid #FAF089',
        fontStyle: 'italic', color: '#5D4037', fontSize: 11, lineHeight: 1.4,
      }}>
        "{finding.excerpt}"
      </blockquote>

      {/* Explanation */}
      <div style={{ padding: '6px 10px', color: '#4A5568', lineHeight: 1.5 }}>
        {finding.explanation}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface AttachmentScanPanelProps {
  messageId: string;    // EWS item ID (from Office.js)
  subject: string;
  sender: string;
  receivedAt: string;
}

export default function AttachmentScanPanel({
  messageId,
  subject,
  sender,
  receivedAt,
}: AttachmentScanPanelProps) {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'scanning' | 'done' | 'error'>('idle');
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // ── Load attachment list ───────────────────────────────────────────────

  const loadAttachments = useCallback(async () => {
    setPhase('loading');
    setLoadError(null);
    try {
      const metas = await listAttachmentsWithDetails(messageId);
      const items: AttachmentItem[] = metas
        .filter((m) => !m.isInline) // skip inline images (signatures, logos)
        .map((meta) => ({
          meta,
          status: 'pending',
          result: null,
          error: null,
          isProcessable: isProcessableAttachment(meta.name, meta.contentType),
        }));

      setAttachments(items);
      setPhase(items.length === 0 ? 'done' : 'ready');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load attachments');
      setPhase('error');
    }
  }, [messageId]);

  // ── Scan all processable attachments ──────────────────────────────────

  const scanAll = useCallback(async () => {
    setPhase('scanning');

    const processable = attachments.filter((a) => a.isProcessable && a.status === 'pending');

    for (const item of processable) {
      // Mark as fetching
      setAttachments((prev) =>
        prev.map((a) => a.meta.id === item.meta.id ? { ...a, status: 'fetching' } : a)
      );

      try {
        // Fetch attachment content from Outlook REST API
        const content = await fetchAttachmentContent(messageId, item.meta.id);

        // Mark as analyzing
        setAttachments((prev) =>
          prev.map((a) => a.meta.id === item.meta.id ? { ...a, status: 'analyzing' } : a)
        );

        // Send to NARC backend for AE detection
        const result = await analyzeDocumentAttachment({
          filename:     content.name,
          contentBytes: content.contentBytes,
          contentType:  content.contentType,
          subject:      `[Attachment] ${content.name} — ${subject}`,
          sender,
          receivedAt,
          emailId:      messageId,
        });

        setAttachments((prev) =>
          prev.map((a) =>
            a.meta.id === item.meta.id
              ? { ...a, status: 'done', result }
              : a
          )
        );

        // Auto-expand attachments with AE findings
        if (result.hasAEs && result.findings.length > 0) {
          setExpandedIds((prev) => new Set([...prev, item.meta.id]));
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Scan failed';
        setAttachments((prev) =>
          prev.map((a) =>
            a.meta.id === item.meta.id
              ? { ...a, status: 'error', error: errorMsg }
              : a
          )
        );
      }
    }

    // Mark non-processable as skipped
    setAttachments((prev) =>
      prev.map((a) => (!a.isProcessable && a.status === 'pending') ? { ...a, status: 'skipped' } : a)
    );

    setPhase('done');
  }, [attachments, messageId, subject, sender, receivedAt]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Summary counts ────────────────────────────────────────────────────

  const totalAEs = attachments.reduce((sum, a) => sum + (a.result?.findings.length ?? 0), 0);
  const criticalOrHigh = attachments.filter(
    (a) => a.result?.findings.some((f) => f.severity === 'critical' || f.severity === 'high')
  ).length;

  // ── Render ────────────────────────────────────────────────────────────

  if (phase === 'idle') {
    return (
      <div style={{ padding: '16px 14px', textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>📎</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e', marginBottom: 6 }}>
          Scan Attachments for AEs
        </div>
        <div style={{ fontSize: 11, color: '#718096', lineHeight: 1.5, marginBottom: 14 }}>
          NARC can scan attached PDFs, images, faxes, and documents for adverse event reports using Claude Vision OCR.
        </div>
        <button
          onClick={loadAttachments}
          style={{
            padding: '7px 20px', background: '#1a1a2e', color: '#fff',
            border: 'none', borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
          }}
        >
          Load Attachments
        </button>
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#718096', fontSize: 11 }}>
        <div style={{ fontSize: 20, marginBottom: 6 }}>⌛</div>
        Loading attachments…
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div style={{ padding: '14px', background: '#FFF5F5', borderRadius: 8, margin: '12px' }}>
        <div style={{ fontSize: 11, color: '#C53030', fontWeight: 700, marginBottom: 4 }}>
          ⚠ Could not load attachments
        </div>
        <div style={{ fontSize: 10.5, color: '#718096' }}>{loadError}</div>
        <button
          onClick={loadAttachments}
          style={{
            marginTop: 10, padding: '4px 12px', background: '#fff', border: '1px solid #CBD5E0',
            borderRadius: 5, fontSize: 10.5, cursor: 'pointer', color: '#4A5568',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header + scan button */}
      <div style={{
        padding: '8px 12px',
        background: '#fff',
        borderBottom: '1px solid #EDF2F7',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#1a1a2e' }}>
            {attachments.length} attachment{attachments.length !== 1 ? 's' : ''}
            {attachments.filter((a) => a.isProcessable).length > 0 && (
              <span style={{ fontWeight: 400, color: '#718096', marginLeft: 4 }}>
                ({attachments.filter((a) => a.isProcessable).length} scannable)
              </span>
            )}
          </div>
          {totalAEs > 0 && (
            <div style={{
              fontSize: 10, fontWeight: 700,
              color: criticalOrHigh > 0 ? '#7B0000' : '#C45000',
              marginTop: 1,
            }}>
              {criticalOrHigh > 0 ? '🚨' : '⚠️'} {totalAEs} AE finding{totalAEs !== 1 ? 's' : ''} detected
            </div>
          )}
          {phase === 'done' && totalAEs === 0 && (
            <div style={{ fontSize: 10, color: '#48BB78', marginTop: 1 }}>✓ No AEs in attachments</div>
          )}
        </div>

        {(phase === 'ready' || phase === 'done') && attachments.some((a) => a.isProcessable && a.status === 'pending') && (
          <button
            onClick={scanAll}
            style={{
              padding: '5px 12px', background: '#9B2335', color: '#fff',
              border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            Scan All
          </button>
        )}

        {phase === 'scanning' && (
          <span style={{ fontSize: 10, color: '#718096', fontStyle: 'italic' }}>Scanning…</span>
        )}
      </div>

      {/* Attachment list */}
      <div>
        {attachments.map((item) => {
          const icon      = getFileIcon(item.meta.name, item.meta.contentType);
          const hasAEs    = item.result?.hasAEs && (item.result.findings.length > 0);
          const isExpanded = expandedIds.has(item.meta.id);
          const maxSev    = item.result?.findings.reduce<string>((max, f) => {
            const order: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 };
            return (order[f.severity] ?? 0) > (order[max] ?? 0) ? f.severity : max;
          }, 'low') ?? 'low';
          const sevColor  = SEVERITY_COLORS[maxSev] ?? { bg: '#718096', text: '#fff' };

          return (
            <div key={item.meta.id} style={{ borderBottom: '1px solid #EDF2F7' }}>
              {/* Attachment row */}
              <div
                onClick={() => hasAEs ? toggleExpand(item.meta.id) : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 12px',
                  gap: 8,
                  cursor: hasAEs ? 'pointer' : 'default',
                  background: hasAEs ? '#fffdf9' : '#fff',
                  transition: 'background 0.1s',
                }}
              >
                {/* File icon */}
                <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>

                {/* Name + meta */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 600, color: '#1a1a2e',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {item.meta.name}
                  </div>
                  <div style={{ fontSize: 9.5, color: '#A0AEC0', marginTop: 1 }}>
                    {formatBytes(item.meta.size)}
                    {item.result && (
                      <span style={{ marginLeft: 6 }}>
                        · {item.result.extractedChars.toLocaleString()} chars via {item.result.extractionMethod}
                        {item.result.ocrConfidence && ` (OCR ${Math.round(item.result.ocrConfidence * 100)}%)`}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status badge */}
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  {item.status === 'pending' && item.isProcessable && (
                    <span style={{ fontSize: 9.5, color: '#A0AEC0' }}>Ready</span>
                  )}
                  {item.status === 'pending' && !item.isProcessable && (
                    <span style={{ fontSize: 9.5, color: '#CBD5E0' }}>Unsupported</span>
                  )}
                  {item.status === 'fetching' && (
                    <span style={{ fontSize: 9.5, color: '#718096', fontStyle: 'italic' }}>Fetching…</span>
                  )}
                  {item.status === 'analyzing' && (
                    <span style={{ fontSize: 9.5, color: '#3182CE', fontStyle: 'italic' }}>Claude OCR…</span>
                  )}
                  {item.status === 'skipped' && (
                    <span style={{ fontSize: 9.5, color: '#CBD5E0' }}>Skipped</span>
                  )}
                  {item.status === 'error' && (
                    <span title={item.error ?? ''} style={{ fontSize: 9.5, color: '#FC8181' }}>⚠ Error</span>
                  )}
                  {item.status === 'done' && !hasAEs && (
                    <span style={{ fontSize: 9.5, color: '#48BB78', fontWeight: 700 }}>✓ Clean</span>
                  )}
                  {item.status === 'done' && hasAEs && (
                    <span style={{
                      fontSize: 9.5, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                      background: sevColor.bg, color: sevColor.text,
                    }}>
                      {item.result!.findings.length} AE{item.result!.findings.length !== 1 ? 's' : ''}
                      {' '}{isExpanded ? '▲' : '▼'}
                    </span>
                  )}
                </div>
              </div>

              {/* Expanded findings */}
              {isExpanded && hasAEs && item.result && (
                <div style={{ padding: '0 12px 12px', background: '#FFFDF9' }}>
                  {/* Summary */}
                  {item.result.summary && (
                    <div style={{
                      fontSize: 11, color: '#4A5568', background: '#EBF4FF', borderRadius: 6,
                      padding: '7px 10px', marginBottom: 8, lineHeight: 1.5,
                      border: '1px solid #BEE3F8',
                    }}>
                      <span style={{ fontWeight: 700, color: '#2B6CB0' }}>Summary: </span>
                      {item.result.summary}
                    </div>
                  )}
                  {/* Monograph */}
                  {item.result.monograph && (
                    <div style={{
                      fontSize: 10.5, background: '#FAF5FF', border: '1px solid #E9D8FD',
                      borderRadius: 6, padding: '5px 10px', marginBottom: 8, color: '#6B46C1',
                    }}>
                      💊 Drug detected: <strong>{item.result.monograph.brandName}</strong>
                      {' '}({item.result.monograph.genericName})
                    </div>
                  )}
                  {/* Findings */}
                  {item.result.findings.map((f, i) => (
                    <FindingCard key={f.id} finding={f} index={i} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {attachments.length === 0 && phase === 'done' && (
          <div style={{ padding: '20px', textAlign: 'center', color: '#A0AEC0', fontSize: 11 }}>
            No attachments found
          </div>
        )}
      </div>
    </div>
  );
}
