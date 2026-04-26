"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, Plus, Filter, User as UserIcon,
  Trash2, Edit, X, CheckCircle, Loader2, Lock, Shield, ShieldCheck,
  ChevronDown, ChevronRight, RotateCcw, Eye, Pencil, RefreshCw
} from 'lucide-react';
import { PAGE_DEFS, type PageKey, type PagePermission, type PermissionAction, type PermissionMatrix, type UserRole, getDefaultMatrixByRole, sanitizeMatrix } from '@/lib/permissions';

// Tipos atualizados para Turso (ID string)
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

type PermissionGroupId =
  | 'principal'
  | 'operacoes'
  | 'pessoas'
  | 'qualidade'
  | 'financeiro'
  | 'inteligencia'
  | 'marketing'
  | 'intranet'
  | 'sistema';

type PermissionFilterKey = 'all' | 'with_access' | 'without_access' | 'with_edit' | 'with_refresh' | 'changed';
type PermissionBulkMode = 'none' | 'view' | 'edit' | 'full';
type PageDefinition = (typeof PAGE_DEFS)[number];

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

const PERMISSION_GROUPS: Array<{ id: PermissionGroupId; label: string; description: string }> = [
  { id: 'principal', label: 'Principal', description: 'Entrada e visão geral do painel.' },
  { id: 'operacoes', label: 'Operações', description: 'Rotinas de atendimento, agenda e profissionais.' },
  { id: 'pessoas', label: 'Gestão de Pessoas', description: 'Colaboradores, folha e recrutamento.' },
  { id: 'qualidade', label: 'Qualidade', description: 'Equipamentos, documentos, vigilância e treinamentos.' },
  { id: 'financeiro', label: 'Financeiro', description: 'Financeiro, propostas, contratos e repasses.' },
  { id: 'inteligencia', label: 'Inteligência', description: 'Metas, produtividade e ocupação.' },
  { id: 'marketing', label: 'Marketing', description: 'Controle e funil de marketing.' },
  { id: 'intranet', label: 'Intranet', description: 'Gestão editorial e administrativa da intranet.' },
  { id: 'sistema', label: 'Sistema', description: 'Usuários, configurações, ajuda e modelos.' },
];

const PAGE_PERMISSION_GROUP: Record<PageKey, PermissionGroupId> = {
  dashboard: 'principal',
  monitor: 'operacoes',
  checklist_crc: 'operacoes',
  checklist_recepcao: 'operacoes',
  produtividade: 'operacoes',
  agendamentos: 'operacoes',
  profissionais: 'operacoes',
  colaboradores: 'pessoas',
  folha_pagamento: 'pessoas',
  recrutamento: 'pessoas',
  equipamentos: 'qualidade',
  qualidade_documentos: 'qualidade',
  vigilancia_sanitaria: 'qualidade',
  qualidade_treinamentos: 'qualidade',
  qualidade_auditorias: 'qualidade',
  financeiro: 'financeiro',
  contratos: 'financeiro',
  propostas: 'financeiro',
  propostas_gerencial: 'financeiro',
  repasses: 'financeiro',
  metas_dashboard: 'inteligencia',
  metas: 'inteligencia',
  agenda_ocupacao: 'inteligencia',
  marketing_controle: 'marketing',
  marketing_funil: 'marketing',
  intranet_dashboard: 'intranet',
  intranet_navegacao: 'intranet',
  intranet_paginas: 'intranet',
  intranet_noticias: 'intranet',
  intranet_faq: 'intranet',
  intranet_catalogo: 'intranet',
  intranet_audiencias: 'intranet',
  intranet_escopos: 'intranet',
  intranet_chat: 'intranet',
  intranet_chatbot: 'intranet',
  ajuda: 'sistema',
  users: 'sistema',
  contract_templates: 'sistema',
  settings: 'sistema',
};

const PERMISSION_FILTERS: Array<{ key: PermissionFilterKey; label: string }> = [
  { key: 'all', label: 'Todas' },
  { key: 'with_access', label: 'Com acesso' },
  { key: 'without_access', label: 'Sem acesso' },
  { key: 'with_edit', label: 'Com edição' },
  { key: 'with_refresh', label: 'Com atualização' },
  { key: 'changed', label: 'Alteradas' },
];

const BULK_ACTIONS: Array<{ mode: PermissionBulkMode; label: string }> = [
  { mode: 'none', label: 'Sem acesso' },
  { mode: 'view', label: 'Somente visualizar' },
  { mode: 'edit', label: 'Visualizar + editar' },
  { mode: 'full', label: 'Acesso completo' },
];

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const defaultExpandedPermissionGroups = () =>
  PERMISSION_GROUPS.reduce((acc, group) => {
    acc[group.id] = true;
    return acc;
  }, {} as Record<PermissionGroupId, boolean>);

const hasAnyPermission = (permission?: PagePermission) =>
  Boolean(permission?.view || permission?.edit || permission?.refresh);

const permissionsEqual = (a?: PagePermission, b?: PagePermission) =>
  Boolean(a?.view) === Boolean(b?.view) &&
  Boolean(a?.edit) === Boolean(b?.edit) &&
  Boolean(a?.refresh) === Boolean(b?.refresh);

const permissionForBulkMode = (mode: PermissionBulkMode): PagePermission => {
  if (mode === 'full') return { view: true, edit: true, refresh: true };
  if (mode === 'edit') return { view: true, edit: true, refresh: false };
  if (mode === 'view') return { view: true, edit: false, refresh: false };
  return { view: false, edit: false, refresh: false };
};

const nextPermissionValue = (current: PagePermission, action: PermissionAction, value: boolean): PagePermission => {
  if (action === 'view') {
    return value
      ? { ...current, view: true }
      : { view: false, edit: false, refresh: false };
  }

  return {
    ...current,
    view: value ? true : current.view,
    [action]: value,
  };
};

export default function UsersPage() {
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
  const [permissionsBaseline, setPermissionsBaseline] = useState<PermissionMatrix>(getDefaultMatrixByRole('OPERADOR'));
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [permissionsSaving, setPermissionsSaving] = useState(false);
  const [permissionSearchTerm, setPermissionSearchTerm] = useState('');
  const [permissionFilter, setPermissionFilter] = useState<PermissionFilterKey>('all');
  const [expandedPermissionGroups, setExpandedPermissionGroups] = useState<Record<PermissionGroupId, boolean>>(defaultExpandedPermissionGroups);

  const fetchUsers = useCallback(async () => {
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
  }, []);

  // --- CARREGAR DADOS ---
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchUsers();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchUsers]);

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
    setPermissionSearchTerm('');
    setPermissionFilter('all');
    setExpandedPermissionGroups(defaultExpandedPermissionGroups());
    try {
      const res = await fetch(`/api/admin/users/permissions?userId=${encodeURIComponent(user.id)}`);
      const data = await res.json();
      if (!res.ok || data?.status !== 'success') {
        throw new Error(data?.error || 'Falha ao carregar permissoes');
      }
      const matrix = sanitizeMatrix(data.permissions, user.role);
      setPermissionsMatrix(matrix);
      setPermissionsBaseline(matrix);
    } catch (error: unknown) {
      alert(getErrorMessage(error, 'Falha ao carregar permissoes'));
      setIsPermissionsModalOpen(false);
      setPermissionsUser(null);
    } finally {
      setPermissionsLoading(false);
    }
  };

  const closePermissionsModal = () => {
    setIsPermissionsModalOpen(false);
    setPermissionsUser(null);
    setPermissionSearchTerm('');
    setPermissionFilter('all');
  };

  const updatePermission = (page: PageKey, action: PermissionAction, value: boolean) => {
    setPermissionsMatrix((prev) => ({
      ...prev,
      [page]: nextPermissionValue(prev[page], action, value),
    }));
  };

  const applyBulkPermission = (pages: PageDefinition[], mode: PermissionBulkMode) => {
    const nextPermission = permissionForBulkMode(mode);
    setPermissionsMatrix((prev) => {
      const next = { ...prev };
      for (const page of pages) {
        next[page.key] = { ...nextPermission };
      }
      return next;
    });
  };

  const restoreDefaultPermissions = () => {
    if (!permissionsUser) return;
    setPermissionsMatrix(getDefaultMatrixByRole(permissionsUser.role));
  };

  const togglePermissionGroup = (groupId: PermissionGroupId) => {
    setExpandedPermissionGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
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
      closePermissionsModal();
    } catch (error: unknown) {
      alert(getErrorMessage(error, 'Falha ao salvar permissoes'));
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

    } catch (error: unknown) {
      alert(getErrorMessage(error, 'Erro ao salvar'));
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

  const filteredPermissionPages = useMemo(() => {
    const search = normalizeText(permissionSearchTerm);
    return PAGE_DEFS.filter((page) => {
      const permission = permissionsMatrix[page.key];
      const changed = !permissionsEqual(permission, permissionsBaseline[page.key]);
      const searchable = normalizeText(`${page.label} ${page.path} ${page.key} ${PERMISSION_GROUPS.find((group) => group.id === PAGE_PERMISSION_GROUP[page.key])?.label}`);
      const matchesSearch = !search || searchable.includes(search);

      if (!matchesSearch) return false;
      if (permissionFilter === 'with_access') return hasAnyPermission(permission);
      if (permissionFilter === 'without_access') return !hasAnyPermission(permission);
      if (permissionFilter === 'with_edit') return Boolean(permission?.edit);
      if (permissionFilter === 'with_refresh') return Boolean(permission?.refresh);
      if (permissionFilter === 'changed') return changed;
      return true;
    });
  }, [permissionSearchTerm, permissionFilter, permissionsMatrix, permissionsBaseline]);

  const permissionGroupSections = useMemo(() => {
    const visibleKeys = new Set(filteredPermissionPages.map((page) => page.key));
    return PERMISSION_GROUPS.map((group) => {
      const pages = PAGE_DEFS.filter((page) => PAGE_PERMISSION_GROUP[page.key] === group.id);
      const visiblePages = pages.filter((page) => visibleKeys.has(page.key));
      const accessCount = pages.filter((page) => hasAnyPermission(permissionsMatrix[page.key])).length;
      const editCount = pages.filter((page) => permissionsMatrix[page.key]?.edit).length;
      const refreshCount = pages.filter((page) => permissionsMatrix[page.key]?.refresh).length;
      const changedCount = pages.filter((page) => !permissionsEqual(permissionsMatrix[page.key], permissionsBaseline[page.key])).length;

      return {
        ...group,
        pages,
        visiblePages,
        accessCount,
        editCount,
        refreshCount,
        changedCount,
      };
    }).filter((group) => group.visiblePages.length > 0);
  }, [filteredPermissionPages, permissionsMatrix, permissionsBaseline]);

  const permissionSummary = useMemo(() => {
    const pagesWithAccess = PAGE_DEFS.filter((page) => hasAnyPermission(permissionsMatrix[page.key])).length;
    const pagesWithEdit = PAGE_DEFS.filter((page) => permissionsMatrix[page.key]?.edit).length;
    const pagesWithRefresh = PAGE_DEFS.filter((page) => permissionsMatrix[page.key]?.refresh).length;
    const changedPages = PAGE_DEFS.filter((page) => !permissionsEqual(permissionsMatrix[page.key], permissionsBaseline[page.key])).length;

    return {
      total: PAGE_DEFS.length,
      pagesWithAccess,
      pagesWithEdit,
      pagesWithRefresh,
      changedPages,
    };
  }, [permissionsMatrix, permissionsBaseline]);

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
                      <option value="INTRANET">Intranet</option>
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
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex flex-col gap-4 bg-slate-50/70 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <ShieldCheck size={18} className="text-indigo-600" />
                  Permissões · {permissionsUser.name}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700">
                    {permissionsUser.role}
                  </span>
                  <span>{permissionsUser.department || 'Geral'}</span>
                  <span>•</span>
                  <span>{permissionSummary.pagesWithAccess}/{permissionSummary.total} páginas com acesso</span>
                </div>
              </div>
              <button
                onClick={closePermissionsModal}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Fechar modal de permissões"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {permissionsLoading ? (
                <div className="py-16 flex items-center justify-center text-slate-500 gap-2">
                  <Loader2 className="animate-spin" size={18} />
                  Carregando permissões...
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        type="text"
                        value={permissionSearchTerm}
                        onChange={(e) => setPermissionSearchTerm(e.target.value)}
                        placeholder="Buscar página, área, rota ou chave..."
                        className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:border-[#17407E] focus:ring-2 focus:ring-[#17407E]/20"
                      />
                    </div>
                    <button
                      onClick={restoreDefaultPermissions}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      <RotateCcw size={16} />
                      Restaurar padrão do cargo
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {PERMISSION_FILTERS.map((filter) => (
                      <button
                        key={filter.key}
                        onClick={() => setPermissionFilter(filter.key)}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                          permissionFilter === filter.key
                            ? 'border-[#17407E] bg-blue-50 text-[#17407E]'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        )}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Ações na lista filtrada</p>
                        <p className="text-xs text-slate-500">{filteredPermissionPages.length} páginas selecionadas pelos filtros atuais.</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {BULK_ACTIONS.map((action) => (
                        <button
                          key={action.mode}
                          onClick={() => applyBulkPermission(filteredPermissionPages, action.mode)}
                          disabled={filteredPermissionPages.length === 0}
                          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-[#17407E] hover:text-[#17407E] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {permissionGroupSections.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                        Nenhuma permissão encontrada para os filtros aplicados.
                      </div>
                    ) : null}

                    {permissionGroupSections.map((group) => {
                      const isExpanded = expandedPermissionGroups[group.id];

                      return (
                        <section key={group.id} className="rounded-lg border border-slate-200 bg-white shadow-sm">
                          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                            <button
                              onClick={() => togglePermissionGroup(group.id)}
                              className="flex min-w-0 flex-1 items-start gap-3 text-left"
                            >
                              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                                {isExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                              </span>
                              <span className="min-w-0">
                                <span className="block font-semibold text-slate-900">{group.label}</span>
                                <span className="mt-0.5 block text-xs leading-5 text-slate-500">{group.description}</span>
                              </span>
                            </button>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-[#17407E]">
                                {group.accessCount}/{group.pages.length} com acesso
                              </span>
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">
                                {group.editCount} edição
                              </span>
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">
                                {group.refreshCount} atualização
                              </span>
                              {group.changedCount ? (
                                <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">
                                  {group.changedCount} alteradas
                                </span>
                              ) : null}
                            </div>
                          </div>

                          {isExpanded ? (
                            <div>
                              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
                                <span className="text-xs font-semibold uppercase text-slate-500">Aplicar neste grupo</span>
                                {BULK_ACTIONS.map((action) => (
                                  <button
                                    key={action.mode}
                                    onClick={() => applyBulkPermission(group.pages, action.mode)}
                                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-[#17407E] hover:text-[#17407E]"
                                  >
                                    {action.label}
                                  </button>
                                ))}
                              </div>

                              <div className="overflow-x-auto">
                                <div className="min-w-[760px]">
                                  <div className="grid grid-cols-[minmax(0,1fr)_120px_120px_120px] border-b border-slate-100 bg-white px-4 py-2 text-xs font-semibold uppercase text-slate-500">
                                    <div>Página</div>
                                    <div className="flex items-center justify-center gap-1">
                                      <Eye size={13} />
                                      Visualizar
                                    </div>
                                    <div className="flex items-center justify-center gap-1">
                                      <Pencil size={13} />
                                      Editar
                                    </div>
                                    <div className="flex items-center justify-center gap-1">
                                      <RefreshCw size={13} />
                                      Atualizar
                                    </div>
                                  </div>

                                  {group.visiblePages.map((page) => {
                                    const permission = permissionsMatrix[page.key];
                                    const changed = !permissionsEqual(permission, permissionsBaseline[page.key]);

                                    return (
                                      <div key={page.key} className="grid grid-cols-[minmax(0,1fr)_120px_120px_120px] items-center border-b border-slate-100 px-4 py-3 last:border-b-0">
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-2">
                                            <p className="truncate text-sm font-semibold text-slate-800">{page.label}</p>
                                            {changed ? <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" title="Permissão alterada" /> : null}
                                          </div>
                                          <p className="mt-0.5 truncate text-xs text-slate-500">{page.path}</p>
                                        </div>
                                        {(['view', 'edit', 'refresh'] as PermissionAction[]).map((action) => (
                                          <label key={action} className="flex items-center justify-center">
                                            <input
                                              type="checkbox"
                                              checked={Boolean(permission?.[action])}
                                              onChange={(e) => updatePermission(page.key, action, e.target.checked)}
                                              className="h-4 w-4 rounded border-slate-300 text-[#17407E] focus:ring-[#17407E]"
                                            />
                                            <span className="sr-only">
                                              {action === 'view' ? 'Visualizar' : action === 'edit' ? 'Editar' : 'Atualizar'} {page.label}
                                            </span>
                                          </label>
                                        ))}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </section>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                <span className="rounded-full bg-white px-2.5 py-1 font-semibold ring-1 ring-slate-200">
                  {permissionSummary.pagesWithAccess} com acesso
                </span>
                <span className="rounded-full bg-white px-2.5 py-1 font-semibold ring-1 ring-slate-200">
                  {permissionSummary.pagesWithEdit} com edição
                </span>
                <span className="rounded-full bg-white px-2.5 py-1 font-semibold ring-1 ring-slate-200">
                  {permissionSummary.pagesWithRefresh} com atualização
                </span>
                <span className={cn(
                  'rounded-full px-2.5 py-1 font-semibold ring-1',
                  permissionSummary.changedPages
                    ? 'bg-amber-50 text-amber-700 ring-amber-200'
                    : 'bg-white text-slate-600 ring-slate-200'
                )}>
                  {permissionSummary.changedPages} alterações
                </span>
              </div>
              <div className="flex justify-end gap-3">
              <button
                onClick={closePermissionsModal}
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
        </div>
      )}
    </div>
  );
}
