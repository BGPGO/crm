/**
 * Compressão de vídeo pra caber no limite do WhatsApp Cloud API (16MB, MP4 H.264+AAC).
 *
 * Usa o ffmpeg-static (já dependência do projeto). Estratégia:
 *   1. Probe da duração/resolução parseando o stderr do `ffmpeg -i` (sem ffprobe).
 *   2. Bitrate de vídeo calculado pra mirar ~93% do limite (margem de container),
 *      áudio fixo em 96kbps, resolução limitada a 720p (480p na última tentativa).
 *   3. Até 3 tentativas com fator decrescente se o resultado ainda passar do limite.
 *
 * Também serve como conversor: entrada pode ser qualquer formato que o ffmpeg leia
 * (.mov de iPhone, .webm, etc) — a saída é sempre MP4 compatível com WhatsApp.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import ffmpegPath from 'ffmpeg-static';

const execFileAsync = promisify(execFile);
const FFMPEG = ffmpegPath as unknown as string;

const AUDIO_KBPS = 96;
const MIN_VIDEO_KBPS = 150;
const MAX_VIDEO_KBPS = 4000;
const CONTAINER_MARGIN = 0.93; // sobra pra overhead do container MP4

export interface VideoProbe {
  durationSec: number;
  width: number | null;
  height: number | null;
}

export interface CompressVideoResult {
  buffer: Buffer;
  durationSec: number;
  attempts: number;
  videoKbps: number;
  targetHeight: number | null;
}

/**
 * Extrai duração e resolução do stderr do ffmpeg (`-i` sem output sai com código 1,
 * mas imprime os metadados — é o probe mais barato sem depender de ffprobe).
 */
export async function probeVideo(inputPath: string): Promise<VideoProbe> {
  let stderr = '';
  try {
    const res = await execFileAsync(FFMPEG, ['-hide_banner', '-i', inputPath], {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30_000,
    });
    stderr = String(res.stderr || '');
  } catch (err: any) {
    stderr = String(err.stderr || '');
  }

  const durMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!durMatch) {
    throw new Error('Não consegui ler a duração do vídeo (arquivo corrompido ou formato não suportado).');
  }
  const durationSec =
    parseInt(durMatch[1], 10) * 3600 + parseInt(durMatch[2], 10) * 60 + parseFloat(durMatch[3]);
  if (!durationSec || durationSec <= 0) {
    throw new Error('Vídeo com duração zero — arquivo inválido.');
  }

  const videoLine = stderr.split('\n').find((l) => /Stream #.*Video:/.test(l)) || '';
  const dimMatch = videoLine.match(/(\d{2,5})x(\d{2,5})/);

  return {
    durationSec,
    width: dimMatch ? parseInt(dimMatch[1], 10) : null,
    height: dimMatch ? parseInt(dimMatch[2], 10) : null,
  };
}

/**
 * Comprime/converte o vídeo pra MP4 H.264+AAC dentro de `limitBytes`.
 * Lança erro se mesmo na tentativa mais agressiva não couber no limite.
 */
export async function compressVideoToLimit(
  input: Buffer,
  limitBytes: number,
): Promise<CompressVideoResult> {
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const inPath = path.join(os.tmpdir(), `wa-compress-in-${stamp}`);
  const outPath = path.join(os.tmpdir(), `wa-compress-out-${stamp}.mp4`);

  fs.writeFileSync(inPath, input);
  try {
    const probe = await probeVideo(inPath);

    const totalKbps = ((limitBytes * 8) / 1000 / probe.durationSec) * CONTAINER_MARGIN;

    // Tentativas: fator sobre o bitrate + teto de resolução
    const attempts: Array<{ factor: number; maxHeight: number }> = [
      { factor: 1.0, maxHeight: 720 },
      { factor: 0.8, maxHeight: 720 },
      { factor: 0.6, maxHeight: 480 },
    ];

    for (let i = 0; i < attempts.length; i++) {
      const { factor, maxHeight } = attempts[i];
      const videoKbps = Math.round(
        Math.min(MAX_VIDEO_KBPS, Math.max(MIN_VIDEO_KBPS, totalKbps * factor - AUDIO_KBPS)),
      );

      const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', inPath];
      let targetHeight: number | null = null;
      if (probe.height && probe.height > maxHeight) {
        targetHeight = maxHeight;
        args.push('-vf', `scale=-2:${maxHeight}`);
      }
      args.push(
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-profile:v', 'main',
        '-pix_fmt', 'yuv420p',
        '-b:v', `${videoKbps}k`,
        '-maxrate', `${Math.round(videoKbps * 1.3)}k`,
        '-bufsize', `${videoKbps * 2}k`,
        '-c:a', 'aac',
        '-b:a', `${AUDIO_KBPS}k`,
        '-movflags', '+faststart',
        outPath,
      );

      await execFileAsync(FFMPEG, args, {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 4 * 60_000,
      });

      const size = fs.statSync(outPath).size;
      if (size <= limitBytes) {
        return {
          buffer: fs.readFileSync(outPath),
          durationSec: probe.durationSec,
          attempts: i + 1,
          videoKbps,
          targetHeight,
        };
      }
    }

    throw new Error(
      `Mesmo comprimido o vídeo não coube em ${(limitBytes / 1024 / 1024).toFixed(0)}MB — ele é longo demais. Encurte o vídeo e tente de novo.`,
    );
  } finally {
    for (const p of [inPath, outPath]) {
      try { fs.unlinkSync(p); } catch { /* já não existe */ }
    }
  }
}
