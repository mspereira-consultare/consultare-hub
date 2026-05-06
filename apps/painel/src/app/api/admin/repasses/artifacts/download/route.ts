import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { Readable } from 'stream';
import { requireRepassesPermission } from '@/lib/repasses/auth';
import { isRepassesModuleEnabledServer } from '@/lib/repasses/feature';
import {
  listLatestRepassePdfArtifactsByPeriodProfessionals,
  RepasseValidationError,
} from '@/lib/repasses/repository';
import { getStorageProviderByName } from '@/lib/storage';
import type { RepassePdfArtifact, RepassePdfFilenameMode } from '@/lib/repasses/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const clean = (value: unknown) => String(value ?? '').trim();

const slugifyFileName = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/g, '') || 'arquivo';

const normalizeFilenameMode = (value: unknown): RepassePdfFilenameMode =>
  clean(value).toLowerCase() === 'full_name' ? 'full_name' : 'current';

const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const buildPdfFileName = (
  artifact: RepassePdfArtifact,
  mode: RepassePdfFilenameMode,
  usedNames: Map<string, number>
) => {
  const baseName =
    mode === 'full_name'
      ? `${slugifyFileName(artifact.professionalName)}.pdf`
      : clean(artifact.fileName) || `${slugifyFileName(artifact.professionalName)}.pdf`;

  const dotIndex = baseName.toLowerCase().lastIndexOf('.pdf');
  const stem = dotIndex > 0 ? baseName.slice(0, dotIndex) : baseName;
  const ext = dotIndex > 0 ? '.pdf' : '';
  const key = baseName.toLowerCase();
  const currentCount = usedNames.get(key) || 0;
  if (currentCount === 0) {
    usedNames.set(key, 1);
    return baseName;
  }

  let nextCount = currentCount + 1;
  let candidate = `${stem} (${nextCount})${ext}`;
  while (usedNames.has(candidate.toLowerCase())) {
    nextCount += 1;
    candidate = `${stem} (${nextCount})${ext}`;
  }
  usedNames.set(key, nextCount);
  usedNames.set(candidate.toLowerCase(), 1);
  return candidate;
};

export async function POST(request: Request) {
  try {
    if (!isRepassesModuleEnabledServer()) {
      return NextResponse.json({ error: 'Modulo de repasses desabilitado.' }, { status: 404 });
    }

    const auth = await requireRepassesPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const periodRef = clean(body?.periodRef);
    const professionalIds = Array.isArray(body?.professionalIds) ? body.professionalIds : [];
    const filenameMode = normalizeFilenameMode(body?.filenameMode);

    const artifacts = await listLatestRepassePdfArtifactsByPeriodProfessionals(auth.db, {
      periodRef,
      professionalIds,
    });

    const requestedIds = Array.from(
      new Set(professionalIds.map((professionalId: unknown) => clean(professionalId)).filter(Boolean))
    );
    if (!requestedIds.length) {
      throw new RepasseValidationError('Selecione ao menos um profissional para baixar os PDFs.');
    }

    const foundByProfessional = new Map(artifacts.map((artifact) => [artifact.professionalId, artifact] as const));
    const missingRows = await auth.db.query(
      `
      SELECT id, name
      FROM professionals
      WHERE id IN (${requestedIds.map(() => '?').join(', ')})
      ORDER BY name ASC
      `,
      requestedIds
    );
    const missingNames = missingRows
      .filter((row) => !foundByProfessional.has(clean((row as any).id)))
      .map((row) => clean((row as any).name))
      .filter(Boolean);

    if (!artifacts.length) {
      throw new RepasseValidationError(
        'Nenhum PDF disponível para os profissionais selecionados. Gere os relatórios antes de baixar.'
      );
    }

    const usedNames = new Map<string, number>();
    const files = await Promise.all(
      artifacts.map(async (artifact) => {
        const provider = getStorageProviderByName(artifact.storageProvider);
        const stream = await provider.getFileStream({
          bucket: artifact.storageBucket,
          key: artifact.storageKey,
        });
        const buffer = await streamToBuffer(stream);
        return {
          fileName: buildPdfFileName(artifact, filenameMode, usedNames),
          buffer,
        };
      })
    );

    const missingHeader = encodeURIComponent(JSON.stringify(missingNames));
    if (files.length === 1) {
      return new NextResponse(new Uint8Array(files[0].buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(files[0].fileName)}`,
          'Cache-Control': 'no-store',
          'X-Repasses-Missing-Professionals': missingHeader,
        },
      });
    }

    const zip = new JSZip();
    for (const file of files) {
      zip.file(file.fileName, file.buffer);
    }
    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(
          `repasses-${periodRef || 'selecionados'}-selecionados.zip`
        )}`,
        'Cache-Control': 'no-store',
        'X-Repasses-Missing-Professionals': missingHeader,
      },
    });
  } catch (error: any) {
    console.error('Erro no download em lote de PDFs de repasse:', error);
    const status =
      error instanceof RepasseValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao baixar os PDFs selecionados.' },
      { status }
    );
  }
}
