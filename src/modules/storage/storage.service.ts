import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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
}
