import { Injectable, Logger, InternalServerErrorException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const WHISPER_MODEL = 'whisper-large-v3';
const TRANSCRIPTION_PATH = '/audio/transcriptions';

@Injectable()
export class WhisperService implements OnModuleInit {
  private readonly logger = new Logger(WhisperService.name);
  private baseUrl!: string;
  private apiKey!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.baseUrl = this.config.get<string>('WHISPER_BASE_URL', 'https://api.groq.com/openai/v1');
    this.apiKey = this.config.getOrThrow<string>('WHISPER_API_KEY');
  }

  async transcribe(audioBuffer: Buffer, mimeType: string, filename = 'audio'): Promise<string> {
    const ext = this.extFromMime(mimeType);
    const formData = new FormData();
    const slice = audioBuffer.buffer.slice(
      audioBuffer.byteOffset,
      audioBuffer.byteOffset + audioBuffer.byteLength,
    ) as ArrayBuffer;
    formData.append('file', new Blob([slice], { type: mimeType }), `${filename}.${ext}`);
    formData.append('model', WHISPER_MODEL);
    formData.append('response_format', 'text');
    formData.append('language', 'pt');

    const url = `${this.baseUrl}${TRANSCRIPTION_PATH}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`Whisper API error ${res.status}: ${body}`);
      throw new InternalServerErrorException(`Whisper transcription failed (${res.status})`);
    }

    const transcript = await res.text();
    return transcript.trim();
  }

  private extFromMime(mimeType: string): string {
    const map: Record<string, string> = {
      'audio/webm': 'webm',
      'audio/ogg': 'ogg',
      'audio/mp4': 'mp4',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
      'audio/flac': 'flac',
    };
    return map[mimeType] ?? 'webm';
  }
}
