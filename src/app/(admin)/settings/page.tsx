"use client";

import React, { useState, useEffect } from 'react';
import { 
  Save, Server, Lock, Eye, EyeOff, HelpCircle, 
  CheckCircle, Key, Loader2, Info, AlertTriangle, Copy
} from 'lucide-react';

interface IntegrationConfig {
    service: string;
    username: string;
    password?: string;
    token?: string; // Cookie ou Token API
    unit_id?: string;
    is_configured?: boolean;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Estados dos formulários
  const [feegow, setFeegow] = useState<IntegrationConfig>({ service: 'feegow', username: '', unit_id: '' });
  const [clinia, setClinia] = useState<IntegrationConfig>({ service: 'clinia', username: '' });
  
  // Controle visual
  const [showPassFeegow, setShowPassFeegow] = useState(false);
  const [showPassClinia, setShowPassClinia] = useState(false);
  const [activeTab, setActiveTab] = useState<'feegow' | 'clinia'>('feegow');

  // Carregar dados
  useEffect(() => {
    fetch('/api/admin/settings')
        .then(res => res.json())
        .then(data => {
            if (Array.isArray(data)) {
                const f = data.find(d => d.service === 'feegow');
                const c = data.find(d => d.service === 'clinia');
                if (f) setFeegow(f);
                if (c) setClinia(c);
            }
        })
        .finally(() => setLoading(false));
  }, []);

  const handleSave = async (service: 'feegow' | 'clinia') => {
    setSaving(true);
    const payload = service === 'feegow' ? feegow : clinia;
    
    try {
        const res = await fetch('/api/admin/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            alert(`Configurações do ${service === 'feegow' ? 'Feegow' : 'Clinia'} salvas com sucesso!`);
            window.location.reload(); 
        } else {
            alert('Erro ao salvar configurações.');
        }
    } catch (e) {
        console.error(e);
        alert('Erro de conexão com o servidor.');
    } finally {
        setSaving(false);
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-blue-600" size={40}/></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-6">
      
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#053F74]">Integrações & Credenciais</h1>
        <p className="text-slate-500 text-sm">Configure o acesso aos sistemas externos para a coleta automática de dados.</p>
      </div>

      {/* Navegação de Abas */}
      <div className="flex gap-4 border-b border-slate-200">
        <button 
            onClick={() => setActiveTab('feegow')}
            className={`pb-3 px-4 text-sm font-medium flex items-center gap-2 transition-all border-b-2 ${
                activeTab === 'feegow' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
        >
            <div className="w-6 h-6 rounded bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">FG</div>
            Feegow Clinic
            {feegow.is_configured && <CheckCircle size={14} className="text-green-500"/>}
        </button>
        <button 
            onClick={() => setActiveTab('clinia')}
            className={`pb-3 px-4 text-sm font-medium flex items-center gap-2 transition-all border-b-2 ${
                activeTab === 'clinia' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
        >
            <div className="w-6 h-6 rounded bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">CL</div>
            Clinia (Zap)
            {clinia.is_configured && <CheckCircle size={14} className="text-green-500"/>}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* COLUNA ESQUERDA: Formulário */}
        <div className="lg:col-span-2 space-y-6">
            
            {/* --- FORMULÁRIO FEEGOW --- */}
            {activeTab === 'feegow' && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 animate-in fade-in slide-in-from-left-4">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-lg font-bold text-slate-800">Credenciais de Acesso</h2>
                        <div className="bg-blue-50 text-blue-700 text-xs px-3 py-1 rounded-full font-medium border border-blue-100">
                            Integração Híbrida (API + Scraping)
                        </div>
                    </div>

                    <div className="space-y-5">
                        <div className="p-4 bg-blue-50/50 rounded-lg border border-blue-100 text-sm text-blue-800 flex gap-3">
                            <Info size={20} className="shrink-0 mt-0.5" />
                            <div>
                                <p className="font-bold">Login Automático</p>
                                <p className="text-blue-600/80">O sistema usará o login e senha abaixo para tentar acessar o Feegow automaticamente e monitorar a fila de médicos.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
                                <input 
                                    type="text" 
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="example@consultare.com.br"
                                    value={feegow.username || ''}
                                    onChange={e => setFeegow({...feegow, username: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">ID da Unidade Padrão</label>
                                <input 
                                    type="text" 
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Ex: 145"
                                    value={feegow.unit_id || ''}
                                    onChange={e => setFeegow({...feegow, unit_id: e.target.value})}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Senha</label>
                            <div className="relative">
                                <input 
                                    type={showPassFeegow ? "text" : "password"}
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none pr-10"
                                    placeholder={feegow.is_configured ? "******** (Senha Salva)" : "Digite a senha do Feegow"}
                                    value={feegow.password || ''}
                                    onChange={e => setFeegow({...feegow, password: e.target.value})}
                                />
                                <button type="button" onClick={() => setShowPassFeegow(!showPassFeegow)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600">
                                    {showPassFeegow ? <EyeOff size={18}/> : <Eye size={18}/>}
                                </button>
                            </div>
                        </div>

                        {/* Fallback Token */}
                        <div className="pt-6 border-t border-slate-100">
                            <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
                                <Key size={16} className="text-amber-500"/>
                                Cookie de Sessão (Fallback)
                            </h3>
                            <p className="text-xs text-slate-500 mb-3">
                                Obrigatório para relatórios avançados (Recepção Core) ou se o login automático falhar.
                            </p>
                            <textarea 
                                className="w-full p-3 border border-slate-300 rounded-lg text-xs font-mono text-slate-600 h-24 focus:ring-2 focus:ring-amber-500 outline-none"
                                placeholder="Cole aqui o cookie completo (ex: ASPSESSIONID=...; user=...)"
                                value={feegow.token || ''}
                                onChange={e => setFeegow({...feegow, token: e.target.value})}
                            />
                        </div>

                        <div className="flex justify-end pt-4">
                            <button 
                                onClick={() => handleSave('feegow')}
                                disabled={saving}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-bold flex items-center gap-2 shadow-sm transition-all disabled:opacity-70"
                            >
                                {saving ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
                                Salvar Configurações Feegow
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- FORMULÁRIO CLINIA --- */}
            {activeTab === 'clinia' && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 animate-in fade-in slide-in-from-right-4">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-lg font-bold text-slate-800">Conexão Clinia</h2>
                        <div className="bg-purple-50 text-purple-700 text-xs px-3 py-1 rounded-full font-medium border border-purple-100">
                            API Privada (Requer Cookie)
                        </div>
                    </div>

                    <div className="space-y-5">
                         <div className="p-4 bg-amber-50 rounded-lg border border-amber-100 text-sm text-amber-800 flex gap-3">
                            <AlertTriangle size={20} className="shrink-0 mt-0.5" />
                            <div>
                                <p className="font-bold">Atenção: Login Automático Indisponível</p>
                                <p className="text-amber-700/80">O Clinia usa proteções que impedem o login direto via código. Você <strong>DEVE</strong> fornecer o Cookie de Sessão manualmente abaixo.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-60 pointer-events-none grayscale">
                             {/* Campos desativados para o futuro */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Email de Acesso</label>
                                <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg bg-slate-50" value={clinia.username || ''} readOnly placeholder="Futura implementação"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Senha</label>
                                <input type="password" className="w-full p-2.5 border border-slate-300 rounded-lg bg-slate-50" value="********" readOnly/>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-800 mb-1">
                                Cookie de Sessão (Obrigatório)
                            </label>
                             <textarea 
                                className="w-full p-3 border border-purple-200 rounded-lg text-xs font-mono text-slate-600 h-32 focus:ring-2 focus:ring-purple-500 outline-none bg-purple-50/30"
                                placeholder="Cole aqui todo o conteúdo do cabeçalho 'Cookie' da requisição..."
                                value={clinia.token || ''}
                                onChange={e => setClinia({...clinia, token: e.target.value})}
                            />
                            <p className="text-[10px] text-slate-500 mt-1 text-right">
                                Cole o valor bruto. Ex: <code>_hjSessionUser=...; __Secure-next-auth.session-token=...</code>
                            </p>
                        </div>

                        <div className="flex justify-end pt-4">
                            <button 
                                onClick={() => handleSave('clinia')}
                                disabled={saving}
                                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-lg font-bold flex items-center gap-2 shadow-sm transition-all disabled:opacity-70"
                            >
                                {saving ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
                                Salvar Token Clinia
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* COLUNA DIREITA: Tutorial */}
        <div className="space-y-6">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <HelpCircle size={18} className="text-blue-600"/>
                    Como obter o Cookie?
                </h3>
                
                <div className="text-sm text-slate-600 space-y-4">
                    <p>Como estamos usando uma conexão direta (API não-oficial), precisamos "fingir" que somos o seu navegador. Siga os passos:</p>

                    <ol className="list-decimal pl-4 space-y-3 marker:font-bold marker:text-slate-400">
                        <li>
                            Abra o sistema ({activeTab === 'feegow' ? 'Feegow' : 'Clinia Dashboard'}) no Google Chrome e faça login normalmente.
                        </li>
                        <li>
                            Aperte <strong>F12</strong> para abrir as Ferramentas de Desenvolvedor.
                        </li>
                        <li>
                            Vá na aba <strong>Network (Rede)</strong>.
                        </li>
                        <li>
                            Atualize a página (F5). Várias linhas aparecerão.
                        </li>
                        <li>
                            Clique no primeiro item da lista (geralmente tem o nome da página ou 'dashboard').
                        </li>
                        <li>
                            Na direita, procure a seção <strong>Request Headers</strong> e encontre a linha <strong>Cookie</strong>.
                        </li>
                        <li>
                            <span className="bg-yellow-100 text-yellow-800 px-1 rounded font-bold">Importante:</span> Clique com o botão direito no valor do Cookie &rarr; <strong>Copy value</strong>. Não selecione manualmente pois é muito longo!
                        </li>
                        <li>
                            Cole no campo ao lado e clique em Salvar.
                        </li>
                    </ol>

                    <div className="p-3 bg-slate-100 rounded text-xs text-slate-500 italic">
                        Nota: Se você sair (Logout) do sistema no navegador, este cookie será invalidado e o painel parará de atualizar. Mantenha a sessão ativa se possível.
                    </div>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
}