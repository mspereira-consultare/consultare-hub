import { NextResponse } from 'next/server';
import { requireColaboradoresPermission } from '@/lib/colaboradores/auth';
import { getEmployeeById } from '@/lib/colaboradores/repository';
import {
  createOrRotatePortalCredential,
  ensureEmployeeUserAccount,
  getLinkedUserByEmployeeId,
} from '@consultare/core/user-accounts';

export const dynamic = 'force-dynamic';

type ParamsContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_: Request, context: ParamsContext) {
  try {
    const auth = await requireColaboradoresPermission('edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const employee = await getEmployeeById(auth.db, String(id || ''));
    if (!employee) {
      return NextResponse.json({ error: 'Colaborador não encontrado.' }, { status: 404 });
    }
    if (employee.status !== 'ATIVO') {
      return NextResponse.json({ error: 'A senha inicial só pode ser gerada para colaboradores ativos.' }, { status: 409 });
    }

    await ensureEmployeeUserAccount(auth.db, employee, {
      actorUserId: auth.userId,
      createInitialCredential: true,
    });
    const user = await getLinkedUserByEmployeeId(auth.db, employee.id);
    if (!user) {
      return NextResponse.json({ error: 'Usuário do colaborador não encontrado.' }, { status: 404 });
    }

    const credential = await createOrRotatePortalCredential(
      auth.db,
      employee.id,
      user.id,
      user.username,
      auth.userId
    );

    return NextResponse.json({
      status: 'success',
      data: {
        employeeId: employee.id,
        userId: user.id,
        username: user.username,
        temporaryPassword: credential.temporaryPassword,
        generatedAt: credential.generatedAt,
      },
    });
  } catch (error: any) {
    console.error('Erro ao regenerar acesso de intranet do colaborador:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao regenerar acesso de intranet.' },
      { status: Number(error?.status) || 500 }
    );
  }
}
