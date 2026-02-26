'use client';

import React from 'react';

export default function QualidadeTreinamentosPage() {
  return (
    <div className="space-y-6">
      <header className="bg-white border border-slate-200 rounded-xl px-5 py-4 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-800">Treinamentos</h1>
        <p className="text-sm text-slate-600 mt-1">
          Esta página será entregue no Sprint 2 com as abas de Cronograma Anual e Realizações.
        </p>
      </header>

      <section className="bg-white border border-slate-200 rounded-xl px-5 py-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Escopo planejado</h2>
        <ul className="mt-3 text-sm text-slate-600 list-disc pl-5 space-y-1">
          <li>Cadastro e gestão de cronograma anual de treinamentos.</li>
          <li>Registro de treinamentos realizados (execução).</li>
          <li>Vínculo com POPs e anexos (lista de presença, avaliação e evidências).</li>
          <li>Indicadores de execução por período e status.</li>
        </ul>
      </section>
    </div>
  );
}
