'use client';

import React from 'react';
import { 
    LayoutGrid, 
    DollarSign, 
    Stethoscope, 
    Users, 
    Activity, 
    Target, 
    Megaphone, 
    Briefcase,
    ConciergeBell // Ícone bom para Recepção
} from 'lucide-react';

interface GoalTabsProps {
    activeTab: string;
    onChange: (tab: string) => void;
    counts: Record<string, number>;
}

export const GoalTabs = ({ activeTab, onChange, counts }: GoalTabsProps) => {
    
    // 1. Mapa de Ícones (Associa nome do setor ao ícone)
    // Se criar um setor novo que não está aqui, ele usará o 'default'
    const ICON_MAP: Record<string, any> = {
        'Financeiro': DollarSign,
        'Comercial': Users,
        'Médico': Stethoscope,
        'Operacional': Activity,
        'Recepção': ConciergeBell, // Adicionei para o seu caso
        'Marketing': Megaphone,
        'RH': Briefcase,
        'default': Target // Ícone genérico para setores desconhecidos
    };

    // 2. Gera a lista de abas dinamicamente baseada nos dados existentes
    // Filtramos apenas setores que têm pelo menos 1 meta (count > 0)
    const dynamicSectors = Object.keys(counts).sort(); // Ordem alfabética

    // Monta a estrutura final das abas
    const tabs = [
        { id: 'all', label: 'Visão Geral', icon: LayoutGrid }, // Sempre fixa
        ...dynamicSectors.map(sector => ({
            id: sector,
            label: sector,
            icon: ICON_MAP[sector] || ICON_MAP['default'] // Fallback seguro
        }))
    ];

    return (
        <div className="border-b border-slate-200 bg-white px-6 pt-2 sticky top-0 z-10">
            <div className="flex items-center gap-6 overflow-x-auto no-scrollbar">
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    // Para a aba 'all', não mostramos badge de contagem
                    const count = tab.id === 'all' ? 0 : counts[tab.id];
                    const Icon = tab.icon;

                    return (
                        <button
                            key={tab.id}
                            onClick={() => onChange(tab.id)}
                            className={`
                                flex items-center gap-2 pb-3 pt-2 text-sm font-medium transition-all relative whitespace-nowrap outline-none
                                ${isActive ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}
                            `}
                        >
                            <Icon size={16} className={isActive ? 'stroke-[2.5px]' : ''} />
                            {tab.label}
                            
                            {/* Contador (Badge) - Só mostra se for aba de setor específico */}
                            {tab.id !== 'all' && (
                                <span className={`
                                    text-[10px] px-1.5 py-0.5 rounded-full font-bold
                                    ${isActive ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}
                                `}>
                                    {count}
                                </span>
                            )}

                            {/* Linha Azul Ativa */}
                            {isActive && (
                                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full" />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};