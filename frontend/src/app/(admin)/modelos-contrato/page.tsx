import { FileText } from 'lucide-react';
import ContractTemplatesTab from '../settings/contract-templates-tab';

export const dynamic = 'force-dynamic';

export default function ContractTemplatesPage() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <FileText className="w-6 h-6 text-blue-600" />
          Modelos de Contrato
        </h1>
        <p className="text-slate-500 mt-1">
          Gerencie upload, mapeamento e ativacao dos modelos sem acesso as credenciais de integracao.
        </p>
      </div>

      <ContractTemplatesTab />
    </div>
  );
}
