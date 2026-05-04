import 'server-only';

import { getStorageProvider } from '@/lib/storage';
import { createRecruitmentCandidateFileRecord, RecruitmentValidationError } from '@/lib/recrutamento/repository';
import type { DbInterface } from '@/lib/db';

const sanitizePart = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

export const buildRecruitmentStorageKey = (candidateId: string, originalName: string) => {
  const prefix = String(process.env.AWS_S3_PREFIX || 'recrutamento/').replace(/^\/+|\/+$/g, '');
  const fileName = sanitizePart(originalName) || 'curriculo.bin';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}/candidatos/${candidateId}/${stamp}-${fileName}`;
};

export const storeRecruitmentCandidateFile = async (
  db: DbInterface,
  payload: {
    candidateId: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    content: Buffer;
    uploadedBy: string;
  },
  actorUserId: string,
) => {
  if (payload.sizeBytes <= 0) {
    throw new RecruitmentValidationError('Arquivo vazio.');
  }

  const provider = getStorageProvider();
  const upload = await provider.uploadFile({
    key: buildRecruitmentStorageKey(payload.candidateId, payload.originalName),
    body: payload.content,
    contentType: payload.mimeType,
    metadata: { candidateId: payload.candidateId },
  });

  try {
    await createRecruitmentCandidateFileRecord(
      db,
      payload.candidateId,
      {
        originalName: payload.originalName,
        mimeType: payload.mimeType,
        sizeBytes: payload.sizeBytes,
        storageProvider: upload.provider,
        storageBucket: upload.bucket,
        storageKey: upload.key,
        uploadedBy: payload.uploadedBy,
      },
      actorUserId,
    );
  } catch (error) {
    try {
      await provider.deleteFile({ bucket: upload.bucket, key: upload.key });
    } catch (cleanupError) {
      console.error('Falha ao limpar arquivo de recrutamento após erro:', cleanupError);
    }
    throw error;
  }

  return upload;
};
