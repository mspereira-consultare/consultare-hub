import { NextResponse } from 'next/server';
import { requireContractTemplatesPermission } from '@/lib/contract_templates/auth';
import {
  ContractTemplateValidationError,
  deleteContractTemplate,
} from '@/lib/contract_templates/repository';
import { getStorageProviderByName } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_: Request, context: ParamsContext) {
  try {
    const auth = await requireContractTemplatesPermission('edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const templateId = String(id || '').trim();
    if (!templateId) {
      return NextResponse.json({ error: 'ID do modelo invalido.' }, { status: 400 });
    }

    const deleted = await deleteContractTemplate(auth.db, templateId, auth.userId);

    try {
      const provider = getStorageProviderByName(deleted.storageProvider);
      await provider.deleteFile({
        bucket: deleted.storageBucket,
        key: deleted.storageKey,
      });
    } catch (storageError) {
      console.error('Falha ao remover arquivo do storage apos exclusao do modelo:', storageError);
    }

    return NextResponse.json({
      status: 'success',
      data: {
        id: deleted.id,
        name: deleted.name,
      },
    });
  } catch (error: unknown) {
    console.error('Erro ao excluir modelo de contrato:', error);
    const status =
      error instanceof ContractTemplateValidationError
        ? error.status
        : Number((error as { status?: number })?.status) || 500;
    const message = error instanceof Error ? error.message : 'Erro interno ao excluir modelo.';
    return NextResponse.json({ error: message }, { status });
  }
}
