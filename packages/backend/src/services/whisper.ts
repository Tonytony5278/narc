import OpenAI from 'openai';
import { Readable } from 'stream';

// Lazy singleton — deferred until first call so dotenv has run by then
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI();
  return _openai;
}

/**
 * Transcribe an audio buffer using OpenAI Whisper.
 * Supports: mp3, mp4, mpeg, mpga, m4a, wav, webm (max 25MB)
 */
export async function transcribeAudio(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<{ transcript: string; language?: string }> {
  // Whisper requires a File-like object with a name
  const file = new File([buffer], filename, { type: mimeType });

  const transcription = await getOpenAI().audio.transcriptions.create({
    file,
    model: 'whisper-1',
    response_format: 'verbose_json', // includes language detection
    language: 'en', // hint to Whisper — improves accuracy for English calls
  });

  return {
    transcript: transcription.text,
    language: transcription.language,
  };
}

/**
 * Format a transcript as an email-ready body for the demo flow.
 * This simulates the AI sending an email after the call ends.
 */
export function formatTranscriptAsEmailBody(
  transcript: string,
  callDate: Date = new Date()
): string {
  return [
    `[Automated call transcript — ${callDate.toLocaleString()}]`,
    '',
    transcript,
    '',
    '---',
    'This transcript was automatically generated from a recorded patient support call.',
    'Review for potential adverse events.',
  ].join('\n');
}
