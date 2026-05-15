import { Buffer } from 'buffer';
import {
  buildKnowledgeChunksForSource,
  getKnowledgeSourceById,
  listPendingKnowledgeSources,
  markKnowledgeSourceFailed,
  replaceKnowledgeSourceChunks,
  syncPublishedKnowledgeSources,
  type KnowledgeSource,
} from '@consultare/core/intranet/chatbot';
import type { DbInterface } from '@consultare/core/db';
import { getStorageProviderByName } from '@consultare/core/storage';

const OPENAI_API_URL = 'https://api.openai.com/v1';

const requireOpenAiKey = () => {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    const error = new Error('OPENAI_API_KEY nao configurada para indexacao da base de conhecimento.');
    (error as Error & { status?: number }).status = 503;
    throw error;
  }
  return apiKey;
};

const getEmbeddingModel = () =>
  String(process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small').trim() || 'text-embedding-3-small';

const parseOpenAiError = async (response: Response) => {
  try {
    const json = await response.json();
    return String(json?.error?.message || json?.error || `Falha HTTP ${response.status}`);
  } catch {
    return `Falha HTTP ${response.status}`;
  }
};

const embedMany = async (texts: string[]) => {
  if (!texts.length) return { embeddings: [] as number[][], model: getEmbeddingModel() };
  const response = await fetch(`${OPENAI_API_URL}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireOpenAiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: getEmbeddingModel(),
      input: texts,
    }),
  });

  if (!response.ok) {
    const error = new Error(await parseOpenAiError(response));
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  const json = (await response.json()) as { data?: Array<{ embedding?: number[] }>; model?: string };
  return {
    embeddings: Array.isArray(json.data) ? json.data.map((item) => item.embedding || []) : [],
    model: String(json.model || getEmbeddingModel()),
  };
};

const streamToBuffer = async (stream: NodeJS.ReadableStream) => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const loadAssetFileText = async (source: KnowledgeSource) => {
  const meta = source.metaJson || {};
  const provider = getStorageProviderByName(String(meta.storageProvider || 's3'));
  const stream = await provider.getFileStream({
    bucket: meta.storageBucket ? String(meta.storageBucket) : null,
    key: String(meta.storageKey || ''),
  });
  const buffer = await streamToBuffer(stream);
  const mimeType = String(meta.mimeType || '').toLowerCase();
  const fileName = String(source.title || '').toLowerCase();

  if (mimeType.includes('text/plain') || mimeType.includes('markdown') || fileName.endsWith('.md') || fileName.endsWith('.txt')) {
    return buffer.toString('utf-8');
  }

  throw new Error('Formato de arquivo ainda nao suportado para indexacao inline. Use TXT ou Markdown no V1.');
};

const ensureSourceContentText = async (db: DbInterface, source: KnowledgeSource) => {
  if (source.contentText) return source;
  if (source.sourceType !== 'asset_file') return source;
  const text = await loadAssetFileText(source);
  await db.execute(
    `UPDATE intranet_knowledge_sources SET content_text = ?, status = 'pending', updated_at = ? WHERE id = ?`,
    [text, new Date().toISOString(), source.id]
  );
  return (await getKnowledgeSourceById(db, source.id)) || source;
};

const indexOneSource = async (db: DbInterface, source: KnowledgeSource) => {
  const hydratedSource = await ensureSourceContentText(db, source);
  const chunks = buildKnowledgeChunksForSource(hydratedSource);
  if (!chunks.length) {
    throw new Error('A fonte nao possui texto suficiente para indexacao.');
  }
  const embeddings = await embedMany(chunks.map((item) => item.chunkText));
  await replaceKnowledgeSourceChunks(
    db,
    hydratedSource.id,
    chunks.map((item, index) => ({
      ...item,
      embeddingModel: embeddings.model,
      embedding: embeddings.embeddings[index] || [],
    }))
  );
  return hydratedSource.id;
};

export const reindexKnowledgeSources = async (
  db: DbInterface,
  sourceIds?: string[]
) => {
  await syncPublishedKnowledgeSources(db);
  const targets =
    Array.isArray(sourceIds) && sourceIds.length
      ? (await Promise.all(sourceIds.map((id) => getKnowledgeSourceById(db, id)))).filter(Boolean) as KnowledgeSource[]
      : await listPendingKnowledgeSources(db, 80);

  const results: Array<{ sourceId: string; status: 'indexed' | 'failed'; error?: string }> = [];

  for (const source of targets) {
    try {
      await indexOneSource(db, source);
      results.push({ sourceId: source.id, status: 'indexed' });
    } catch (error: any) {
      const message = error?.message || 'Falha ao indexar fonte.';
      await markKnowledgeSourceFailed(db, source.id, message);
      results.push({ sourceId: source.id, status: 'failed', error: message });
    }
  }

  return results;
};

