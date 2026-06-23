"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowLeft, MailCheck } from "lucide-react";
import { hasPermission } from "@/lib/permissions";
import { isRepassesModuleEnabledClient } from "@/lib/repasses/feature";
import { RepasseEmailPanel } from "../components/RepasseEmailPanel";

type SessionUserWithPermissions = {
  role?: string | null;
  permissions?: unknown;
};

const previousMonthRef = () => {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const y = prev.getFullYear();
  const m = String(prev.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

export default function RepasseEmailPage() {
  const moduleEnabled = isRepassesModuleEnabledClient();
  const { data: session } = useSession();
  const user = session?.user as SessionUserWithPermissions | undefined;
  const role = String(user?.role || "OPERADOR");
  const canView = hasPermission(user?.permissions, "repasses", "view", role);
  const canRefresh = hasPermission(user?.permissions, "repasses", "refresh", role);
  const canEdit = hasPermission(user?.permissions, "repasses", "edit", role);
  const [periodRef, setPeriodRef] = useState(previousMonthRef());

  if (!moduleEnabled) {
    return (
      <main className="p-6">
        <div className="rounded-lg border bg-white p-4 text-sm text-slate-600">
          Módulo de repasses desabilitado.
        </div>
      </main>
    );
  }

  if (!canView) {
    return (
      <main className="p-6">
        <div className="rounded-lg border bg-white p-4 text-sm text-slate-600">
          Você não tem permissão para visualizar envios de fechamento.
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col gap-6 bg-slate-50 p-4 md:p-6">
      <header className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-5 md:flex-row md:items-center md:justify-between">
          <div>
          <Link
            href="/repasses"
            className="mb-2 inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft size={14} />
            Repasses
          </Link>
          <div className="flex items-center gap-2">
            <MailCheck size={18} className="text-[#17407E]" />
            <h1 className="text-xl font-bold text-slate-800">Envios de fechamento</h1>
          </div>
          <p className="mt-1 max-w-2xl text-xs text-slate-500">
            Escolha a competência do fechamento, importe a planilha, vincule os anexos quando houver e selecione quem deve receber o e-mail.
          </p>
        </div>
        <label className="flex w-full flex-col gap-1 text-xs font-bold uppercase tracking-wider text-slate-500 md:w-48">
          Competência
          <input
            type="month"
            value={periodRef}
            onChange={(event) => setPeriodRef(event.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          />
        </label>
        </div>
      </header>

      <RepasseEmailPanel
        periodRef={periodRef}
        canView={canView}
        canRefresh={canRefresh}
        canEdit={canEdit}
      />
    </main>
  );
}
