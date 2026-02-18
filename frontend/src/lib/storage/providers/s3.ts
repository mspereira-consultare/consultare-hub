import 'server-only';

import { Readable } from 'stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type {
  DeleteFileParams,
  DownloadFileParams,
  StorageProvider,
  UploadFileParams,
  UploadFileResult,
} from '@/lib/storage/provider';

const requiredEnv = (name: string) => {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Variavel obrigatoria ausente para S3: ${name}`);
  return value;
};

export class S3StorageProvider implements StorageProvider {
  readonly name = 's3';
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor() {
    const region = requiredEnv('AWS_REGION');
    this.bucket = requiredEnv('AWS_S3_BUCKET');
    const accessKeyId = requiredEnv('AWS_ACCESS_KEY_ID');
    const secretAccessKey = requiredEnv('AWS_SECRET_ACCESS_KEY');

    this.client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async uploadFile(params: UploadFileParams): Promise<UploadFileResult> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      Metadata: params.metadata,
    });

    const result = await this.client.send(command);
    return {
      provider: this.name,
      bucket: this.bucket,
      key: params.key,
      etag: result.ETag ? String(result.ETag).replaceAll('"', '') : null,
    };
  }

  async getFileStream(params: DownloadFileParams): Promise<Readable> {
    const bucket = params.bucket || this.bucket;
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: params.key,
    });
    const result = await this.client.send(command);

    if (!result.Body) {
      throw new Error('Arquivo nao encontrado no S3.');
    }

    const body = result.Body;
    if (body instanceof Readable) return body;

    if (typeof (body as any).transformToWebStream === 'function') {
      const webStream = (body as any).transformToWebStream();
      return Readable.fromWeb(webStream);
    }

    throw new Error('Formato de stream nao suportado para download S3.');
  }

  async deleteFile(params: DeleteFileParams): Promise<void> {
    const bucket = params.bucket || this.bucket;
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: params.key,
    });
    await this.client.send(command);
  }
}

