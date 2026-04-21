import type { Metadata } from "next";
import { Sidebar } from "@/components/layout/Sidebar";

export const metadata: Metadata = {
  title: "Hub Consultare",
  description: "Painel de Inteligência e Automação",
};

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    /* REMOVIDO: tags html e body para evitar conflito com o layout raiz */
    /* CONTAINER FLEX GLOBAL */
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      
      {/* A Sidebar agora é um item flexível, não fixed. Ela empurra o conteúdo. */}
      <Sidebar />

      {/* CONTEÚDO PRINCIPAL */}
      {/* flex-1: Ocupa todo o espaço restante */}
      {/* overflow-y-auto: Apenas esta área tem barra de rolagem */}
      <main className="flex-1 overflow-y-auto transition-all duration-300 relative w-full">
         <div className="p-6 md:p-8 animate-in fade-in duration-500 max-w-[1600px] mx-auto">
            {children}
         </div>
      </main>
      
    </div>
  );
}