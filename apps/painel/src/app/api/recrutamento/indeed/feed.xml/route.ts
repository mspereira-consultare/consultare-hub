import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { buildRecruitmentIndeedFeedXml } from '@/lib/recrutamento/indeed';
import { getRecruitmentIndeedFeedSnapshot } from '@/lib/recrutamento/repository';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const token = String(url.searchParams.get('token') || '').trim();
    if (!token) {
      return NextResponse.json({ error: 'Token da feed não informado.' }, { status: 401 });
    }

    const db = getDbConnection();
    const snapshot = await getRecruitmentIndeedFeedSnapshot(db, token);
    if (!snapshot) {
      return NextResponse.json({ error: 'Feed da Indeed não encontrada.' }, { status: 404 });
    }

    const xml = await buildRecruitmentIndeedFeedXml(db);
    return new NextResponse(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Erro ao gerar feed XML da Indeed:', error);
    return NextResponse.json({ error: 'Erro interno ao gerar feed XML da Indeed.' }, { status: 500 });
  }
}
