"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import Cookies from 'js-cookie';
import { 
  LayoutDashboard, 
  PhoneCall, 
  DollarSign, 
  Users, 
  ShieldCheck, 
  Settings, 
  Menu, 
  X,
  LogOut
} from 'lucide-react';

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

// --- CONFIGURAÇÃO DE PERMISSÕES ---
// Tipos de cargos disponíveis no sistema
type UserRole = 'ADMIN' | 'GESTOR' | 'OPERADOR';

// SIMULAÇÃO DO USUÁRIO LOGADO
// Mude esta string para 'GESTOR' ou 'OPERADOR' para testar a sidebar mudando!
const currentUserRole: UserRole = 'ADMIN'; 

interface MenuItem {
  href: string;
  label: string;
  icon: React.ElementType;
  group: string;
  roles: UserRole[]; // Array de cargos que podem ver este item
}

const menuItems: MenuItem[] = [
  // Todos podem ver o Dashboard
  { href: '/dashboard', label: 'Visão Geral', icon: LayoutDashboard, group: 'PRINCIPAL', roles: ['ADMIN', 'GESTOR', 'OPERADOR'] },
  
  // Operações: Todos veem (ou restrinja se quiser)
  { href: '/crc', label: 'Monitoramento CRC', icon: PhoneCall, group: 'OPERAÇÕES', roles: ['ADMIN', 'GESTOR', 'OPERADOR'] },
  
  // Financeiro: Apenas Admin e Gestor
  { href: '/financeiro', label: 'Financeiro', icon: DollarSign, group: 'INTELIGÊNCIA', roles: ['ADMIN', 'GESTOR'] },
  
  // Sistema: Apenas Admin
  { href: '/users', label: 'Gestão de Usuários', icon: Users, group: 'SISTEMA', roles: ['ADMIN'] },
  { href: '/admin/audit', label: 'Log de Auditoria', icon: ShieldCheck, group: 'SISTEMA', roles: ['ADMIN'] },
  { href: '/settings', label: 'Configurações', icon: Settings, group: 'SISTEMA', roles: ['ADMIN'] },
];

export function Sidebar() {
  const [isOpen, setIsOpen] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  // Filtra os itens baseado no cargo do usuário atual
  const authorizedItems = menuItems.filter(item => item.roles.includes(currentUserRole));

  // Agrupa os itens filtrados para renderizar os títulos de seção corretamente
  const groups = Array.from(new Set(authorizedItems.map(item => item.group)));

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/login' });
  };

  return (
    <aside 
      className={cn(
        "flex flex-col h-screen z-20 transition-all duration-300 shadow-xl flex-shrink-0",
        "bg-[#053F74] text-slate-300", 
        isOpen ? "w-72" : "w-20"
      )}
    >
      {/* Header com Logo */}
      <div className="h-16 flex items-center justify-between px-4 bg-[#043563] flex-shrink-0 shadow-sm">
        <div className={cn(
          "relative transition-all duration-300 overflow-hidden h-12", 
          isOpen ? "w-48 opacity-100" : "w-0 opacity-0"
        )}>
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

      {/* Navegação */}
      <nav className="flex-1 px-3 space-y-6 overflow-y-auto mt-6 custom-scrollbar">
        {groups.map((group) => (
          <div key={group}>
            {isOpen && (
              <h4 className="px-4 text-[10px] font-bold text-slate-400/70 uppercase tracking-wider mb-2">
                {group}
              </h4>
            )}
            <div className="space-y-1">
              {authorizedItems.filter(item => item.group === group).map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
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
                        isActive ? "text-[#3FBD80]" : "text-slate-300 group-hover:text-white"
                      )} 
                    />
                    
                    {isOpen && (
                      <span className="ml-3 text-sm flex-1 truncate">{item.label}</span>
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
      
      {/* Footer */}
      <div className="p-4 bg-[#043563] flex-shrink-0 border-t border-[#17407E]/30">
        <div className={cn("flex items-center gap-3 transition-all", !isOpen && "justify-center")}>
          <div className="relative">
            <div className="w-9 h-9 rounded-full bg-[#229A8A] flex items-center justify-center text-white font-bold text-xs border-2 border-[#053F74]">
              {currentUserRole.substring(0, 2)}
            </div>
          </div>
          
          {isOpen && (
             <div className="overflow-hidden flex-1 min-w-0">
               {/* Exibindo o Cargo atual para teste visual */}
               <p className="text-sm font-semibold text-white truncate">Usuário Mock</p>
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