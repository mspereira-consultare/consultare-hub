'use client';

import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Loader2 } from 'lucide-react';

interface TeamsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onTeamsUpdated?: () => void;
}

interface Team {
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
}

export const TeamsModal = ({ isOpen, onClose, onTeamsUpdated }: TeamsModalProps) => {
    const [teams, setTeams] = useState<Team[]>([]);
    const [loading, setLoading] = useState(false);
    const [newTeamName, setNewTeamName] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Carrega equipes ao abrir o modal
    useEffect(() => {
        if (isOpen) {
            fetchTeams();
        }
    }, [isOpen]);

    const fetchTeams = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/teams', { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setTeams(data.teams || []);
            }
        } catch (e) {
            console.error("Erro ao carregar equipes:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateTeam = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!newTeamName.trim()) {
            setError('Nome da equipe é obrigatório');
            return;
        }

        try {
            const res = await fetch('/api/admin/teams', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newTeamName.trim() })
            });

            if (res.ok) {
                setSuccess('Equipe criada com sucesso!');
                setNewTeamName('');
                fetchTeams();
                if (onTeamsUpdated) onTeamsUpdated();
                setTimeout(() => setSuccess(''), 3000);
            } else {
                const data = await res.json();
                setError(data.error || 'Erro ao criar equipe');
            }
        } catch (e) {
            setError('Erro ao criar equipe');
            console.error(e);
        }
    };

    const handleDeleteTeam = async (teamId: string) => {
        if (!confirm('Tem certeza que deseja deletar esta equipe?')) return;

        try {
            const res = await fetch(`/api/admin/teams?id=${teamId}`, { method: 'DELETE' });
            if (res.ok) {
                setSuccess('Equipe deletada com sucesso!');
                fetchTeams();
                if (onTeamsUpdated) onTeamsUpdated();
                setTimeout(() => setSuccess(''), 3000);
            } else {
                setError('Erro ao deletar equipe');
            }
        } catch (e) {
            setError('Erro ao deletar equipe');
            console.error(e);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
                
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        📋 Gerenciar Equipes
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
                    
                    {/* Form para criar nova equipe */}
                    <form onSubmit={handleCreateTeam} className="space-y-3 pb-4 border-b border-slate-200">
                        <label className="text-sm font-semibold text-slate-700">Nova Equipe</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Nome da equipe..."
                                value={newTeamName}
                                onChange={(e) => setNewTeamName(e.target.value)}
                                className="flex-1 p-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                type="submit"
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors flex items-center gap-2"
                            >
                                <Plus size={16} />
                                Criar
                            </button>
                        </div>
                    </form>

                    {/* Mensagens */}
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg">
                            ✓ {success}
                        </div>
                    )}

                    {/* Lista de equipes */}
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">Equipes Existentes</label>
                        {loading ? (
                            <div className="flex justify-center py-4">
                                <Loader2 className="animate-spin text-blue-500" size={24} />
                            </div>
                        ) : teams.length > 0 ? (
                            <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                                {teams.map((team: Team) => (
                                    <div
                                        key={team.id}
                                        className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors group"
                                    >
                                        <div>
                                            <p className="font-medium text-slate-700">{team.name}</p>
                                            <p className="text-xs text-slate-500">
                                                Criada em: {new Date(team.created_at).toLocaleDateString('pt-BR')}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteTeam(team.id)}
                                            className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors opacity-0 group-hover:opacity-100"
                                            title="Deletar equipe"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-6 text-slate-500">
                                <p className="text-sm">Nenhuma equipe criada ainda.</p>
                                <p className="text-xs">Crie uma acima para começar.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
};
