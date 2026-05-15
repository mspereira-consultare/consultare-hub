import { NextResponse } from 'next/server';
import { getStorageProviderByName } from '@consultare/core/storage';
import { canUserAccessKnowledgeSource, getKnowledgeSourceDownloadAsset } from '@consultare/core/intranet/chatbot';
import { requireIntranetChatbotSession } from '@/lib/intranet/chatbot-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = {
  sourceId: string;
};

export async function GET(_: Request, { params }: { params: Promise<Params> }) {
  try {
    const auth = await requireIntranetChatbotSession();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { sourceId } = await params;
    const data = await getKnowledgeSourceDownloadAsset(auth.db, sourceId);
    if (!data) {
      return NextResponse.json({ error: 'Fonte nao encontrada ou sem arquivo associado.' }, { status: 404 });
    }
    if (!(await canUserAccessKnowledgeSource(auth.db, sourceId, auth.user))) {
      return NextResponse.json({ error: 'Sem acesso a esta fonte.' }, { status: 403 });
    }
    const provider = getStorageProviderByName(data.storageProvider);
    const stream = await provider.getFileStream({
      bucket: data.storageBucket,
      key: data.storageKey,
    });
    return new NextResponse(stream as any, {
      headers: {
        'Content-Type': data.mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(data.source.title)}"`,
      },
    });
  } catch (error: any) {
    console.error('Erro ao baixar fonte do chatbot:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao baixar fonte.' }, { status: Number(error?.status) || 500 });
  }
}
