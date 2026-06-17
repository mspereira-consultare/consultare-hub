import { NextResponse } from 'next/server';
import { requirePagePermission } from '@/lib/authz';
import { invalidateCache } from '@/lib/api_cache';
import { ensureAccessProfileTables, listAccessProfiles } from '@/lib/permissions_server';

export const dynamic = 'force-dynamic';

const clean = (value: unknown) => String(value ?? '').trim();
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Erro interno';
const slugify = (value: string) =>
  clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);

export async function GET() {
  try {
    const auth = await requirePagePermission('users', 'view');
    if (!auth.ok) return auth.response;

    const profiles = await listAccessProfiles(auth.db);
    return NextResponse.json({
      status: 'success',
      data: profiles,
    });
  } catch (error: unknown) {
    console.error('Erro GET access profiles:', error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePagePermission('users', 'edit');
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const sourceProfileKey = clean(body?.sourceProfileKey);
    const label = clean(body?.label);
    const description = clean(body?.description);

    if (!sourceProfileKey || !label) {
      return NextResponse.json({ error: 'Perfil de origem e nome sao obrigatorios.' }, { status: 400 });
    }

    await ensureAccessProfileTables(auth.db);
    const profiles = await listAccessProfiles(auth.db);
    const source = profiles.find((profile) => profile.profileKey === sourceProfileKey);
    if (!source) {
      return NextResponse.json({ error: 'Perfil de origem nao encontrado.' }, { status: 404 });
    }

    const baseKey = slugify(label);
    const existingKeys = new Set(profiles.map((profile) => profile.profileKey));
    let profileKey = baseKey || `perfil_${Date.now()}`;
    let suffix = 2;
    while (existingKeys.has(profileKey)) {
      profileKey = `${baseKey}_${suffix}`;
      suffix += 1;
    }

    await auth.db.execute(
      `
      INSERT INTO access_profiles
        (profile_key, label, description, is_system, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, 0, 1, 100, datetime('now'), datetime('now'))
      `,
      [profileKey, label, description || source.description || null]
    );

    for (const [pageKey, permission] of Object.entries(source.permissions)) {
      await auth.db.execute(
        `
        INSERT INTO access_profile_permissions
          (profile_key, page_key, can_view, can_edit, can_refresh, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        `,
        [
          profileKey,
          pageKey,
          permission.view ? 1 : 0,
          permission.edit ? 1 : 0,
          permission.refresh ? 1 : 0,
        ]
      );
    }

    invalidateCache('admin:');
    return NextResponse.json({ status: 'success', profileKey });
  } catch (error: unknown) {
    console.error('Erro POST access profiles:', error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
