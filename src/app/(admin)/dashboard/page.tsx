    // src/app/(admin)/dashboard/page.tsx
export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-blue-900 mb-4">Visão Geral</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Cards de Exemplo */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h3 className="text-gray-500 text-sm font-medium">Faturamento do Mês</h3>
          <p className="text-2xl font-bold text-gray-900 mt-2">R$ 0,00</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h3 className="text-gray-500 text-sm font-medium">Pacientes Ativos</h3>
          <p className="text-2xl font-bold text-gray-900 mt-2">0</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h3 className="text-gray-500 text-sm font-medium">Agendamentos Hoje</h3>
          <p className="text-2xl font-bold text-gray-900 mt-2">0</p>
        </div>
      </div>
    </div>
  );
}