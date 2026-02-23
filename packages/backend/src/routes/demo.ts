import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { transcribeAudio, formatTranscriptAsEmailBody } from '../services/whisper';

const router = Router();

// Use memory storage — we process the buffer directly, no disk writes needed
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB — Whisper API limit
  },
  fileFilter: (_req, file, callback) => {
    const allowedTypes = [
      'audio/mpeg',
      'audio/mp3',
      'audio/mp4',
      'audio/m4a',
      'audio/wav',
      'audio/wave',
      'audio/webm',
      'audio/ogg',
      'video/mp4', // some recorders save as mp4
    ];
    if (allowedTypes.includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(new Error(`Unsupported audio format: ${file.mimetype}. Use mp3, wav, m4a, or webm.`));
    }
  },
});

/**
 * POST /api/demo/transcribe
 * Accept an audio file and transcribe it using OpenAI Whisper.
 * Returns the transcript as plain text, optionally formatted as an email body.
 *
 * Form fields:
 *   - audio (required): the audio file
 *   - format (optional): "raw" | "email" — default "email"
 */
router.post(
  '/transcribe',
  upload.single('audio'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No audio file provided. Send a file in the "audio" field.' });
        return;
      }

      const format = (req.body.format as string) ?? 'email';

      console.log(
        `Transcribing audio: ${req.file.originalname} (${(req.file.size / 1024).toFixed(0)} KB)`
      );

      const { transcript, language } = await transcribeAudio(
        req.file.buffer,
        req.file.originalname || 'recording.mp3',
        req.file.mimetype
      );

      const emailBody =
        format === 'raw' ? transcript : formatTranscriptAsEmailBody(transcript);

      console.log(`✅ Transcription complete — ${transcript.length} chars, language: ${language}`);

      res.json({
        transcript,
        emailBody,
        language,
        wordCount: transcript.split(/\s+/).length,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
