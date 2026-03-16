import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import prisma from '../lib/prisma';

// ─── FFmpeg Binary ──────────────────────────────────────────────────────────

let FFMPEG_BIN = 'ffmpeg';
try {
  // Use ffmpeg-static if available (no system FFmpeg needed)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  FFMPEG_BIN = require('ffmpeg-static') as string;
} catch {
  // Fallback to system ffmpeg
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getOpenAIClient(): Promise<OpenAI> {
  const config = await prisma.whatsAppConfig.findFirst();
  const key = config?.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OpenAI API Key não configurada');
  return new OpenAI({ apiKey: key });
}

function convertOggToWav(inputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const outputPath = inputPath.replace(/\.[^.]+$/, '.wav');
    const ffmpeg = spawn(FFMPEG_BIN, [
      '-y',
      '-i', inputPath,
      '-ar', '16000',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      outputPath,
    ]);

    let stderr = '';
    ffmpeg.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    ffmpeg.on('close', (code: number | null) => {
      if (code === 0) resolve(outputPath);
      else reject(new Error(`FFmpeg falhou (code ${code}): ${stderr.slice(-300)}`));
    });

    ffmpeg.on('error', (err: Error) => {
      reject(new Error(
        `FFmpeg não encontrado. Instale o FFmpeg e adicione ao PATH. Detalhe: ${err.message}`,
      ));
    });
  });
}

// ─── Main Function ──────────────────────────────────────────────────────────

/**
 * Transcribes a base64-encoded OGG audio file to text using OpenAI Whisper.
 * Converts OGG to WAV via FFmpeg first, then sends to Whisper API.
 *
 * Returns null if FFmpeg is not available (graceful fallback).
 */
export async function transcribeAudio(base64String: string): Promise<string | null> {
  const id = uuidv4();
  const inputPath = path.join(os.tmpdir(), `audio_${id}.ogg`);
  let wavPath: string | null = null;

  try {
    const buffer = Buffer.from(base64String, 'base64');
    fs.writeFileSync(inputPath, buffer);

    try {
      wavPath = await convertOggToWav(inputPath);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('não encontrado') || message.includes('ENOENT')) {
        console.warn('[AudioTranscriber] FFmpeg não disponível — transcrição de áudio desativada');
        return null;
      }
      throw err;
    }

    const openai = await getOpenAIClient();
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(wavPath),
      model: 'whisper-1',
      language: 'pt',
    });

    return transcription.text;
  } finally {
    try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
    if (wavPath) {
      try { fs.unlinkSync(wavPath); } catch { /* ignore */ }
    }
  }
}
