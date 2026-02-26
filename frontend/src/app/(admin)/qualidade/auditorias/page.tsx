'use client';

import React from 'react';

export default function QualidadeAuditoriasPage() {
  return (
    <div className="space-y-6">
      <header className="bg-white border border-slate-200 rounded-xl px-5 py-4 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-800">Conformidade e Auditorias</h1>
        <p className="text-sm text-slate-600 mt-1">
          Esta página será entregue no Sprint 3 com gestão de auditorias internas e planos de ação.
        </p>
      </header>

      <section className="bg-white border border-slate-200 rounded-xl px-5 py-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Escopo planejado</h2>
        <ul className="mt-3 text-sm text-slate-600 list-disc pl-5 space-y-1">
          <li>Cadastro de auditoria vinculada ao POP e versão auditada.</li>
          <li>Registro de não conformidades e plano de ação.</li>
          <li>Controle de prazo, responsável e reavaliação.</li>
          <li>Indicadores de conformidade e pendências.</li>
        </ul>
      </section>
    </div>
  );
}
