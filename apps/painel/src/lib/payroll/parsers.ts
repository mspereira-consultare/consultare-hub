import 'server-only';

const clean = (value: unknown) => String(value ?? '').trim();

export const sanitizeStoragePart = (value: string) =>
  clean(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
