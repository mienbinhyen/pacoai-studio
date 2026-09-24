import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));

// Helper to convert raw PCM (16-bit linear mono) to standard WAV buffer
function pcmToWav(
  pcmBuffer: Buffer,
  sampleRate = 24000,
  numChannels = 1,
  bitsPerSample = 16
): Buffer {
  // If the buffer already starts with RIFF, it's already encoded as WAV
  if (
    pcmBuffer.length >= 12 &&
    pcmBuffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    pcmBuffer.subarray(8, 12).toString('ascii') === 'WAVE'
  ) {
    return pcmBuffer;
  }

  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);

  // fmt subchunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // SubChunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  // data subchunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

// Tải toàn bộ mã nguồn sạch (.ZIP) chuẩn WinRAR & Windows Explorer
app.get('/api/download-zip', (_req, res) => {
  try {
    const zipPath = path.resolve('/tmp', 'pacoai-tts-source.zip');
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
    const pyScript = `import zipfile, os
zip_path = r'${zipPath}'
with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in ['node_modules', '.git', 'dist', '.cache', '.system_generated', '.aistudio', '.local', '.npm'] and not d.startswith('.')]
        for f in files:
            if not f.startswith('.') and not f.endswith('.zip') and not f.endswith('.py'):
                full_path = os.path.join(root, f)
                rel_path = os.path.relpath(full_path, '.')
                arcname = rel_path.replace(os.path.sep, '/')
                z.write(full_path, arcname)
`;
    fs.writeFileSync('/tmp/make_zip.py', pyScript, 'utf8');
    execSync('python3 /tmp/make_zip.py', { cwd: process.cwd() });

    const stat = fs.statSync(zipPath);
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="pacoai-tts-source.zip"',
      'Content-Length': stat.size,
    });
    const readStream = fs.createReadStream(zipPath);
    readStream.pipe(res);
  } catch (err: any) {
    console.error('Lỗi khi nén mã nguồn:', err);
    res.status(500).json({ error: 'Không thể tạo file nén mã nguồn.' });
  }
});

// Cache for generated audio to save quota and speed up repeated previews
const ttsCache = new Map<
  string,
  {
    audioUrl: string;
    sampleRate: number;
    durationEstimate: number;
    modelUsed: string;
    voiceUsed: string;
  }
>();

// TTS Generation API
app.post('/api/tts/generate', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        error:
          'Chưa cấu hình GEMINI_API_KEY. Vui lòng cấu hình API key trong mục Secrets.',
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const {
      mode = 'single', // 'single' | 'dialogue'
      text,
      voice = 'Algieba',
      style,
      model = 'gemini-3.8-flash-tts',
      dialogue = [],
      speakers = {
        speaker1: { name: 'Người dẫn A', voice: 'Puck' },
        speaker2: { name: 'Người dẫn B', voice: 'Kore' },
      },
    } = req.body;

    // Cache key calculation
    const cacheKey =
      mode === 'dialogue'
        ? `dialogue:${JSON.stringify(speakers)}:${JSON.stringify(dialogue)}`
        : `single:${voice}:${text?.trim()}:${style || ''}`;

    const cachedResult = ttsCache.get(cacheKey);
    if (cachedResult) {
      res.json({
        success: true,
        audioUrl: cachedResult.audioUrl,
        sampleRate: cachedResult.sampleRate,
        durationEstimate: cachedResult.durationEstimate,
        modelUsed: `${cachedResult.modelUsed} (Bộ nhớ đệm)`,
        voiceUsed: cachedResult.voiceUsed,
        mimeType: 'audio/wav',
      });
      return;
    }

    // Determine target models to attempt (primary and fallback)
    const primaryModel = model || 'gemini-3.8-flash-tts';
    const fallbackModel =
      primaryModel === 'gemini-3.8-flash-tts'
        ? 'gemini-3.8-flash-lite-tts'
        : 'gemini-3.8-flash-tts';

    const modelsToTry = [primaryModel, fallbackModel];
    let geminiResponse: any = null;
    let successfulModel = primaryModel;
    let lastError: any = null;

    for (const targetModel of modelsToTry) {
      try {
        if (mode === 'dialogue') {
          if (!Array.isArray(dialogue) || dialogue.length === 0) {
            res.status(400).json({ error: 'Nội dung hội thoại không được để trống.' });
            return;
          }

          const spk1Name = speakers.speaker1?.name || 'Speaker 1';
          const spk2Name = speakers.speaker2?.name || 'Speaker 2';
          const spk1Voice = speakers.speaker1?.voice || 'Puck';
          const spk2Voice = speakers.speaker2?.voice || 'Kore';

          const parts = dialogue.map((line: { speaker: string; text: string; style?: string }) => {
            const isSpk1 = line.speaker === spk1Name || line.speaker === '1';
            const speakerName = isSpk1 ? spk1Name : spk2Name;
            return {
              text: `${speakerName}: ${line.text}`,
              speechMetadata: {
                speaker: speakerName,
                style: line.style || undefined,
              },
            };
          });

          geminiResponse = await ai.models.generateContent({
            model: targetModel,
            contents: [
              {
                role: 'user',
                parts,
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                multiSpeakerVoiceConfig: {
                  speakerVoiceConfigs: [
                    {
                      speaker: spk1Name,
                      voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: spk1Voice },
                      },
                    },
                    {
                      speaker: spk2Name,
                      voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: spk2Voice },
                      },
                    },
                  ],
                },
              },
            },
          });
        } else {
          // Single speaker mode
          if (!text || typeof text !== 'string' || text.trim().length === 0) {
            res.status(400).json({ error: 'Vui lòng nhập đoạn văn bản cần chuyển đổi.' });
            return;
          }

          geminiResponse = await ai.models.generateContent({
            model: targetModel,
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: text.trim(),
                    speechMetadata: style ? { style } : undefined,
                  },
                ],
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: voice },
                },
              },
            },
          });
        }

        const candidate = geminiResponse?.candidates?.[0];
        const part = candidate?.content?.parts?.[0];
        if (part?.inlineData?.data) {
          successfulModel = targetModel;
          break; // Succeeded!
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Thử mô hình ${targetModel} gặp lỗi, chuẩn bị thử mô hình dự phòng:`, err?.message);
        continue;
      }
    }

    const candidate = geminiResponse?.candidates?.[0];
    const part = candidate?.content?.parts?.[0];
    const base64Audio = part?.inlineData?.data;
    const returnedMimeType = part?.inlineData?.mimeType || 'audio/pcm;rate=24000';

    if (!base64Audio) {
      const errMsg = lastError?.message || '';
      let userFriendlyErr =
        'Không thể tạo dữ liệu âm thanh từ Google Gemini TTS. Vui lòng thử lại sau giây lát.';
      if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED')) {
        userFriendlyErr =
          'Hệ thống Google TTS đang tạm thời đạt giới hạn tần suất yêu cầu (Rate Limit/Quota). Vui lòng đợi khoảng 15-30 giây hoặc sử dụng mã API Key cá nhân trong mục "Cài đặt API".';
      }
      res.status(502).json({
        error: userFriendlyErr,
        rawError: errMsg,
      });
      return;
    }

    // Extract sample rate if present in mimeType, default 24000
    let sampleRate = 24000;
    const rateMatch = returnedMimeType.match(/rate=(\d+)/);
    if (rateMatch && rateMatch[1]) {
      sampleRate = parseInt(rateMatch[1], 10);
    }

    const rawBuffer = Buffer.from(base64Audio, 'base64');
    const wavBuffer = pcmToWav(rawBuffer, sampleRate, 1, 16);
    const wavBase64 = wavBuffer.toString('base64');
    const dataUrl = `data:audio/wav;base64,${wavBase64}`;

    // Calculate approximate duration in seconds
    const durationSeconds = rawBuffer.length / (sampleRate * 2);
    const durationEstimate = Number(durationSeconds.toFixed(2));

    // Cache the result (keep cache size reasonable up to 100 items)
    if (ttsCache.size > 100) {
      const firstKey = ttsCache.keys().next().value;
      if (firstKey) ttsCache.delete(firstKey);
    }
    ttsCache.set(cacheKey, {
      audioUrl: dataUrl,
      sampleRate,
      durationEstimate,
      modelUsed: successfulModel,
      voiceUsed: voice,
    });

    res.json({
      success: true,
      audioUrl: dataUrl,
      sampleRate,
      durationEstimate,
      modelUsed: successfulModel,
      voiceUsed: voice,
      mimeType: 'audio/wav',
    });
  } catch (error: any) {
    console.error('Error generating speech:', error);
    const message =
      error?.message ||
      'Đã xảy ra lỗi khi tạo giọng nói. Vui lòng kiểm tra lại cấu hình hoặc thử lại.';
    res.status(500).json({ error: message });
  }
});

// Setup Vite or static serving
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
