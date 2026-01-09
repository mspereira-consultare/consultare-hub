"use client";

import React, { useState } from 'react';
import { 
  Search, 
  Plus, 
  Filter, 
  Shield, 
  ShieldAlert, 
  User as UserIcon,
  Trash2,
  Edit,
  X,
  CheckCircle,
  Eye,
  EyeOff
} from 'lucide-react';

// --- Tipos ---
type UserRole = 'ADMIN' | 'GESTOR' | 'OPERADOR';
type UserStatus = 'ATIVO' | 'INATIVO';

interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  status: UserStatus;
  lastAccess: string;
  // Adicionei senha aqui (na prática, o hash da senha ficaria no banco, nunca visível no front)
  password?: string; 
}

// --- Dados Iniciais (Mock) ---
const INITIAL_USERS: User[] = [
  { id: '1', name: 'Matheus Pereira', email: 'matheus@consultare.com.br', role: 'ADMIN', department: 'Tecnologia', status: 'ATIVO', lastAccess: 'Hoje, 10:30' },
  { id: '2', name: 'Ana Silva', email: 'ana.financeiro@consultare.com.br', role: 'GESTOR', department: 'Financeiro', status: 'ATIVO', lastAccess: 'Ontem, 16:45' },
  { id: '3', name: 'Carlos Souza', email: 'carlos.atendimento@consultare.com.br', role: 'OPERADOR', department: 'CRC', status: 'ATIVO', lastAccess: 'Hoje, 08:00' },
];

export default function UsersPage() {
  // Estados da Página
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estados do Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Estado do Formulário (incluindo senha agora)
  const [newUser, setNewUser] = useState<{
    name: string;
    email: string;
    role: UserRole;
    department: string;
    status: UserStatus;
    password: string; // Novo campo
  }>({
    name: '',
    email: '',
    role: 'OPERADOR',
    department: '',
    status: 'ATIVO',
    password: ''
  });

  // Filtro
  const filteredUsers = users.filter(user => 
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Badge Helper
  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'ADMIN':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200"><ShieldAlert size={12} /> Admin</span>;
      case 'GESTOR':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200"><Shield size={12} /> Gestor</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200"><UserIcon size={12} /> Operador</span>;
    }
  };

  // Função para Salvar Novo Usuário
  const handleSaveUser = () => {
    // Validação simples incluindo senha
    if (!newUser.name || !newUser.email || !newUser.department || !newUser.password) {
      return alert('Por favor, preencha todos os campos obrigatórios, incluindo a senha.');
    }

    const userToAdd: User = {
      id: Date.now().toString(),
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      department: newUser.department,
      status: 'ATIVO',
      lastAccess: 'Nunca',
      password: newUser.password 
    };

    setUsers([...users, userToAdd]);
    setIsModalOpen(false);
    // Resetar form
    setNewUser({ name: '', email: '', role: 'OPERADOR', department: '', status: 'ATIVO', password: '' });
  };

  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-6 relative">
      
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#053F74]">Gestão de Usuários</h1>
          <p className="text-slate-500 text-sm">Gerencie o acesso e permissões dos colaboradores.</p>
        </div>
        
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-[#17407E] hover:bg-[#053F74] text-white px-4 py-2 rounded-lg transition-colors font-medium shadow-sm"
        >
          <Plus size={20} />
          <span>Novo Usuário</span>
        </button>
      </div>

      {/* Barra de Filtros */}
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
          <Filter size={18} />
          <span className="text-sm font-medium">Filtros Avançados</span>
        </button>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
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
                          {user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
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
                    <td className="px-6 py-4 text-slate-500 text-xs">{user.lastAccess}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-2 text-slate-400 hover:text-[#17407E] hover:bg-[#17407E]/10 rounded-lg transition-colors"><Edit size={16} /></button>
                        <button className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- MODAL DE NOVO USUÁRIO --- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#053F74]">Novo Usuário</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Modal Body (Formulário) */}
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome Completo</label>
                <input 
                  type="text" 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#17407E]/20 focus:border-[#17407E] outline-none transition-all"
                  placeholder="Ex: João da Silva"
                  value={newUser.name}
                  onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Corporativo</label>
                <input 
                  type="email" 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#17407E]/20 focus:border-[#17407E] outline-none transition-all"
                  placeholder="Ex: joao@consultare.com.br"
                  value={newUser.email}
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                />
              </div>

              {/* NOVO CAMPO DE SENHA */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Senha do Usuário
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    className="w-full rounded-md border border-gray-300 p-2 pr-10 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Defina uma senha provisória"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-blue-700"
                    tabIndex={-1} // Evita que o tab pare no botão do olho
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Departamento</label>
                  <input 
                    type="text" 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#17407E]/20 focus:border-[#17407E] outline-none transition-all"
                    placeholder="Ex: Financeiro"
                    value={newUser.department}
                    onChange={(e) => setNewUser({...newUser, department: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nível de Acesso</label>
                  <select 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#17407E]/20 focus:border-[#17407E] outline-none transition-all bg-white"
                    value={newUser.role}
                    onChange={(e) => setNewUser({...newUser, role: e.target.value as UserRole})}
                  >
                    <option value="OPERADOR">Operador</option>
                    <option value="GESTOR">Gestor</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveUser}
                className="px-4 py-2 bg-[#17407E] hover:bg-[#053F74] text-white rounded-lg text-sm font-medium shadow-md transition-colors flex items-center gap-2"
              >
                <CheckCircle size={16} />
                Salvar Usuário
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}