"use client";

import React, { useState, useEffect } from 'react';
import { useSession } from "next-auth/react";
import { useRouter } from 'next/navigation';
import { 
  Search, Plus, Filter, User as UserIcon,
  Trash2, Edit, X, CheckCircle, Loader2, Lock, Shield, ShieldCheck
} from 'lucide-react';
import { PAGE_DEFS, type PageKey, type PermissionAction, type PermissionMatrix, getDefaultMatrixByRole, sanitizeMatrix } from '@/lib/permissions';

// Tipos atualizados para Turso (ID string)
type UserRole = 'ADMIN' | 'GESTOR' | 'OPERADOR';
type UserStatus = 'ATIVO' | 'INATIVO';

interface User {
  id: string; // Mudou de number para string (UUID)
  name: string;
  email: string;
  role: UserRole;
  department: string;
  status: UserStatus;
  last_access: string | null;
}

export default function UsersPage() {
  const { data: session } = useSession();
  const router = useRouter();

  // --- HOOKS DE ESTADO ---
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal e Formulário
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Estado do Formulário
  const [formData, setFormData] = useState<{
    id?: string; // string para edição
    name: string;
    email: string;
    password?: string;
    role: UserRole;
    department: string;
    status: UserStatus;
  }>({
    name: '',
    email: '',
    password: '',
    role: 'OPERADOR',
    department: 'Atendimento',
    status: 'ATIVO'
  });

  // Modal de permissões
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
  const [permissionsUser, setPermissionsUser] = useState<User | null>(null);
  const [permissionsMatrix, setPermissionsMatrix] = useState<PermissionMatrix>(getDefaultMatrixByRole('OPERADOR'));
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [permissionsSaving, setPermissionsSaving] = useState(false);

  // --- CARREGAR DADOS ---
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (error) {
      console.error("Erro ao buscar usuários:", error);
    } finally {
      setLoading(false);
    }
  };

  // --- AÇÕES ---
  const handleEditUser = (user: User) => {
    setFormData({
      id: user.id,
      name: user.name,
      email: user.email,
      password: '', // Senha vazia na edição (só preenche se quiser trocar)
      role: user.role,
      department: user.department,
      status: user.status
    });
    setIsModalOpen(true);
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este usuário?')) return;

    try {
      const res = await fetch(`/api/admin/users?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setUsers(users.filter(u => u.id !== id));
      } else {
        alert("Erro ao excluir usuário.");
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleOpenPermissions = async (user: User) => {
    setPermissionsUser(user);
    setPermissionsLoading(true);
    setIsPermissionsModalOpen(true);
    try {
      const res = await fetch(`/api/admin/users/permissions?userId=${encodeURIComponent(user.id)}`);
      const data = await res.json();
      if (!res.ok || data?.status !== 'success') {
        throw new Error(data?.error || 'Falha ao carregar permissoes');
      }
      setPermissionsMatrix(sanitizeMatrix(data.permissions, user.role));
    } catch (error: any) {
      alert(error?.message || 'Falha ao carregar permissoes');
      setIsPermissionsModalOpen(false);
      setPermissionsUser(null);
    } finally {
      setPermissionsLoading(false);
    }
  };

  const updatePermission = (page: PageKey, action: PermissionAction, value: boolean) => {
    setPermissionsMatrix((prev) => ({
      ...prev,
      [page]: {
        ...prev[page],
        [action]: value,
      },
    }));
  };

  const handleSavePermissions = async () => {
    if (!permissionsUser) return;
    setPermissionsSaving(true);
    try {
      const res = await fetch('/api/admin/users/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: permissionsUser.id,
          permissions: permissionsMatrix,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.status !== 'success') {
        throw new Error(data?.error || 'Falha ao salvar permissoes');
      }
      setIsPermissionsModalOpen(false);
      setPermissionsUser(null);
    } catch (error: any) {
      alert(error?.message || 'Falha ao salvar permissoes');
    } finally {
      setPermissionsSaving(false);
    }
  };

  const handleSaveUser = async () => {
    if (!formData.name || !formData.email) return alert("Preencha nome e email.");
    
    // Validação de senha apenas na criação
    if (!formData.id && !formData.password) return alert("Senha é obrigatória para novos usuários.");

    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Erro ao salvar");

      await fetchUsers(); // Recarrega lista
      setIsModalOpen(false);
      resetForm();

    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      password: '',
      role: 'OPERADOR',
      department: 'Atendimento',
      status: 'ATIVO'
    });
  };

  // --- FILTROS ---
  const filteredUsers = users.filter(user => 
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <UserIcon className="w-6 h-6 text-[#17407E]" />
            Gerenciamento de Usuários
          </h1>
          <p className="text-slate-500 mt-1">
            Controle de acesso, permissões e departamentos.
          </p>
        </div>
        
        <button 
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="bg-[#17407E] hover:bg-[#053F74] text-white px-5 py-2.5 rounded-lg flex items-center gap-2 font-medium transition-all shadow-sm active:scale-95"
        >
          <Plus size={20} />
          Novo Usuário
        </button>
      </div>

      {/* Barra de Ferramentas */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Buscar por nome, email ou departamento..." 
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#17407E]/20 focus:border-[#17407E] outline-none transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
            <button className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 flex items-center gap-2 text-sm font-medium">
                <Filter size={16} />
                Filtrar
            </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Usuário</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Departamento</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Função</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Último Acesso</th>
                <th className="px-6 py-4 text-end text-xs font-semibold text-slate-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                        <div className="flex flex-col items-center gap-3">
                            <Loader2 className="animate-spin text-[#17407E]" size={32} />
                            <span>Carregando usuários...</span>
                        </div>
                    </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                        Nenhum usuário encontrado.
                    </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#17407E]/10 flex items-center justify-center text-[#17407E] font-bold">
                            {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div className="font-medium text-slate-900">{user.name}</div>
                            <div className="text-sm text-slate-500">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                        <span className="px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 font-medium text-xs">
                            {user.department || 'Geral'}
                        </span>
                    </td>
                    <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-sm text-slate-700">
                            {user.role === 'ADMIN' && <Shield size={14} className="text-amber-500" />}
                            {user.role}
                        </div>
                    </td>
                    <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                            user.status === 'ATIVO' 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                : 'bg-red-50 text-red-700 border-red-200'
                        }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                                user.status === 'ATIVO' ? 'bg-emerald-500' : 'bg-red-500'
                            }`} />
                            {user.status}
                        </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                        {user.last_access ? new Date(user.last_access).toLocaleDateString('pt-BR') : '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={() => handleOpenPermissions(user)}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                            title="Permissões"
                        >
                          <ShieldCheck size={18} />
                        </button>
                        <button 
                            onClick={() => handleEditUser(user)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="Editar"
                        >
                          <Edit size={18} />
                        </button>
                        <button 
                            onClick={() => handleDeleteUser(user.id)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Excluir"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Criar/Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden scale-100">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                {formData.id ? <Edit size={18} className="text-blue-600" /> : <Plus size={18} className="text-blue-600" />}
                {formData.id ? 'Editar Usuário' : 'Novo Usuário'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Nome */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome Completo</label>
                <input 
                  type="text" 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#17407E]/20 focus:border-[#17407E] outline-none transition-all"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="Ex: João Silva"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">E-mail Corporativo</label>
                <input 
                  type="email" 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#17407E]/20 focus:border-[#17407E] outline-none transition-all"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="joao@consultare.com.br"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                 {/* Departamento */}
                 <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Departamento</label>
                    <select 
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#17407E]/20 focus:border-[#17407E] outline-none bg-white"
                      value={formData.department}
                      onChange={(e) => setFormData({...formData, department: e.target.value})}
                    >
                      <option value="Atendimento">Atendimento</option>
                      <option value="Comercial">Comercial</option>
                      <option value="Financeiro">Financeiro</option>
                      <option value="TI / Sistemas">TI / Sistemas</option>
                      <option value="Diretoria">Diretoria</option>
                    </select>
                 </div>

                 {/* Função */}
                 <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Função / Perfil</label>
                    <select 
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#17407E]/20 focus:border-[#17407E] outline-none bg-white"
                      value={formData.role}
                      onChange={(e) => setFormData({...formData, role: e.target.value as UserRole})}
                    >
                      <option value="OPERADOR">Operador</option>
                      <option value="GESTOR">Gestor</option>
                      <option value="ADMIN">Administrador</option>
                    </select>
                 </div>
              </div>

              {/* Senha */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 flex justify-between">
                    <span>Senha de Acesso</span>
                    {formData.id && <span className="text-xs text-slate-400 font-normal">Deixe em branco para manter</span>}
                </label>
                <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                    type="password" 
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#17407E]/20 focus:border-[#17407E] outline-none transition-all"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    placeholder={formData.id ? "••••••••" : "Crie uma senha forte"}
                    />
                </div>
              </div>

              {/* Status (Apenas edição) */}
              {formData.id && (
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
                Salvar Usuário
              </button>
            </div>
          </div>
        </div>
      )}

      {isPermissionsModalOpen && permissionsUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <ShieldCheck size={18} className="text-indigo-600" />
                Permissões · {permissionsUser.name}
              </h2>
              <button
                onClick={() => {
                  setIsPermissionsModalOpen(false);
                  setPermissionsUser(null);
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              {permissionsLoading ? (
                <div className="py-16 flex items-center justify-center text-slate-500 gap-2">
                  <Loader2 className="animate-spin" size={18} />
                  Carregando permissões...
                </div>
              ) : (
                <div className="overflow-auto max-h-[60vh] border border-slate-200 rounded-lg">
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-slate-50 sticky top-0 z-10">
                      <tr className="border-b border-slate-200">
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">Página</th>
                        <th className="px-4 py-3 text-center font-semibold text-slate-600">View</th>
                        <th className="px-4 py-3 text-center font-semibold text-slate-600">Edit</th>
                        <th className="px-4 py-3 text-center font-semibold text-slate-600">Refresh</th>
                      </tr>
                    </thead>
                    <tbody>
                      {PAGE_DEFS.map((page) => (
                        <tr key={page.key} className="border-b border-slate-100">
                          <td className="px-4 py-3 text-slate-700">{page.label}</td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={Boolean(permissionsMatrix[page.key]?.view)}
                              onChange={(e) => updatePermission(page.key, 'view', e.target.checked)}
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={Boolean(permissionsMatrix[page.key]?.edit)}
                              onChange={(e) => updatePermission(page.key, 'edit', e.target.checked)}
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={Boolean(permissionsMatrix[page.key]?.refresh)}
                              onChange={(e) => updatePermission(page.key, 'refresh', e.target.checked)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsPermissionsModalOpen(false);
                  setPermissionsUser(null);
                }}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSavePermissions}
                disabled={permissionsSaving || permissionsLoading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-md transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {permissionsSaving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                Salvar Permissões
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
