import 'server-only';

import type { Readable } from 'stream';

export type UploadFileParams = {
  key: string;
  body: Buffer;
  contentType: string;
  metadata?: Record<string, string>;
};

export type UploadFileResult = {
  provider: string;
  bucket: string | null;
  key: string;
  etag: string | null;
};

export type DownloadFileParams = {
  bucket?: string | null;
  key: string;
};

export type DeleteFileParams = {
  bucket?: string | null;
  key: string;
};

export interface StorageProvider {
  readonly name: string;
  uploadFile(params: UploadFileParams): Promise<UploadFileResult>;
  getFileStream(params: DownloadFileParams): Promise<Readable>;
  deleteFile(params: DeleteFileParams): Promise<void>;
}

