import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import Anthropic from '@anthropic-ai/sdk';

let _claudeClient: Anthropic | null = null;
function claudeClient(): Anthropic {
  if (!_claudeClient) _claudeClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _claudeClient;
}

export interface BoundingBox {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
}

export interface ExtractionResult {
  text: string;
  method: 'pdf-parse' | 'claude-vision' | 'mammoth' | 'plaintext';
  confidence: number | null;
  boundingBoxes: BoundingBox[] | null;
}

const MIN_TEXT_LENGTH = 50; // chars — below this, treat as scanned/image PDF

/**
 * Extract text from a PDF buffer.
 * Tries pdf-parse first (native text layer).
 * Falls back to Claude Vision OCR for scanned/image-only PDFs.
 */
export async function extractFromPdf(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const data = await pdfParse(buffer);
    const text = data.text.trim();

    if (text.length >= MIN_TEXT_LENGTH) {
      return { text, method: 'pdf-parse', confidence: null, boundingBoxes: null };
    }
    // Insufficient text → scanned PDF, fall through to Claude Vision
  } catch {
    // pdf-parse failed entirely → try vision
  }

  return extractWithClaudeVision(buffer, 'application/pdf');
}

/**
 * Extract text from an image buffer (PNG, JPEG) via Claude Vision.
 * Also handles doctor handwriting via OCR.
 */
export async function extractFromImage(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractionResult> {
  return extractWithClaudeVision(buffer, mimeType);
}

/**
 * Extract text from a DOCX buffer using mammoth.
 */
export async function extractFromDocx(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.trim();
    if (text.length >= MIN_TEXT_LENGTH) {
      return { text, method: 'mammoth', confidence: null, boundingBoxes: null };
    }
    // Empty DOCX (e.g., image-only) — fall back to Claude Vision
    return extractWithClaudeVision(buffer, 'image/png');
  } catch {
    return extractWithClaudeVision(buffer, 'image/png');
  }
}

/**
 * Extract text from an RTF buffer.
 * Uses simple regex stripping for basic RTF; Claude Vision fallback for complex cases.
 */
export async function extractFromRtf(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const raw = buffer.toString('utf-8');
    // Strip RTF control words, groups, and special characters
    const stripped = raw
      .replace(/\{[^{}]*\}/g, ' ')       // remove {...} groups
      .replace(/\\[a-z]+\-?\d*\s?/g, '') // remove \controlwords
      .replace(/[{}\\]/g, ' ')            // remove stray braces and backslashes
      .replace(/\s+/g, ' ')               // collapse whitespace
      .trim();

    if (stripped.length >= MIN_TEXT_LENGTH) {
      return { text: stripped, method: 'plaintext', confidence: null, boundingBoxes: null };
    }
  } catch {
    // fall through
  }

  return extractWithClaudeVision(buffer, 'image/png');
}

/**
 * Extract plain text from a text/plain buffer.
 */
export async function extractFromText(buffer: Buffer): Promise<ExtractionResult> {
  const text = buffer.toString('utf-8').trim();
  return { text, method: 'plaintext', confidence: null, boundingBoxes: null };
}

/**
 * Universal extraction dispatcher.
 * Routes to the correct extractor based on MIME type.
 */
export async function extractText(buffer: Buffer, mimeType: string): Promise<ExtractionResult> {
  switch (mimeType) {
    case 'application/pdf':
      return extractFromPdf(buffer);

    case 'image/png':
    case 'image/jpeg':
    case 'image/jpg':
    case 'image/gif':
    case 'image/webp':
      return extractFromImage(buffer, mimeType);

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return extractFromDocx(buffer);

    case 'application/rtf':
    case 'text/rtf':
      return extractFromRtf(buffer);

    case 'text/plain':
      return extractFromText(buffer);

    default:
      // Unknown type — attempt Claude Vision as last resort
      return extractWithClaudeVision(buffer, 'image/png');
  }
}

async function extractWithClaudeVision(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractionResult> {
  const base64 = buffer.toString('base64');

  // Claude Vision supports these media types
  const supportedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  const mediaType = supportedTypes.includes(mimeType)
    ? (mimeType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp')
    : 'image/png';

  const response = await claudeClient().messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: 'Extract ALL text from this document exactly as written, including any handwritten text. Return only the extracted text with no commentary, formatting notes, or explanations. If the document contains handwriting, transcribe it as accurately as possible.',
          },
        ],
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  return {
    text,
    method: 'claude-vision',
    confidence: 0.85, // Conservative default for Claude OCR
    boundingBoxes: null, // Claude Vision does not return bounding boxes natively
  };
}
