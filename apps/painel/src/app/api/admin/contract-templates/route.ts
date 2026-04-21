import { NextResponse } from 'next/server';
import {
  CONTRACT_TEMPLATE_ALLOWED_EXTENSIONS,
  CONTRACT_TEMPLATE_ALLOWED_MIME_TYPES,
  CONTRACT_TEMPLATE_MAX_FILE_BYTES,
} from '@/lib/contract_templates/constants';
import { requireContractTemplatesPermission } from '@/lib/contract_templates/auth';
import {
  ContractTemplateValidationError,
  createContractTemplate,
  getTemplatePlaceholderSourceOptions,
  listContractTemplates,
} from '@/lib/contract_templates/repository';
import { extractDocxPlaceholders } from '@/lib/contract_templates/placeholders';
import type { ContractTypeCode } from '@/lib/profissionais/constants';
import { getStorageProvider } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const sanitizePart = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

const buildStorageKey = (contractType: string, originalName: string) => {
  const prefix = String(process.env.CONTRACT_TEMPLATES_S3_PREFIX || 'contratos/modelos/')
    .replace(/^\/+|\/+$/g, '');
  const fileName = sanitizePart(originalName) || 'template.docx';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}/${contractType}/${stamp}-${fileName}`;
};

const hasAllowedExtension = (fileName: string) => {
  const lower = String(fileName || '').toLowerCase();
  return CONTRACT_TEMPLATE_ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
};

export async function GET(request: Request) {
  try {
    const auth = await requireContractTemplatesPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const mode = String(searchParams.get('mode') || 'all').toLowerCase();
    const contractType = String(searchParams.get('contractType') || '').toUpperCase() as ContractTypeCode;
    const status =
      mode === 'active' ? 'active' : mode === 'draft' ? 'draft' : mode === 'archived' ? 'archived' : 'all';

    const data = await listContractTemplates(auth.db, {
      status,
      contractType: contractType || '',
    });

    return NextResponse.json({
      status: 'success',
      data,
      placeholderSourceOptions: getTemplatePlaceholderSourceOptions(),
    });
  } catch (error: unknown) {
    console.error('Erro ao listar modelos de contrato:', error);
    const message = error instanceof Error ? error.message : 'Erro interno.';
    const status = Number((error as { status?: number })?.status) || 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireContractTemplatesPermission('edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const formData = await request.formData();
    const name = String(formData.get('name') || '').trim();
    const contractType = String(formData.get('contractType') || '').trim().toUpperCase() as ContractTypeCode;
    const notes = String(formData.get('notes') || '').trim() || null;
    const filePart = formData.get('file');
    if (!(filePart instanceof File)) {
      return NextResponse.json({ error: 'Arquivo .docx nao enviado.' }, { status: 400 });
    }

    const mimeType = String(filePart.type || 'application/octet-stream');
    const originalName = String(filePart.name || 'modelo.docx');
    const sizeBytes = Number(filePart.size || 0);
    if (sizeBytes <= 0 || sizeBytes > CONTRACT_TEMPLATE_MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `Arquivo invalido. Limite: ${Math.floor(CONTRACT_TEMPLATE_MAX_FILE_BYTES / (1024 * 1024))}MB.` },
        { status: 400 }
      );
    }
    if (!hasAllowedExtension(originalName)) {
      return NextResponse.json({ error: 'Extensao invalida. Envie arquivo .docx.' }, { status: 400 });
    }
    if (!CONTRACT_TEMPLATE_ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json({ error: 'Tipo MIME invalido para modelo .docx.' }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await filePart.arrayBuffer());
    const placeholders = await extractDocxPlaceholders(fileBuffer);
    const key = buildStorageKey(contractType, originalName);
    const provider = getStorageProvider();

    let uploaded: { bucket: string | null; key: string } | null = null;
    try {
      const upload = await provider.uploadFile({
        key,
        body: fileBuffer,
        contentType: mimeType,
        metadata: {
          domain: 'contract_template',
          contractType,
        },
      });
      uploaded = { bucket: upload.bucket, key: upload.key };

      const created = await createContractTemplate(
        auth.db,
        {
          name,
          contractType,
          originalName,
          mimeType,
          sizeBytes,
          storageProvider: upload.provider,
          storageBucket: upload.bucket,
          storageKey: upload.key,
          placeholders,
          notes,
        },
        auth.userId
      );

      return NextResponse.json({ status: 'success', data: created });
    } catch (error) {
      if (uploaded?.key) {
        try {
          await provider.deleteFile({ bucket: uploaded.bucket, key: uploaded.key });
        } catch (cleanupErr) {
          console.error('Falha ao limpar modelo no storage apos erro de persistencia:', cleanupErr);
        }
      }
      throw error;
    }
  } catch (error: any) {
    console.error('Erro no upload de modelo de contrato:', error);
    const status =
      error instanceof ContractTemplateValidationError
        ? error.status
        : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao enviar modelo.' },
      { status }
    );
  }
}

