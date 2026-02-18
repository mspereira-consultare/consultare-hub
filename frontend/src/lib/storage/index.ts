import 'server-only';

import type { StorageProvider } from '@/lib/storage/provider';
import { S3StorageProvider } from '@/lib/storage/providers/s3';

let cachedProvider: StorageProvider | null = null;

const resolveProviderName = () => {
  const raw = String(process.env.STORAGE_PROVIDER || 's3').trim().toLowerCase();
  return raw || 's3';
};

const buildProvider = (providerName: string): StorageProvider => {
  if (providerName !== 's3') {
    throw new Error(
      `Storage provider "${providerName}" nao suportado. Configure STORAGE_PROVIDER=s3.`
    );
  }
  return new S3StorageProvider();
};

export const getStorageProvider = (): StorageProvider => {
  if (cachedProvider) return cachedProvider;

  const providerName = resolveProviderName();
  cachedProvider = buildProvider(providerName);
  return cachedProvider;
};

export const getStorageProviderByName = (providerNameRaw: string): StorageProvider => {
  const providerName = String(providerNameRaw || '').trim().toLowerCase();
  if (!providerName) {
    return getStorageProvider();
  }

  if (cachedProvider && cachedProvider.name === providerName) return cachedProvider;
  return buildProvider(providerName);
};
