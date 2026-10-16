import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Quantos DeleteObject seguem em paralelo em `deleteObjects`. */
const DELETE_CONCURRENCY = 10;

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client | null = null;
  private bucket = 'documents';

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('MINIO_ENDPOINT');
    const accessKey = this.config.get<string>('MINIO_ACCESS_KEY');
    const secretKey = this.config.get<string>('MINIO_SECRET_KEY');
    this.bucket = this.config.get<string>('MINIO_BUCKET') ?? 'documents';

    if (endpoint && accessKey && secretKey) {
      this.client = new S3Client({
        endpoint,
        region: 'us-east-1',
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
        forcePathStyle: true,
      });
      this.logger.log(`Storage configured (bucket: ${this.bucket})`);
    } else {
      this.logger.warn('MINIO_ENDPOINT/ACCESS_KEY/SECRET_KEY not configured — storage disabled');
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    if (!this.client) return;
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async getPresignedUrl(key: string, expiresIn = 900): Promise<string | null> {
    if (!this.client) return null;
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, cmd, { expiresIn });
  }

  /**
   * Apaga objetos do bucket — usado no apagamento LGPD (Art. 18, VI).
   *
   * Diferente de `upload` (best-effort), falha alto: quem apaga precisa saber
   * se algum objeto ficou para trás, inclusive quando o storage não está
   * configurado. Apagar chave inexistente é sucesso no S3/MinIO, então repetir
   * a chamada depois de uma falha é seguro.
   *
   * Um DeleteObject por chave em vez de DeleteObjects: cada falha vira exceção,
   * sem precisar inspecionar o `Errors` de uma resposta 200 do lote.
   */
  async deleteObjects(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return;

    const client = this.client;
    if (!client) {
      throw new Error(`Storage not configured — cannot delete ${keys.length} object(s)`);
    }

    for (let i = 0; i < keys.length; i += DELETE_CONCURRENCY) {
      await Promise.all(
        keys
          .slice(i, i + DELETE_CONCURRENCY)
          .map((key) => client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))),
      );
    }
  }
}
