import { NextResponse } from 'next/server';
import { requireEquipmentWorkOrderPermission } from '@/lib/equipamentos/auth';
import {
  getAllowedEquipmentWorkOrderProfiles,
  listEquipmentWorkOrderResponsibleOptions,
} from '@/lib/equipamentos/work_orders';
import { listEquipment } from '@/lib/equipamentos/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const errorMessage = (error: unknown, fallback: string) => String((error as { message?: string } | null)?.message || fallback);
const errorStatus = (error: unknown) => Number((error as { status?: number } | null)?.status) || 500;

export async function GET() {
  try {
    const auth = await requireEquipmentWorkOrderPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const [responsibles, equipmentList] = await Promise.all([
      listEquipmentWorkOrderResponsibleOptions(auth.db),
      listEquipment(auth.db, {
        search: '',
        unit: 'all',
        equipmentType: 'all',
        calibrationStatus: 'all',
        operationalStatus: 'all',
        page: 1,
        pageSize: 100,
      }),
    ]);

    return NextResponse.json({
      status: 'success',
      data: {
        responsibleUsers: responsibles,
        allowedProfiles: getAllowedEquipmentWorkOrderProfiles(),
        equipments: equipmentList.items.map((item) => ({
          id: item.id,
          description: item.description,
          identificationNumber: item.identificationNumber,
          unitName: item.unitName,
          operationalStatus: item.operationalStatus,
          activeWorkOrderId: item.activeWorkOrderId,
        })),
      },
      meta: { canManage: auth.canManage },
    });
  } catch (error: unknown) {
    console.error('Erro ao carregar opções de OS de equipamentos:', error);
    return NextResponse.json({ error: errorMessage(error, 'Erro interno ao carregar opções de OS.') }, { status: errorStatus(error) });
  }
}
