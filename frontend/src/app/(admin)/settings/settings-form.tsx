"use client";

import React, { useState } from 'react';
import { 
  Save, Server, Lock, Eye, EyeOff, HelpCircle, 
  CheckCircle, Key, Loader2, Info, AlertTriangle, Cookie
} from 'lucide-react';
import { updateFeegowSettings } from "@/app/actions/settings"; 

interface IntegrationConfig {
    service: string;
    username: string;
    password?: string;
    token?: string;
    is_configured?: boolean;
}

interface SettingsFormProps {
    initialFeegow: IntegrationConfig;
    initialClinia: IntegrationConfig;
}

export default function SettingsForm({ initialFeegow, initialClinia }: SettingsFormProps) {
  const [saving, setSaving] = useState(false);
  
  const [feegow, setFeegow] = useState<IntegrationConfig>(initialFeegow);
  const [clinia, setClinia] = useState<IntegrationConfig>(initialClinia);
  
  const [showPassFeegow, setShowPassFeegow] = useState(false);
  const [activeTab, setActiveTab] = useState<'feegow' | 'clinia'>('feegow');

  const handleSave = async () => {
    setSaving(true);
    try {
        const formData = new FormData();
        
        if (activeTab === 'feegow') {
            formData.append('service', 'feegow');
            formData.append('username', feegow.username);
            formData.append('password', feegow.password || '');
            formData.append('token', feegow.token || '');
        } else {
            // CLINIA: Envia apenas o token. 
            // Username/Password vão vazios para manter compatibilidade com o banco.
            formData.append('service', 'clinia');
            formData.append('username', 'clinia_cookie_only'); // Valor dummy interno
            formData.append('password', '');
            formData.append('token', clinia.token || '');
        }
        
        const result = await updateFeegowSettings(null, formData);
        
        if (result.success) {
            alert(`Configurações da ${activeTab === 'feegow' ? 'Feegow' : 'Clinia'} salvas com sucesso!`);
        } else {
            alert(`Erro ao salvar: ${result.message}`);
        }
        
    } catch (error) {
        console.error(error);
        alert("Erro técnico ao salvar.");
    } finally {
        setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Server className="w-6 h-6 text-blue-600" />
            Configurações de Integração
          </h1>
          <p className="text-slate-500 mt-1">
            Gerencie as credenciais dos serviços externos.
          </p>
        </div>
        
        <button 
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
            {saving ? (
                <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando...
                </>
            ) : (
                <>
                    <Save className="w-4 h-4" />
                    Salvar Alterações
                </>
            )}
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200">
            <button
                onClick={() => setActiveTab('feegow')}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === 'feegow' 
                    ? 'border-blue-600 text-blue-600 bg-blue-50/50' 
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
            >
                Feegow Clinic
                {feegow.is_configured && <CheckCircle className="w-3 h-3 text-emerald-500" />}
            </button>
            <button
                onClick={() => setActiveTab('clinia')}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === 'clinia' 
                    ? 'border-blue-600 text-blue-600 bg-blue-50/50' 
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
            >
                Clinia (CRM)
                {clinia.is_configured && <CheckCircle className="w-3 h-3 text-emerald-500" />}
            </button>
        </div>

        <div className="p-6 md:p-8">
            {/* --- ABA FEEGOW (Completa) --- */}
            <div className={activeTab === 'feegow' ? 'block' : 'hidden'}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                    
                    <div className="space-y-6">
                        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                            <Lock className="w-4 h-4 text-slate-400" />
                            <h3 className="font-semibold text-slate-700">Credenciais de Acesso</h3>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Usuário / E-mail (API)
                                </label>
                                <input 
                                    type="text" 
                                    value={feegow.username}
                                    onChange={(e) => setFeegow({...feegow, username: e.target.value})}
                                    placeholder="usuario@consultare.com.br"
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Senha
                                </label>
                                <div className="relative">
                                    <input 
                                        type={showPassFeegow ? "text" : "password"} 
                                        value={feegow.password}
                                        onChange={(e) => setFeegow({...feegow, password: e.target.value})}
                                        placeholder="••••••••"
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all pr-10"
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => setShowPassFeegow(!showPassFeegow)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                    >
                                        {showPassFeegow ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 mt-8 mb-4 pb-2 border-b border-slate-100">
                            <Key className="w-4 h-4 text-slate-400" />
                            <h3 className="font-semibold text-slate-700">Token da Recepção (Cookie)</h3>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                            <div className="flex gap-3">
                                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                <div className="text-sm text-amber-800">
                                    <strong>Atenção:</strong> Este cookie é essencial para o funcionamento do 
                                    Monitor de Recepção em Tempo Real. Ele deve ser atualizado periodicamente.
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Cookie Completo
                            </label>
                            <textarea 
                                rows={5}
                                value={feegow.token || ''}
                                onChange={(e) => setFeegow({...feegow, token: e.target.value})}
                                placeholder="Cole aqui o conteúdo do cookie..."
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-mono text-xs text-slate-600"
                            />
                        </div>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-6 border border-slate-200 h-fit">
                        <div className="flex items-center gap-2 mb-4 text-slate-800">
                            <HelpCircle className="w-5 h-5 text-blue-600" />
                            <h3 className="font-semibold">Como obter o Cookie?</h3>
                        </div>
                        <div className="prose prose-sm text-slate-600">
                            <p className="mb-4">Para que o sistema consiga ler a fila da recepção, precisamos simular um acesso autenticado.</p>
                            <ol className="list-decimal pl-4 space-y-3">
                                <li>Acesse o painel <strong>core.feegow.com</strong> e faça login.</li>
                                <li>Abra as Ferramentas de Desenvolvedor (F12).</li>
                                <li>Vá na aba <strong>Network (Rede)</strong>.</li>
                                <li>No filtro, digite <code>get-queue</code>.</li>
                                <li>Na direita, procure <strong>Request Headers</strong> e encontre <strong>Cookie</strong>.</li>
                                <li><span className="bg-yellow-100 text-yellow-800 px-1 rounded font-bold">Importante:</span> Clique com o botão direito no valor &rarr; <strong>Copy value</strong>.</li>
                                <li>Cole no campo ao lado e clique em Salvar.</li>
                            </ol>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- ABA CLINIA (Simplificada: Apenas Cookie) --- */}
            <div className={activeTab === 'clinia' ? 'block' : 'hidden'}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                    
                    {/* Coluna Esquerda: Apenas Cookie */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                            <Cookie className="w-4 h-4 text-slate-400" />
                            <h3 className="font-semibold text-slate-700">Autenticação (Cookie de Sessão)</h3>
                        </div>

                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                            <div className="flex gap-3">
                                <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                                <div className="text-sm text-blue-800">
                                    Para o monitoramento da Clinia, precisamos apenas do cookie de sessão ativo. 
                                    Não é necessário informar usuário ou senha.
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Cookie Completo
                            </label>
                            <textarea 
                                rows={8}
                                value={clinia.token || ''}
                                onChange={(e) => setClinia({...clinia, token: e.target.value})}
                                placeholder="Cole aqui o conteúdo do cookie da Clinia..."
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-mono text-xs text-slate-600"
                            />
                        </div>
                    </div>

                    {/* Coluna Direita: Instruções Clinia */}
                    <div className="bg-slate-50 rounded-xl p-6 border border-slate-200 h-fit">
                        <div className="flex items-center gap-2 mb-4 text-slate-800">
                            <HelpCircle className="w-5 h-5 text-blue-600" />
                            <h3 className="font-semibold">Como obter o Cookie Clinia?</h3>
                        </div>
                        
                        <div className="prose prose-sm text-slate-600">
                            <p className="mb-4">
                                O processo é similar ao da Feegow:
                            </p>
                            <ol className="list-decimal pl-4 space-y-3">
                                <li>Acesse o <strong>painel da Clinia</strong> e faça login.</li>
                                <li>Abra as Ferramentas de Desenvolvedor (F12).</li>
                                <li>Vá na aba <strong>Network (Rede)</strong>.</li>
                                <li>Atualize a página (F5) e clique em qualquer requisição da lista.</li>
                                <li>Na direita, procure <strong>Request Headers</strong> e encontre <strong>Cookie</strong>.</li>
                                <li><span className="bg-yellow-100 text-yellow-800 px-1 rounded font-bold">Importante:</span> Clique com o botão direito no valor &rarr; <strong>Copy value</strong>.</li>
                                <li>Cole no campo ao lado e clique em Salvar.</li>
                            </ol>
                            <div className="mt-4 p-3 bg-white rounded border border-slate-200 text-xs text-slate-500 italic shadow-sm">
                                <Info className="w-3 h-3 inline mr-1 mb-0.5" />
                                Nota: A sessão da Clinia costuma expirar mais rápido. Se o monitor parar, atualize este cookie.
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </div>
      </div>
    </div>
  );
}