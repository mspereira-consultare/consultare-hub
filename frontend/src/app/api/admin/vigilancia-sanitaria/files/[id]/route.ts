import { NextResponse } from 'next/server';
import { requireVigilanciaSanitariaPermission } from '@/lib/vigilancia_sanitaria/auth';
import { deleteSurveillanceFileRecord, getSurveillanceFileById } from '@/lib/vigilancia_sanitaria/repository';
import { getStorageProviderByName } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = { params: Promise<{ id: string }> };

export async function DELETE(_: Request, context: ParamsContext) {
  try {
    const auth = await requireVigilanciaSanitariaPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const file = await getSurveillanceFileById(auth.db, String(id || ''));
    if (!file) return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 });
    const provider = getStorageProviderByName(file.storageProvider);
    await provider.deleteFile({ bucket: file.storageBucket, key: file.storageKey });
    await deleteSurveillanceFileRecord(auth.db, file.id);
    return NextResponse.json({ status: 'success' });
  } catch (error: any) {
    console.error('Erro ao excluir arquivo de Vigilância Sanitária:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao excluir arquivo.' }, { status: Number(error?.status) || 500 });
  }
}
