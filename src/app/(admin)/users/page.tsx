"use client";

import React, { useState, useEffect } from 'react';
import { useSession } from "next-auth/react";
import { useRouter } from 'next/navigation';
import { 
  Search, Plus, Filter, Shield, ShieldAlert, User as UserIcon,
  Trash2, Edit, X, CheckCircle, Eye, EyeOff, Loader2, Lock
} from 'lucide-react';

// Tipos
type UserRole = 'ADMIN' | 'GESTOR' | 'OPERADOR';
type UserStatus = 'ATIVO' | 'INATIVO';

interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  status: UserStatus;
  last_access: string | null;
}

export default function UsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // --- HOOKS DE ESTADO (Sempre no topo) ---
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal e Formulário
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    id: 0,
    name: '',
    email: '',
    role: 'OPERADOR' as UserRole,
    department: '',
    status: 'ATIVO' as UserStatus,
    password: ''
  });

  const currentUserRole = session?.user?.role;

  // --- FUNÇÕES AUXILIARES (Definidas antes dos Effects) ---
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', { cache: 'no-store' });
      const data = await res.json();
      if (Array.isArray(data)) setUsers(data);
    } catch (error) {
      console.error("Erro ao buscar usuários:", error);
    } finally {
      setLoading(false);
    }
  };

  // --- ACTIONS ---
  const handleOpenNew = () => {
    setFormData({ id: 0, name: '', email: '', role: 'OPERADOR', department: '', status: 'ATIVO', password: '' });
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: User) => {
    setFormData({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department || '',
      status: user.status,
      password: ''
    });
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const handleSaveUser = async () => {
    if (!formData.name || !formData.email) return alert('Nome e Email são obrigatórios.');
    if (!formData.id && !formData.password) return alert('Defina uma senha para o novo usuário.');

    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      const json = await res.json();
      
      if (!res.ok) throw new Error(json.error || 'Erro ao salvar');
      
      alert(formData.id ? 'Usuário atualizado!' : 'Usuário criado com sucesso!');
      setIsModalOpen(false);
      fetchUsers();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja remover este usuário?')) return;
    try {
      await fetch(`/api/admin/users?id=${id}`, { method: 'DELETE' });
      fetchUsers();
    } catch (error) {
      console.error(error);
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'ADMIN': return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200"><ShieldAlert size={12} /> Admin</span>;
      case 'GESTOR': return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200"><Shield size={12} /> Gestor</span>;
      default: return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200"><UserIcon size={12} /> Operador</span>;
    }
  };

  // --- EFFECTS (Hooks sempre executam, a lógica condicional fica DENTRO deles) ---
  
  // Effect 1: Redirecionamento de Segurança
  useEffect(() => {
    if (status === 'authenticated') {
        const role = session?.user?.role;
        if (role === 'OPERADOR' || !role) {
            router.push('/');
        }
    }
  }, [status, session, router]);

  // Effect 2: Buscar Dados
  useEffect(() => { 
      // Só busca se autenticado E com permissão correta
      if (status === 'authenticated' && currentUserRole !== 'OPERADOR') {
          fetchUsers(); 
      }
  }, [status, currentUserRole]);


  // --- CONDITIONAL RENDERING (Agora é seguro fazer o return) ---
  
  // Enquanto verifica a sessão ou se for Operador (antes do redirect), mostra loading
  if (status === 'loading' || currentUserRole === 'OPERADOR') {
      return (
        <div className="h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
            <Loader2 className="animate-spin text-blue-600" size={40} />
            <p className="text-slate-500 font-medium">Verificando permissões...</p>
        </div>
      );
  }

  // Filtros de visualização
  const filteredUsers = users.filter(user => 
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 relative min-h-screen bg-slate-50 p-6">
      
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#053F74]">Gestão de Usuários</h1>
          <p className="text-slate-500 text-sm">Gerencie o acesso e permissões dos colaboradores.</p>
        </div>
        
        {/* Apenas ADMIN pode criar novos usuários */}
        {currentUserRole === 'ADMIN' && (
            <button onClick={handleOpenNew} className="flex items-center gap-2 bg-[#17407E] hover:bg-[#053F74] text-white px-4 py-2 rounded-lg transition-colors font-medium shadow-sm">
            <Plus size={20} /> <span>Novo Usuário</span>
            </button>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Buscar por nome ou email..." 
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#17407E]/20 focus:border-[#17407E] text-slate-700 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="flex items-center gap-2 text-slate-600 hover:text-[#17407E] px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-200">
          <Filter size={18} /> <span className="text-sm font-medium">Filtros</span>
        </button>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
           <div className="p-12 flex justify-center text-slate-400"><Loader2 className="animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-semibold text-[#053F74]">Usuário</th>
                  <th className="px-6 py-4 font-semibold text-[#053F74]">Cargo</th>
                  <th className="px-6 py-4 font-semibold text-[#053F74]">Departamento</th>
                  <th className="px-6 py-4 font-semibold text-[#053F74]">Status</th>
                  <th className="px-6 py-4 font-semibold text-[#053F74]">Último Acesso</th>
                  <th className="px-6 py-4 text-right font-semibold text-[#053F74]">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[#E0F2F1] text-[#229A8A] flex items-center justify-center font-bold text-sm border border-[#B2DFDB]">
                            {user.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">{user.name}</p>
                            <p className="text-slate-500 text-xs">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">{getRoleBadge(user.role)}</td>
                      <td className="px-6 py-4 text-slate-600">{user.department}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                          user.status === 'ATIVO' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'ATIVO' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                          {user.status === 'ATIVO' ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-xs">
                        {user.last_access || 'Nunca'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          
                          {/* Botão EDITAR: Disponível para ADMIN e GESTOR */}
                          <button onClick={() => handleOpenEdit(user)} className="p-2 text-slate-400 hover:text-[#17407E] hover:bg-[#17407E]/10 rounded-lg transition-colors" title="Editar">
                            <Edit size={16} />
                          </button>
                          
                          {/* Botão EXCLUIR: Disponível APENAS para ADMIN */}
                          {currentUserRole === 'ADMIN' && (
                              <button onClick={() => handleDelete(user.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir">
                                <Trash2 size={16} />
                              </button>
                          )}

                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">Nenhum usuário encontrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#053F74]">
                {formData.id ? 'Editar Usuário' : 'Novo Usuário'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome Completo</label>
                <input 
                  type="text" 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#17407E]/20 focus:border-[#17407E] outline-none"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input 
                  type="email" 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#17407E]/20 focus:border-[#17407E] outline-none"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                />
              </div>

              {/* SENHA */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {formData.id ? 'Alterar Senha (Opcional)' : 'Senha (Obrigatória)'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 pr-10 focus:border-[#17407E] focus:outline-none focus:ring-2 focus:ring-[#17407E]/20"
                    placeholder={formData.id ? "Deixe em branco para manter a atual" : "********"}
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-[#17407E]" tabIndex={-1}>
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Departamento</label>
                  <input 
                    type="text" 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#17407E]/20 focus:border-[#17407E] outline-none"
                    value={formData.department}
                    onChange={(e) => setFormData({...formData, department: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nível de Acesso</label>
                  <select 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#17407E]/20 focus:border-[#17407E] outline-none bg-white"
                    value={formData.role}
                    onChange={(e) => setFormData({...formData, role: e.target.value as UserRole})}
                    disabled={currentUserRole !== 'ADMIN'} // Apenas ADMIN pode promover pessoas
                  >
                    <option value="OPERADOR">Operador</option>
                    <option value="GESTOR">Gestor</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                  {currentUserRole !== 'ADMIN' && <p className="text-[10px] text-slate-400 mt-1">Apenas Admins alteram cargos.</p>}
                </div>
              </div>

              {/* Status só aparece na edição */}
              {formData.id > 0 && (
                 <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Status da Conta</label>
                    <select 
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#17407E]/20 focus:border-[#17407E] outline-none bg-white"
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value as UserStatus})}
                    >
                      <option value="ATIVO">Ativo</option>
                      <option value="INATIVO">Inativo</option>
                    </select>
                 </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-medium transition-colors">Cancelar</button>
              <button 
                onClick={handleSaveUser} 
                disabled={isSaving}
                className="px-4 py-2 bg-[#17407E] hover:bg-[#053F74] text-white rounded-lg text-sm font-medium shadow-md transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                {formData.id ? 'Atualizar' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}