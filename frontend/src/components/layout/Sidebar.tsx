"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  Calendar,
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
  ChevronDown,
  ChevronRight,
  Search,
  Stethoscope,
  FileText,
  BarChart3,
  Wrench,
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
  subgroup?: string;
  roles: UserRole[];
  pageKey: PageKey;
}

const menuItems: MenuItem[] = [
  {
    href: "/dashboard",
    label: "Visão Geral",
    icon: LayoutDashboard,
    group: "PRINCIPAL",
    roles: ["ADMIN", "GESTOR", "OPERADOR"],
    pageKey: "dashboard",
  },
  {
    href: "/monitor",
    label: "Monitor de Atendimento",
    icon: PhoneCall,
    group: "OPERAÇÕES",
    roles: ["ADMIN", "GESTOR", "OPERADOR"],
    pageKey: "monitor",
  },
  {
    href: "/checklist-crc",
    label: "Checklist CRC",
    icon: MessageCircle,
    group: "OPERAÇÕES",
    roles: ["ADMIN", "GESTOR", "OPERADOR"],
    pageKey: "checklist_crc",
  },
  {
    href: "/checklist-recepcao",
    label: "Checklist Recepção",
    icon: ClipboardList,
    group: "OPERAÇÕES",
    roles: ["ADMIN", "GESTOR", "OPERADOR"],
    pageKey: "checklist_recepcao",
  },
  {
    href: "/produtividade",
    label: "Produtividade de Agendamento",
    icon: UserCheck,
    group: "OPERAÇÕES",
    roles: ["ADMIN", "GESTOR", "OPERADOR"],
    pageKey: "produtividade",
  },
  {
    href: "/agendamentos",
    label: "Dashboard de Agendamentos",
    icon: Calendar,
    group: "OPERAÇÕES",
    roles: ["ADMIN", "GESTOR", "OPERADOR"],
    pageKey: "agendamentos",
  },
  {
    href: "/profissionais",
    label: "Gestão de Profissionais",
    icon: Stethoscope,
    group: "OPERAÇÕES",
    roles: ["ADMIN", "GESTOR", "OPERADOR"],
    pageKey: "profissionais",
  },
  {
    href: "/colaboradores",
    label: "Colaboradores",
    icon: Users,
    group: "GESTÃO DE PESSOAS",
    roles: ["ADMIN", "GESTOR", "OPERADOR"],
    pageKey: "colaboradores",
  },
  {
    href: "/equipamentos",
    label: "Equipamentos",
    icon: Wrench,
    group: "QUALIDADE",
    roles: ["ADMIN", "GESTOR", "OPERADOR"],
    pageKey: "equipamentos",
  },
  {
    href: "/qualidade/documentos",
    label: "Documentos",
    icon: FileText,
    group: "QUALIDADE",
    roles: ["ADMIN", "GESTOR", "OPERADOR"],
    pageKey: "qualidade_documentos",
  },
  {
    href: "/qualidade/treinamentos",
    label: "Treinamentos",
    icon: Calendar,
    group: "QUALIDADE",
    roles: ["ADMIN", "GESTOR", "OPERADOR"],
    pageKey: "qualidade_treinamentos",
  },
  {
    href: "/qualidade/auditorias",
    label: "Auditorias",
    icon: ClipboardList,
    group: "QUALIDADE",
    roles: ["ADMIN", "GESTOR", "OPERADOR"],
    pageKey: "qualidade_auditorias",
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
    label: "Resolve Saúde",
    icon: CreditCard,
    group: "FINANCEIRO",
    roles: ["ADMIN", "GESTOR"],
    pageKey: "contratos",
  },
  {
    href: "/propostas",
    label: "Base de trabalho",
    icon: Briefcase,
    group: "FINANCEIRO",
    subgroup: "Propostas",
    roles: ["ADMIN", "GESTOR", "OPERADOR"],
    pageKey: "propostas",
  },
  {
    href: "/propostas/gerencial",
    label: "Visão gerencial",
    icon: BarChart3,
    group: "FINANCEIRO",
    subgroup: "Propostas",
    roles: ["ADMIN", "GESTOR"],
    pageKey: "propostas_gerencial",
  },
  {
    href: "/repasses",
    label: "Fechamento de Repasses",
    icon: FileText,
    group: "FINANCEIRO",
    roles: ["ADMIN", "GESTOR", "OPERADOR"],
    pageKey: "repasses",
  },
  {
    href: "/metas/dashboard",
    label: "Painel de Metas",
    icon: Target,
    group: "INTELIGÊNCIA",
    roles: ["ADMIN", "GESTOR", "OPERADOR"],
    pageKey: "metas_dashboard",
  },
  {
    href: "/metas",
    label: "Gestão de Metas",
    icon: Settings2,
    group: "INTELIGÊNCIA",
    roles: ["ADMIN", "GESTOR"],
    pageKey: "metas",
  },
  {
    href: "/agenda-ocupacao",
    label: "Ocupação da Agenda",
    icon: Calendar,
    group: "INTELIGÊNCIA",
    roles: ["ADMIN", "GESTOR", "OPERADOR"],
    pageKey: "agenda_ocupacao",
  },
  {
    href: "/marketing/controle",
    label: "Marketing - Controle",
    icon: ClipboardList,
    group: "MARKETING",
    roles: ["ADMIN", "GESTOR"],
    pageKey: "marketing_controle",
  },
  {
    href: "/marketing/funil",
    label: "Marketing - Funil",
    icon: BarChart3,
    group: "MARKETING",
    roles: ["ADMIN", "GESTOR", "OPERADOR"],
    pageKey: "marketing_funil",
  },
  {
    href: "/users",
    label: "Gestão de Usuários",
    icon: Users,
    group: "SISTEMA",
    roles: ["ADMIN"],
    pageKey: "users",
  },
  {
    href: "/modelos-contrato",
    label: "Modelos de Contrato",
    icon: FileText,
    group: "SISTEMA",
    roles: ["ADMIN", "GESTOR", "OPERADOR"],
    pageKey: "contract_templates",
  },
  {
    href: "/settings",
    label: "Configurações",
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

const FIRST_GROUP = "PRINCIPAL";
const LAST_GROUP = "SISTEMA";
const STORAGE_KEY = "consultare_sidebar_expanded_groups_v1";

const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: "Administrador",
  GESTOR: "Gestor",
  OPERADOR: "Operador",
};

type GroupSection =
  | {
      type: "item";
      item: MenuItem;
    }
  | {
      type: "subgroup";
      label: string;
      icon: React.ElementType;
      items: MenuItem[];
    };

const getSubgroupKey = (group: string, subgroup: string) => `${group}::${subgroup}`;

const buildGroupSections = (items: MenuItem[]): GroupSection[] => {
  const sections: GroupSection[] = [];
  const subgroupMap = new Map<string, { icon: React.ElementType; items: MenuItem[] }>();

  for (const item of items) {
    if (!item.subgroup) {
      sections.push({ type: "item", item });
      continue;
    }

    if (!subgroupMap.has(item.subgroup)) {
      const entry = { icon: item.icon, items: [item] };
      subgroupMap.set(item.subgroup, entry);
      sections.push({ type: "subgroup", label: item.subgroup, icon: item.icon, items: entry.items });
      continue;
    }

    subgroupMap.get(item.subgroup)!.items.push(item);
  }

  return sections;
};

const getCollapsedItemLabel = (item: MenuItem) =>
  item.subgroup ? `${item.subgroup} / ${item.label}` : item.label;

export function Sidebar() {
  const [isOpen, setIsOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const sessionUser = (session?.user as { role?: UserRole; permissions?: unknown } | undefined);

  const currentUserRole: UserRole =
    sessionUser?.role ?? "OPERADOR";

  const authorizedItems = useMemo(() => {
    return menuItems.filter((item) =>
      hasPermission(
        sessionUser?.permissions,
        item.pageKey,
        "view",
        currentUserRole
      )
    );
  }, [sessionUser, currentUserRole]);

  const groupsOrdered = useMemo(() => {
    const set = new Set(authorizedItems.map((item) => item.group));
    return Array.from(set).sort((a, b) => {
      if (a === FIRST_GROUP) return -1;
      if (b === FIRST_GROUP) return 1;
      if (a === LAST_GROUP) return 1;
      if (b === LAST_GROUP) return -1;
      return a.localeCompare(b, "pt-BR", { sensitivity: "base" });
    });
  }, [authorizedItems]);

  const isItemActive = (item: MenuItem) => {
    const isExactMatch = pathname === item.href;
    const isSubRoute = pathname.startsWith(item.href + "/");
    return item.href === "/metas" ? isExactMatch : isExactMatch || isSubRoute;
  };

  const activeItem = useMemo(() => {
    return authorizedItems.find((item) => isItemActive(item));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorizedItems, pathname]);

  const activeGroup = activeItem?.group;
  const activeSubgroupKey = activeItem?.subgroup
    ? getSubgroupKey(activeItem.group, activeItem.subgroup)
    : null;

  const ensureExpandedKeysForItem = (item: MenuItem) => {
    setExpandedGroups((prev) => {
      const next = { ...prev, [item.group]: true };
      if (item.subgroup) {
        next[getSubgroupKey(item.group, item.subgroup)] = true;
      }
      return next;
    });
  };

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") setExpandedGroups(parsed);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(expandedGroups));
    } catch {
      // ignore
    }
  }, [expandedGroups]);

  useEffect(() => {
    if (!activeGroup) return;
    setExpandedGroups((prev) => {
      const next = prev[activeGroup]
        ? { ...prev }
        : { ...prev, [activeGroup]: true };

      if (activeSubgroupKey) {
        next[activeSubgroupKey] = true;
      }

      return next;
    });
  }, [activeGroup, activeSubgroupKey]);

  useEffect(() => {
    if (!isOpen) setSearchTerm("");
  }, [isOpen]);

  const searchResultsByGroup = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return null;

    const matches = authorizedItems.filter((item) => {
      const hay = `${item.label} ${item.subgroup ?? ""} ${item.href} ${item.group}`.toLowerCase();
      return hay.includes(q);
    });

    const map = new Map<string, MenuItem[]>();
    for (const item of matches) {
      const arr = map.get(item.group) ?? [];
      arr.push(item);
      map.set(item.group, arr);
    }

    return { matches, map };
  }, [searchTerm, authorizedItems]);

  const toggleGroup = (group: string) => {
    if (group === activeGroup) return;
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  const toggleSubgroup = (group: string, subgroup: string) => {
    const subgroupKey = getSubgroupKey(group, subgroup);
    if (subgroupKey === activeSubgroupKey) return;
    setExpandedGroups((prev) => ({ ...prev, [subgroupKey]: !prev[subgroupKey] }));
  };

  const expandAllGroups = () => {
    const next: Record<string, boolean> = {};
    groupsOrdered.forEach((group) => {
      next[group] = true;
    });
    authorizedItems.forEach((item) => {
      if (item.subgroup) {
        next[getSubgroupKey(item.group, item.subgroup)] = true;
      }
    });
    setExpandedGroups(next);
  };

  const collapseAllGroups = () => {
    const next: Record<string, boolean> = {};
    if (activeGroup) next[activeGroup] = true;
    if (activeSubgroupKey) next[activeSubgroupKey] = true;
    setExpandedGroups(next);
  };

  const clearSearch = () => setSearchTerm("");

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
            alt="Logo Consultare"
            className="object-contain object-left"
          />
        </div>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white"
          aria-label={isOpen ? "Fechar sidebar" : "Abrir sidebar"}
          title={isOpen ? "Fechar" : "Abrir"}
        >
          {isOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <nav className="flex-1 px-3 overflow-y-auto overflow-x-hidden mt-2 scrollbar-hide">
        {isOpen && (
          <div className="px-1 space-y-2">
            <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
              <Search size={16} className="text-slate-300/70 flex-shrink-0" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") clearSearch();
                }}
                placeholder="Buscar páginas..."
                className="w-full bg-transparent outline-none text-sm text-white placeholder:text-slate-400/70"
              />
              {searchTerm.trim() && (
                <button
                  onClick={clearSearch}
                  className="p-1 rounded-md hover:bg-white/10 text-slate-300/80 hover:text-white transition-colors"
                  aria-label="Limpar busca"
                  type="button"
                  title="Limpar"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 px-1">
              <button
                type="button"
                onClick={expandAllGroups}
                className="flex-1 rounded-md border border-white/10 px-2 py-0.5 text-[10px] font-medium text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
              >
                Expandir tudo
              </button>
              <button
                type="button"
                onClick={collapseAllGroups}
                className="flex-1 rounded-md border border-white/10 px-2 py-0.5 text-[10px] font-medium text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
              >
                Recolher tudo
              </button>
            </div>
          </div>
        )}

        {/* ↓ mais condensado: diminui o gap entre cards */}
        <div className={cn("space-y-1", isOpen ? "mt-2" : "")}>
          {/* Modo de busca: também em card por grupo */}
          {isOpen && searchResultsByGroup ? (
            searchResultsByGroup.matches.length === 0 ? (
              <div className="px-4 py-3 text-xs text-slate-300/80 bg-white/5 border border-white/10 rounded-lg">
                Nenhuma página encontrada.
              </div>
            ) : (
              groupsOrdered
                .filter((g) => searchResultsByGroup.map.has(g))
                .map((group) => {
                  const items = searchResultsByGroup.map.get(group) ?? [];

                  return (
                    <div
                      key={group}
                      className="overflow-hidden border-t border-white/10 first:border-t-0"
                    >
                      {/* ↓ header mais compacto */}
                      <div className="px-3 py-2">
                        <span className="text-xs font-bold text-slate-200/90 uppercase tracking-wider">
                          {group}
                        </span>
                      </div>

                      {/* ↓ body mais compacto */}
                      <div className="border-t border-white/10 px-2 py-1">
                        <div className="space-y-1">
                          {items.map((item) => {
                            const isActive = isItemActive(item);

                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => {
                                  ensureExpandedKeysForItem(item);
                                  clearSearch();
                                }}
                                className={cn(
                                  "group relative flex items-center rounded-lg transition-all duration-200",
                                  // ↓ itens mais condensados
                                  "pl-3 pr-2.5 py-1.5",
                                  isActive
                                    ? "bg-[#17407E] text-white font-medium shadow-md"
                                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                                )}
                              >
                                {isActive && (
                                  <span className="absolute left-0 h-full w-1 bg-[#3FBD80] rounded-r-full top-0" />
                                )}

                                <item.icon
                                  size={18}
                                  className={cn(
                                    "flex-shrink-0 transition-colors",
                                    isActive
                                      ? "text-[#3FBD80]"
                                      : "text-slate-300 group-hover:text-white"
                                  )}
                                />

                                <span className="ml-3 text-[13px] flex-1 truncate">
                                  {getCollapsedItemLabel(item)}
                                </span>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })
            )
          ) : (
            /* Modo padrão: Accordion por grupo em card único (Opção 1) + animação */
            groupsOrdered.map((group) => {
              const items = authorizedItems.filter((item) => item.group === group);
              if (items.length === 0) return null;
              const sections = buildGroupSections(items);

              const isExpanded = !isOpen
                ? true
                : group === activeGroup
                ? true
                : !!expandedGroups[group];

              // Sidebar recolhida: mais condensado também
              if (!isOpen) {
                return (
                  <div key={group} className="space-y-1">
                    {items.map((item) => {
                      const isActive = isItemActive(item);

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => {
                            ensureExpandedKeysForItem(item);
                            clearSearch();
                          }}
                          className={cn(
                            "group relative flex items-center px-3 py-2 rounded-lg transition-all duration-200 mb-1",
                            isActive
                              ? "bg-[#17407E] text-white font-medium shadow-md"
                              : "text-slate-300 hover:bg-white/5 hover:text-white"
                          )}
                        >
                          {isActive && (
                            <span className="absolute left-0 h-full w-1 bg-[#3FBD80] rounded-r-full top-0" />
                          )}

                          <item.icon
                            size={18}
                            className={cn(
                              "flex-shrink-0 transition-colors",
                              isActive
                                ? "text-[#3FBD80]"
                                : "text-slate-300 group-hover:text-white"
                            )}
                          />

                          <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg border border-slate-700">
                            {getCollapsedItemLabel(item)}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                );
              }

              return (
                <div
                  key={group}
                  className="overflow-hidden border-t border-white/10 first:border-t-0"
                >
                  {/* ↓ header mais compacto */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(group)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 transition-colors select-none",
                      "bg-white/0 hover:bg-white/5",
                      group === activeGroup ? "text-white" : "text-slate-300"
                    )}
                    title={
                      group === activeGroup
                        ? "Grupo atual"
                        : isExpanded
                        ? "Recolher grupo"
                        : "Expandir grupo"
                    }
                    aria-label={isExpanded ? `Recolher ${group}` : `Expandir ${group}`}
                  >
                    <span className="text-xs font-bold uppercase tracking-wider">{group}</span>

                    {isExpanded ? (
                      <ChevronDown size={16} className="text-slate-200/80" />
                    ) : (
                      <ChevronRight size={16} className="text-slate-200/80" />
                    )}
                  </button>

                  <div
                    className={cn(
                      "overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out",
                      isExpanded ? "max-h-[900px] opacity-100" : "max-h-0 opacity-0"
                    )}
                    aria-hidden={!isExpanded}
                  >
                    {/* ↓ body mais compacto */}
                    <div className="border-t border-white/10 px-2 py-1">
                      <div
                        className={cn(
                          "space-y-1 transition-transform duration-300 ease-in-out",
                          isExpanded ? "translate-y-0" : "-translate-y-1"
                        )}
                      >
                        {sections.map((section) => {
                          if (section.type === "item") {
                            const item = section.item;
                            const isActive = isItemActive(item);

                            return (
                              <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => {
                                  ensureExpandedKeysForItem(item);
                                  clearSearch();
                                }}
                                className={cn(
                                  "group relative flex items-center rounded-lg transition-all duration-200",
                                  "pl-3 pr-2.5 py-1.5",
                                  isActive
                                    ? "bg-[#17407E] text-white font-medium shadow-md"
                                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                                )}
                              >
                                {isActive && (
                                  <span className="absolute left-0 top-0 h-full w-1 rounded-r-full bg-[#3FBD80]" />
                                )}

                                <item.icon
                                  size={18}
                                  className={cn(
                                    "flex-shrink-0 transition-colors",
                                    isActive
                                      ? "text-[#3FBD80]"
                                      : "text-slate-300 group-hover:text-white"
                                  )}
                                />

                                <span className="ml-3 flex-1 truncate text-[13px]">
                                  {item.label}
                                </span>
                              </Link>
                            );
                          }

                          const subgroupKey = getSubgroupKey(group, section.label);
                          const isSubgroupActive = activeSubgroupKey === subgroupKey;
                          const isSubgroupExpanded = isSubgroupActive ? true : !!expandedGroups[subgroupKey];

                          return (
                            <div key={subgroupKey} className="pt-1">
                              <button
                                type="button"
                                onClick={() => toggleSubgroup(group, section.label)}
                                className={cn(
                                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors",
                                  isSubgroupActive ? "text-slate-100" : "text-slate-300/85 hover:text-white"
                                )}
                                title={isSubgroupExpanded ? `Recolher ${section.label}` : `Expandir ${section.label}`}
                                aria-label={isSubgroupExpanded ? `Recolher ${section.label}` : `Expandir ${section.label}`}
                              >
                                <div className="flex items-center gap-2">
                                  <section.icon
                                    size={14}
                                    className={cn(
                                      "flex-shrink-0",
                                      isSubgroupActive ? "text-slate-200" : "text-slate-400/90"
                                    )}
                                  />
                                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300/90">
                                    {section.label}
                                  </span>
                                </div>
                                {isSubgroupExpanded ? (
                                  <ChevronDown size={13} className="text-slate-300/70" />
                                ) : (
                                  <ChevronRight size={13} className="text-slate-300/70" />
                                )}
                              </button>

                              <div
                                className={cn(
                                  "overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out",
                                  isSubgroupExpanded ? "max-h-40 opacity-100" : "max-h-0 opacity-0"
                                )}
                                aria-hidden={!isSubgroupExpanded}
                              >
                                <div className="ml-5 space-y-1 border-l border-white/10 pl-2">
                                  {section.items.map((item) => {
                                    const isActive = isItemActive(item);

                                    return (
                                      <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={() => {
                                          ensureExpandedKeysForItem(item);
                                          clearSearch();
                                        }}
                                        className={cn(
                                          "group flex items-center rounded-md px-3 py-1.5 transition-colors",
                                          isActive
                                            ? "bg-white/[0.08] text-white/95"
                                            : "text-slate-300/85 hover:bg-white/[0.04] hover:text-white"
                                        )}
                                      >
                                        <item.icon
                                          size={15}
                                          className={cn(
                                            "flex-shrink-0 transition-colors",
                                            isActive
                                              ? "text-slate-100"
                                              : "text-slate-400/80 group-hover:text-slate-200"
                                          )}
                                        />

                                        <span className="ml-2.5 flex-1 truncate text-[12px] font-medium">
                                          {item.label}
                                        </span>
                                      </Link>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
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
              <p className="text-xs text-slate-400 truncate">{ROLE_LABEL[currentUserRole]}</p>
            </div>
          )}

          {isOpen && (
            <button
              onClick={handleLogout}
              className="text-slate-400 hover:text-red-400 transition-colors p-2 rounded-md hover:bg-slate-800"
              title="Sair do sistema"
              aria-label="Sair do sistema"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
