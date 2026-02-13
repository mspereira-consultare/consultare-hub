"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  PhoneCall,
  DollarSign,
  Users,
  Settings2,
  Settings,
  Menu,
  X,
  LogOut,
  Target,
  UserCheck,
  Briefcase,
  CreditCard,
  MessageCircle,
  ClipboardList,
  CircleHelp,
} from "lucide-react";
import { hasPermission, type PageKey } from "@/lib/permissions";

const cn = (...classes: (string | undefined | null | false)[]) =>
  classes.filter(Boolean).join(" ");
type UserRole = "ADMIN" | "GESTOR" | "OPERADOR";

interface MenuItem {
  href: string;
  label: string;
  icon: React.ElementType;
  group: string;
  roles: UserRole[];
  pageKey: PageKey;
}

const menuItems: MenuItem[] = [
  {
    href: "/dashboard",
    label: "Visao Geral",
    icon: LayoutDashboard,
    group: "PRINCIPAL",
    roles: ["ADMIN", "GESTOR", "OPERADOR"],
    pageKey: "dashboard",
  },
  {
    href: "/monitor",
    label: "Monitor de Atendimento",
    icon: PhoneCall,
    group: "OPERACOES",
    roles: ["ADMIN", "GESTOR", "OPERADOR"],
    pageKey: "monitor",
  },
  {
    href: "/checklist-crc",
    label: "Checklist CRC",
    icon: MessageCircle,
    group: "OPERACOES",
    roles: ["ADMIN", "GESTOR", "OPERADOR"],
    pageKey: "checklist_crc",
  },
  {
    href: "/checklist-recepcao",
    label: "Checklist Recepcao",
    icon: ClipboardList,
    group: "OPERACOES",
    roles: ["ADMIN", "GESTOR", "OPERADOR"],
    pageKey: "checklist_recepcao",
  },
  {
    href: "/produtividade",
    label: "Produtividade de Agendamento",
    icon: UserCheck,
    group: "OPERACOES",
    roles: ["ADMIN", "GESTOR", "OPERADOR"],
    pageKey: "produtividade",
  },
  {
    href: "/financeiro",
    label: "Financeiro",
    icon: DollarSign,
    group: "FINANCEIRO",
    roles: ["ADMIN", "GESTOR"],
    pageKey: "financeiro",
  },
  {
    href: "/contratos",
    label: "ResolveSaude",
    icon: CreditCard,
    group: "FINANCEIRO",
    roles: ["ADMIN", "GESTOR"],
    pageKey: "contratos",
  },
  {
    href: "/propostas",
    label: "Gestao de Propostas",
    icon: Briefcase,
    group: "FINANCEIRO",
    roles: ["ADMIN", "GESTOR"],
    pageKey: "propostas",
  },
  {
    href: "/metas/dashboard",
    label: "Painel de Metas",
    icon: Target,
    group: "INTELIGENCIA",
    roles: ["ADMIN", "GESTOR", "OPERADOR"],
    pageKey: "metas_dashboard",
  },
  {
    href: "/metas",
    label: "Gestao de Metas",
    icon: Settings2,
    group: "INTELIGENCIA",
    roles: ["ADMIN", "GESTOR"],
    pageKey: "metas",
  },
  {
    href: "/users",
    label: "Gestao de Usuarios",
    icon: Users,
    group: "SISTEMA",
    roles: ["ADMIN"],
    pageKey: "users",
  },
  {
    href: "/settings",
    label: "Configuracoes",
    icon: Settings,
    group: "SISTEMA",
    roles: ["ADMIN"],
    pageKey: "settings",
  },
  {
    href: "/ajuda",
    label: "Ajuda",
    icon: CircleHelp,
    group: "SISTEMA",
    roles: ["ADMIN", "GESTOR", "OPERADOR"],
    pageKey: "ajuda",
  },
];

export function Sidebar() {
  const [isOpen, setIsOpen] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const currentUserRole: UserRole =
    ((session?.user as any)?.role as UserRole) ?? "OPERADOR";

  const authorizedItems = menuItems.filter((item) =>
    hasPermission(
      (session?.user as any)?.permissions,
      item.pageKey,
      "view",
      currentUserRole
    )
  );

  const groups = Array.from(new Set(authorizedItems.map((item) => item.group)));

  const handleLogout = async () => {
    try {
      await signOut({ redirect: false });
      router.push("/login");
      router.refresh();
    } catch {
      window.location.href = "/login";
    }
  };

  return (
    <aside
      className={cn(
        "flex flex-col h-screen z-20 transition-all duration-300 shadow-xl flex-shrink-0",
        "bg-[#053F74] text-slate-300",
        isOpen ? "w-72" : "w-20"
      )}
    >
      <div className="h-16 flex items-center justify-between px-4 bg-[#043563] flex-shrink-0 shadow-sm">
        <div
          className={cn(
            "relative transition-all duration-300 overflow-hidden h-12",
            isOpen ? "w-48 opacity-100" : "w-0 opacity-0"
          )}
        >
          <img
            src="https://www.consultare.com.br/wp-content/uploads/2025/09/consultare-logo-horizontal-branco.png"
            alt="Consultare Logo"
            className="object-contain object-left"
          />
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white"
        >
          {isOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* ✅ Ajustes necessários:
          - esconder scrollbar vertical mantendo scroll: scrollbar-hide
          - evitar barra horizontal quando recolhida: overflow-x-hidden
      */}
      <nav className="flex-1 px-3 space-y-6 overflow-y-auto overflow-x-hidden mt-6 scrollbar-hide">
        {groups.map((group) => (
          <div key={group}>
            {isOpen && (
              <h4 className="px-4 text-[10px] font-bold text-slate-400/70 uppercase tracking-wider mb-2">
                {group}
              </h4>
            )}
            <div className="space-y-1">
              {authorizedItems
                .filter((item) => item.group === group)
                .map((item) => {
                  const isExactMatch = pathname === item.href;
                  const isSubRoute = pathname.startsWith(item.href + "/");
                  const isActive =
                    item.href === "/metas" ? isExactMatch : isExactMatch || isSubRoute;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "group relative flex items-center px-3 py-2.5 rounded-lg transition-all duration-200 mb-1",
                        isActive
                          ? "bg-[#17407E] text-white font-medium shadow-md"
                          : "text-slate-300 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      {isActive && (
                        <span className="absolute left-0 h-full w-1 bg-[#3FBD80] rounded-r-full top-0" />
                      )}

                      <item.icon
                        size={20}
                        className={cn(
                          "flex-shrink-0 transition-colors",
                          isActive
                            ? "text-[#3FBD80]"
                            : "text-slate-300 group-hover:text-white"
                        )}
                      />

                      {isOpen && (
                        <span className="ml-3 text-sm flex-1 truncate">
                          {item.label}
                        </span>
                      )}

                      {!isOpen && (
                        <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg border border-slate-700">
                          {item.label}
                        </div>
                      )}
                    </Link>
                  );
                })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-4 bg-[#043563] flex-shrink-0 border-t border-[#17407E]/30">
        <div className={cn("flex items-center gap-3 transition-all", !isOpen && "justify-center")}>
          <div className="relative">
            <div className="w-9 h-9 rounded-full bg-[#229A8A] flex items-center justify-center text-white font-bold text-xs border-2 border-[#053F74]">
              {session?.user?.name ? session.user.name.substring(0, 2).toUpperCase() : "US"}
            </div>
          </div>

          {isOpen && (
            <div className="overflow-hidden flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {session?.user?.name || "Carregando..."}
              </p>
              <p className="text-xs text-slate-400 truncate">{currentUserRole}</p>
            </div>
          )}

          {isOpen && (
            <button
              onClick={handleLogout}
              className="text-slate-400 hover:text-red-400 transition-colors p-2 rounded-md hover:bg-slate-800"
              title="Sair do sistema"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
