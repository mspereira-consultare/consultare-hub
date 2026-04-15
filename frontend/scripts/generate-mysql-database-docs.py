from __future__ import annotations
import json,re
from collections import Counter
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
DB=ROOT/'frontend'/'docs'/'database'
SCHEMA=DB/'mysql-schema-live.json'
EXT={'.py','.ts','.tsx','.js','.cjs','.mjs','.md','.sql','.prisma'}
IGN={'node_modules','.git','.next','dist','build'}
DOM={
 'admin':'Administracao, seguranca e governanca',
 'ops':'Operacao online, filas e checklists',
 'biz':'Comercial, agenda, faturamento, custos e repasses',
 'mkt':'Marketing, CRM, funil e analytics',
 'people':'Pessoas, profissionais, RH e contratos',
 'quality':'Qualidade, documentos regulatorios e equipamentos',
 'other':'Outros / legado',
}
LEGACY=[
 'frontend/docs/03-arquitetura-tecnica.md','frontend/docs/04-dicionario-de-dados.md','frontend/docs/07-plano-tecnico-repasses.md','frontend/docs/08-agenda-ocupacao.md','frontend/docs/09-plano-tecnico-marketing-funil.md','frontend/docs/10-plano-tecnico-colaboradores.md','frontend/docs/11-plano-tecnico-equipamentos.md','frontend/docs/13-plano-tecnico-vigilancia-sanitaria.md','frontend/docs/14-plano-tecnico-folha-pagamento.md']
PURPOSE={
 'system_status':'Heartbeat e estado operacional dos workers/orquestrador.','system_status_backup':'Backup auxiliar do heartbeat.','integrations_config':'Credenciais e configuracoes tecnicas de integracoes.','users':'Cadastro de usuarios do painel.','user_page_permissions':'Matriz persistida de permissao por usuario e pagina.','teams_master':'Cadastro mestre de equipes/setores.','user_teams':'Relacionamento entre usuarios/agendadores e equipes.','goals_config':'Configuracao de metas salvas no painel.',
 'feegow_appointments':'Base transacional de agendamentos importados da Feegow.','feegow_patients':'Cadastro de pacientes sincronizado a partir da Feegow.','feegow_patients_sync_state':'Estado tecnico da sincronizacao de pacientes Feegow.','feegow_procedures_catalog':'Catalogo de procedimentos importado da Feegow.','feegow_proposals':'Base operacional de propostas/comercial importadas da Feegow.','feegow_contracts':'Base de contratos/procedimentos/itens comerciais importados do Feegow.','feegow_patient_contacts_cache':'Cache local de contatos de pacientes Feegow.','feegow_repasse_consolidado':'Base consolidada de repasse por profissional/competencia.','feegow_repasse_a_conferir':'Base detalhada de linhas de repasse para conferencia.','feegow_appointments_backfill_checkpoint':'Checkpoint do backfill historico de agendamentos.',
 'faturamento_analitico':'Base analitica detalhada de faturamento/pagamentos do Feegow.','faturamento_resumo_diario':'Materializacao diaria de faturamento agregada.','faturamento_resumo_mensal':'Materializacao mensal de faturamento agregada.','faturamento_backfill_checkpoint':'Checkpoint do backfill historico de faturamento.','custo_analitico':'Base analitica detalhada de custos.','custo_resumo_diario':'Materializacao diaria de custos agregados.','custo_resumo_mensal':'Materializacao mensal de custos agregados.',
 'agenda_occupancy_daily':'Snapshot diario de ocupacao da agenda.','agenda_occupancy_jobs':'Controle dos jobs de ocupacao da agenda.','espera_medica':'Fila operacional em tempo real do atendimento medico.','recepcao_historico':'Historico operacional da fila/recepcao.','recepcao_checklist_daily':'Checklist diario/manual de recepcao.','recepcao_checklist_manual':'Lancamentos manuais complementares da recepcao.','crc_checklist_daily':'Checklist diario/manual do CRC.','monitor_medico_cycle_log':'Log de ciclos do monitor medico.','monitor_medico_event_log':'Log detalhado de eventos do monitor medico.','clinia_group_snapshots':'Snapshot operacional dos grupos/filas do Clinia.','clinia_chat_stats':'Metricas diarias de chat do Clinia.','clinia_appointment_stats':'Metricas diarias de agendamentos do Clinia.',
 'marketing_google_accounts':'Cadastro tecnico de contas Google Ads/GA4.','marketing_campaign_mapping':'Mapeamento/enriquecimento de campanhas de marketing.','marketing_funnel_jobs':'Controle dos jobs do funil de marketing.','marketing_funnel_job_items':'Itens detalhados dos jobs do funil.','raw_google_ads_campaign_daily':'Staging/raw diario de campanhas Google Ads.','raw_google_ads_campaign_device_daily':'Staging/raw diario de campanhas Google Ads por dispositivo.','raw_ga4_campaign_daily':'Staging/raw diario de campanhas GA4.','raw_ga4_channel_daily':'Staging/raw diario de canais GA4.','raw_ga4_landing_page_daily':'Staging/raw diario de landing pages GA4.','raw_clinia_ads_contacts':'Staging/raw de contatos de anuncios Clinia.','fact_marketing_funnel_daily':'Fato principal diario do funil de marketing.','fact_marketing_funnel_daily_channel':'Fato diario do funil por canal.','fact_marketing_funnel_daily_device':'Fato diario do funil por dispositivo.','fact_marketing_funnel_daily_landing_page':'Fato diario do funil por landing page.','clinia_ads_jobs':'Controle de execucao dos jobs de Clinia Ads.','clinia_ads_job_items':'Itens detalhados de jobs de Clinia Ads.','fact_clinia_ads_daily':'Fato diario de anuncios/leads Clinia Ads.','clinia_crm_boards':'Cadastro dos boards/pipelines do CRM Clinia.','clinia_crm_columns':'Cadastro das colunas/estagios do CRM Clinia.','clinia_crm_jobs':'Controle dos jobs do CRM Clinia.','clinia_crm_job_items':'Itens detalhados dos jobs do CRM Clinia.','clinia_crm_items_current':'Estado corrente dos cards/leads do CRM Clinia.','clinia_crm_item_snapshots':'Historico de snapshots dos cards/leads do CRM Clinia.','clinia_crm_funnel_mapping':'Mapeamento do funil do CRM Clinia.','fact_clinia_crm_pipeline_daily':'Fato diario do pipeline CRM Clinia.','fact_clinia_crm_lead_created_daily':'Fato diario de leads criados no CRM Clinia.',
 'employees':'Cadastro principal de colaboradores.','employee_documents':'Documentos ativos dos colaboradores.','employee_documents_inactive':'Historico de documentos inativos de colaboradores.','employee_uniform_items':'Controle de uniformes/EPIs por colaborador.','employee_locker_assignments':'Controle de armarios/chaves.','employee_recess_periods':'Cadastro de ferias/recessos/licencas.','employee_audit_log':'Auditoria das alteracoes no cadastro de colaboradores.','professionals':'Cadastro principal de profissionais/prestadores.','professional_registrations':'Registros profissionais (CRM, conselho, UF etc.).','professional_documents':'Documentos ativos dos profissionais.','professional_documents_inactive':'Historico de documentos inativos de profissionais.','professional_procedure_rates':'Valores/repasses por profissional x procedimento.','professional_document_checklist':'Checklist de documentos obrigatorios por profissional.','professional_contracts':'Historico e metadados de contratos de profissionais.','professional_audit_log':'Auditoria do cadastro de profissionais.','payroll_rules':'Regras parametrizadas da folha.','payroll_periods':'Competencias/peridos de fechamento da folha.','payroll_import_files':'Arquivos importados para processamento da folha.','payroll_point_daily':'Apontamento diario de ponto consolidado.','payroll_occurrences':'Ocorrencias/apontamentos da folha.','payroll_lines':'Linhas calculadas/importadas de folha.','payroll_reference_rows':'Linhas de referencia para conciliacao.','contract_templates':'Repositorio de modelos de contrato.','contract_template_audit_log':'Auditoria de alteracoes em modelos de contrato.',
 'qms_documents':'Cadastro mestre de documentos do sistema de qualidade.','qms_document_versions':'Versionamento formal dos documentos do QMS.','qms_document_files':'Arquivos/anexos das versoes de documentos QMS.','qms_document_training_links':'Vinculo entre documentos QMS e treinamentos.','qms_audit_log':'Auditoria tecnica das alteracoes no modulo QMS.','qms_audits':'Cadastro e acompanhamento de auditorias de qualidade.','qms_audit_actions':'Plano de acoes vinculado a auditorias QMS.','qms_training_plans':'Planos/programacoes de treinamento.','qms_trainings':'Execucao/registro de treinamentos.','qms_training_files':'Arquivos/anexos de treinamentos.','health_surveillance_licenses':'Cadastro de licencas e alvaras regulatorios.','health_surveillance_documents':'Documentos regulatorios de vigilancia sanitaria.','health_surveillance_document_licenses':'Relacionamento entre documentos e licencas regulatorias.','health_surveillance_files':'Arquivos anexos de vigilancia sanitaria.','clinic_equipment':'Cadastro mestre de equipamentos clinicos.','clinic_equipment_events':'Historico de eventos/manutencoes/calibracoes dos equipamentos.','clinic_equipment_files':'Arquivos vinculados aos equipamentos.',
 'proposal_followup_control':'Controle manual de follow-up comercial das propostas.','repasse_sync_jobs':'Controle dos jobs de sincronizacao de repasse.','repasse_sync_job_items':'Itens dos jobs de sincronizacao de repasse.','repasse_professional_notes':'Observacoes por profissional no modulo de repasses.','repasse_pdf_jobs':'Controle de jobs de geracao de PDF de repasse.','repasse_pdf_artifacts':'Artefatos/PDFs gerados para repasse.','repasse_consolidacao_jobs':'Controle dos jobs de consolidacao de repasse.','repasse_consolidacao_job_items':'Itens dos jobs de consolidacao de repasse.','repasse_consolidacao_notes':'Observacoes manuais na consolidacao de repasse.','repasse_fechamento_manual':'Fechamentos/confirmacoes manuais de repasse.','repasse_consolidacao_line_marks':'Marcacoes/flags manuais por linha de repasse.','repasse_consolidacao_mark_legends':'Legenda/catalogo das marcacoes de repasse.'}

COL={
 'id':'Identificador primario do registro.','created_at':'Data/hora de criacao do registro no painel.','updated_at':'Data/hora da ultima atualizacao local do registro.','deleted_at':'Data/hora de exclusao logica.','status':'Status operacional/negocial atual do registro.','details':'Detalhes adicionais, mensagem de erro ou contexto operacional.','payload_json':'Payload bruto ou quase bruto em JSON para auditoria/reprocessamento.','service_name':'Nome logico do servico, worker ou rotina monitorada.','service':'Nome da integracao/servico relacionado ao registro.','unit_id':'Identificador da unidade na origem ou no dominio de negocio.','unit_name':'Nome da unidade exibido/normalizado para consumo no painel.','name':'Nome principal do registro.','description':'Descricao textual do registro.','notes':'Observacoes livres registradas pelo processo ou pelo usuario.','observation':'Observacao operacional/manual do registro.','email':'Endereco de e-mail associado ao registro.','file_name':'Nome original ou amigavel do arquivo.','file_url':'URL de acesso ao arquivo.','file_path':'Caminho/chave logica do arquivo no storage.','mime_type':'Tipo MIME do arquivo armazenado.','content_type':'Tipo de conteudo do arquivo/artefato.','checksum':'Hash/checksum para validacao de integridade.','source':'Origem declarada do dado ou do evento.','source_file_name':'Nome do arquivo de origem importado.','source_system':'Sistema de origem do dado.','period_ref':'Competencia ou periodo de referencia do registro.','data_ref':'Data de referencia usada para agregacao ou competencia.','month_ref':'Mes/competencia de referencia.','date':'Data principal do evento/medicao.','last_run':'Data/hora da ultima execucao conhecida da rotina.','job_id':'Identificador do job/processamento ao qual a linha pertence.','user_id':'Identificador do usuario relacionado ao registro.','team_id':'Identificador da equipe relacionada ao registro.','employee_id':'Identificador do colaborador relacionado ao registro.','professional_id':'Identificador do profissional relacionado ao registro.','document_id':'Identificador do documento relacionado ao registro.','training_id':'Identificador do treinamento relacionado ao registro.','plan_id':'Identificador do plano relacionado ao registro.','audit_id':'Identificador da auditoria relacionada ao registro.','license_id':'Identificador da licenca relacionada ao registro.','template_id':'Identificador do modelo relacionado ao registro.','equipment_id':'Identificador do equipamento relacionado ao registro.','version_id':'Identificador da versao relacionada ao registro.','board_id':'Identificador do board/pipeline no CRM Clinia.','column_id':'Identificador da coluna/estagio no CRM Clinia.','item_id':'Identificador do item/card da origem.','patient_id':'Identificador do paciente na origem transacional.','appointment_id':'Identificador do agendamento na origem transacional.','procedure_id':'Identificador do procedimento na origem.','procedure_name':'Nome do procedimento associado ao registro.','procedure_group':'Grupo/categoria do procedimento para analise gerencial.','professional_name':'Nome do profissional exibido/normalizado para consumo no painel.','scheduled_at':'Data/hora em que o agendamento/evento foi criado na origem.','requested_at':'Data/hora da solicitacao do processo ou artefato.','processed_at':'Data/hora de processamento efetivo do registro.','completed_at':'Data/hora de conclusao do processamento.','error_message':'Mensagem de erro registrada durante processamento.','token':'Token de autenticacao ou integracao persistido para uso tecnico.','cookies':'Cookies/sessao persistidos para integracoes web.','username':'Usuario/login tecnico ou de negocio relacionado ao registro.','password':'Credencial/senha persistida para integracao ou autenticacao.','role':'Papel/perfil atribuido ao registro.','active':'Indicador logico de atividade do registro.','is_active':'Indicador logico de atividade do registro.','sort_order':'Ordem relativa de exibicao/processamento.','color':'Cor de apoio visual associada ao registro.'}

def files():
    for p in ROOT.rglob('*'):
        if p.is_file() and p.suffix.lower() in EXT and not any(x in IGN for x in p.parts):
            yield p

def rel(p:Path)->str:return p.relative_to(ROOT).as_posix()
def data():return json.loads(SCHEMA.read_text(encoding='utf-8'))
def pk(t):
    r=[c for c in t['constraints'] if c.get('type')=='PRIMARY KEY' and c.get('column_name')]
    r.sort(key=lambda x:x.get('ordinal_position') or 0)
    return [x['column_name'] for x in r]
def idxs(t):
    m={}
    for i in t['indexes']:
        n=i.get('name')
        if not n:continue
        m.setdefault(n,{'name':n,'non_unique':i.get('non_unique',True),'columns':[]})['columns'].append((i.get('seq_in_index') or 0,i.get('column_name')))
    out=[]
    for v in m.values():
        v['columns']=[c for _,c in sorted(v['columns']) if c]
        out.append(v)
    return sorted(out,key=lambda x:x['name'])
def keyf(c,pkset):
    f=[]
    if c['name'] in pkset:f.append('PK')
    if c.get('column_key')=='UNI':f.append('UNQ')
    elif c.get('column_key')=='MUL':f.append('IDX')
    return ', '.join(f) if f else '-'
def dflt(v):
    if v is None:return '-'
    if v=='':return "''"
    return str(v).replace('\n',' ')
def pretty(s:str)->str:
    s=s.replace('_',' ').strip()
    mp={'id':'identificador','ref':'referencia','dt':'data/hora','qty':'quantidade','pct':'percentual','url':'URL','crm':'CRM','qms':'QMS','ga4':'GA4','ads':'Ads','pdf':'PDF'}
    return ' '.join(mp.get(x,x) for x in s.split()) or 'registro'
def cdesc(t,c):
    if c in COL:return COL[c]
    if c.endswith('_id'):return f'Identificador de {pretty(c[:-3])} usado para relacionar ou localizar o registro na origem/aplicacao.'
    if c.endswith('_at'):return f'Data/hora referente a {pretty(c[:-3])}.'
    if c.startswith('dt_'):return f'Data/hora de {pretty(c[3:])}.'
    if c.endswith('_date'):return f'Data de {pretty(c[:-5])}.'
    if c.endswith('_name'):return f'Nome de {pretty(c[:-5])} utilizado para exibicao, filtro ou agrupamento.'
    if c.endswith('_code'):return f'Codigo de {pretty(c[:-5])} na origem ou em regra de negocio.'
    if c.endswith('_json'):return f'Conteudo estruturado em JSON relacionado a {pretty(c[:-5])}.'
    if c.startswith('is_') or c.endswith('_flag'):return f'Indicador logico relacionado a {pretty(c.replace("is_","").replace("_flag",""))}.'
    if any(x in c for x in ['count','total','qty','quantity']):return f'Quantidade/contagem referente a {pretty(c)}.'
    if any(x in c for x in ['amount','value','cost','revenue','price','salary','discount']):return f'Valor monetario ou numerico referente a {pretty(c)}.'
    if any(x in c for x in ['rate','percent','pct']):return f'Percentual/taxa referente a {pretty(c)}.'
    if any(x in c for x in ['status','stage','phase']):return f'Status/etapa de {pretty(c)}.'
    return f'Campo do dominio `{t}` referente a {pretty(c)}.'

def domain(name,w):
    if name in {'users','user_page_permissions','teams_master','user_teams','system_status','system_status_backup','integrations_config','goals_config'}:return 'admin'
    if name.startswith(('clinia_','agenda_','recepcao_','monitor_','espera_','crc_')):
        return 'mkt' if name.startswith(('clinia_crm_','fact_clinia_crm_','fact_clinia_ads_','raw_clinia_ads_')) else 'ops'
    if name.startswith(('feegow_','faturamento_','custo_','proposal_','repasse_')):return 'biz'
    if name.startswith(('marketing_','raw_','fact_marketing_')):return 'mkt'
    if name.startswith(('employee_','employees','professional_','professionals','payroll_','contract_')):return 'people'
    if name.startswith(('qms_','health_','clinic_equipment')):return 'quality'
    if w:
        if 'repasses' in w:return 'biz'
        if any(x in w for x in ['marketing','clinia_ads','clinia_crm']):return 'mkt'
        if any(x in w for x in ['colaboradores','profissionais','payroll','contract_templates']):return 'people'
        if any(x in w for x in ['vigilancia_sanitaria','equipamentos','qms']):return 'quality'
    return 'other'

def search(names):
    rx=re.compile(r'(?<![A-Za-z0-9_])('+'|'.join(sorted((re.escape(n) for n in names),key=len,reverse=True))+r')(?![A-Za-z0-9_])')
    out={n:{'create':[],'all':[],'docs':[]} for n in names}
    for p in files():
        txt=p.read_text(encoding='utf-8',errors='ignore'); rp=rel(p); ms=sorted(set(rx.findall(txt)))
        if not ms:continue
        for n in ms:
            out[n]['all'].append(rp)
            if rp.startswith('frontend/docs/'):out[n]['docs'].append(rp)
            if re.search(r'CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+[`\"]?'+re.escape(n)+r'([`\"]|\s|\()',txt,re.I):out[n]['create'].append(rp)
    return out

def prio(p):
    if p.startswith('workers/'):return (0,len(p),p)
    if '/repository.' in p or p.endswith('/repository.ts') or p.endswith('_repository.ts'):return (1,len(p),p)
    if p.startswith('frontend/src/lib/'):return (2,len(p),p)
    if p.startswith('frontend/src/app/api/'):return (3,len(p),p)
    if p.startswith('frontend/scripts/'):return (4,len(p),p)
    if p.startswith('frontend/docs/'):return (6,len(p),p)
    return (9,len(p),p)

def writer(r):
    if r['create']:return sorted(r['create'],key=prio)[0]
    code=[h for h in r['all'] if h.endswith(('.py','.ts','.tsx','.js','.cjs','.mjs','.prisma'))]
    if code:return sorted(code,key=prio)[0]
    return r['all'][0] if r['all'] else None

def origin(w,n):
    if not w:return 'Origem nao confirmada em codigo local; revisar historico/migracoes.'
    if 'worker_feegow_' in w or n.startswith('feegow_') or n.startswith('faturamento_'):
        if 'appointments' in w:return 'Feegow API de agendamentos.'
        if 'patients' in w:return 'Feegow API de pacientes.'
        if 'procedures' in w:return 'Feegow API/catalogo de procedimentos.'
        if 'contracts' in w:return 'Feegow web/API no fluxo de contratos.'
        if 'proposals' in w:return 'Feegow API/modulo comercial.'
        if 'repasse' in w:return 'Dados Feegow/web usados na apuracao de repasses.'
        if 'faturamento' in w:return 'Scraping/fluxo web Feegow de faturamento.'
        return 'Integracao Feegow.'
    if 'worker_clinia_ads' in w or n.startswith(('raw_clinia_ads_','fact_clinia_ads_','clinia_ads_')):return 'Clinia Ads / endpoints analiticos da Clinia.'
    if 'worker_clinia_crm' in w or n.startswith(('clinia_crm_','fact_clinia_crm_')):return 'CRM Clinia.'
    if 'worker_clinia' in w or n.startswith('clinia_'):return 'Clinia (filas, grupos e estatisticas operacionais).'
    if 'worker_marketing_funnel_google' in w or n.startswith(('marketing_','raw_ga4_','raw_google_ads_','fact_marketing_')):return 'Google Ads, GA4 e mapeamentos de marketing.'
    if 'agenda_ocupacao' in w or n.startswith('agenda_'):return 'Agenda/ocupacao operacional importada para o painel.'
    if 'checklist' in w or n.startswith(('crc_','recepcao_checklist_')):return 'Lancamento manual no painel para checklist operacional.'
    if any(x in w for x in ['colaboradores','payroll']):return 'Cadastro/manual do painel de RH/DP e importacoes de folha.'
    if 'profissionais' in w:return 'Cadastro/manual do painel de profissionais e sincronizacoes auxiliares.'
    if 'vigilancia_sanitaria' in w:return 'Cadastro/manual do painel de vigilancia sanitaria.'
    if 'equipamentos' in w:return 'Cadastro/manual do painel de equipamentos.'
    if 'qms' in w:return 'Cadastro/manual do modulo de qualidade e treinamentos.'
    if 'contract_templates' in w:return 'Cadastro/manual de modelos de contrato no painel.'
    if 'permissions' in w or n=='user_page_permissions':return 'Configuracao manual de permissoes no painel.'
    if n in {'users','teams_master','user_teams','goals_config','integrations_config','system_status'}:return 'Configuracao e operacao interna do painel.'
    return 'Origem mista no painel/aplicacao; validar modulo escritor principal.'

def writeproc(w):
    if not w:return 'Processo de escrita nao identificado automaticamente.'
    if w.startswith('workers/'):return f'Escrita principal realizada por worker/rotina em `{w}`.'
    if w.startswith('frontend/src/lib/'):return f'Escrita principal realizada por repository/servico server-side em `{w}`.'
    if w.startswith('frontend/src/app/api/'):return f'Escrita principal garantida por rota API em `{w}`.'
    if w.startswith('frontend/scripts/'):return f'Escrita/garantia de schema em script `{w}`.'
    return f'Evidencia principal localizada em `{w}`.'

def rels(t,mp):
    cols={c['name'] for c in t['columns']}; n=t['name']; out=[]; seen=set()
    def add(l,tt,tc,k,obs):
        if tt not in mp:return
        key=(l,tt,tc)
        if key in seen:return
        seen.add(key); out.append([l,tt,tc,k,obs])
    if 'user_id' in cols and n!='users':add('user_id','users','id','Vinculo logico','Relacionamento esperado por identificador de usuario.')
    if 'team_id' in cols and n!='teams_master':add('team_id','teams_master','id','Vinculo logico','Relacionamento esperado por identificador de equipe.')
    if 'employee_id' in cols and n!='employees':add('employee_id','employees','id','Vinculo logico','Relacionamento esperado por identificador de colaborador.')
    if 'professional_id' in cols and n!='professionals':add('professional_id','professionals','id','Vinculo logico','Relacionamento esperado por identificador de profissional.')
    if 'patient_id' in cols and n!='feegow_patients':add('patient_id','feegow_patients','patient_id','Vinculo logico','Ligacao por paciente na Feegow.')
    if 'appointment_id' in cols and n!='feegow_appointments':add('appointment_id','feegow_appointments','appointment_id','Vinculo logico','Ligacao por agendamento Feegow.')
    if 'board_id' in cols and n!='clinia_crm_boards':add('board_id','clinia_crm_boards','board_id','Vinculo logico','Ligacao por board/pipeline do CRM Clinia.')
    if 'column_id' in cols and n!='clinia_crm_columns':add('column_id','clinia_crm_columns','column_id','Vinculo logico','Ligacao por coluna/estagio do CRM Clinia.')
    if 'item_id' in cols and n!='clinia_crm_items_current' and n.startswith(('clinia_crm_','fact_clinia_crm_')):add('item_id','clinia_crm_items_current','item_id','Vinculo logico','Ligacao por item/card do CRM Clinia.')
    if 'document_id' in cols:
        if n.startswith('qms_') and n!='qms_documents':add('document_id','qms_documents','id','Vinculo logico','Ligacao por documento do modulo QMS.')
        if n.startswith('health_surveillance_') and n!='health_surveillance_documents':add('document_id','health_surveillance_documents','id','Vinculo logico','Ligacao por documento regulatorio.')
    if 'license_id' in cols and n!='health_surveillance_licenses':add('license_id','health_surveillance_licenses','id','Vinculo logico','Ligacao por licenca regulatoria.')
    if 'version_id' in cols and n!='qms_document_versions':add('version_id','qms_document_versions','id','Vinculo logico','Ligacao por versao do documento.')
    if 'training_id' in cols and n!='qms_trainings':add('training_id','qms_trainings','id','Vinculo logico','Ligacao por treinamento.')
    if 'plan_id' in cols and n!='qms_training_plans':add('plan_id','qms_training_plans','id','Vinculo logico','Ligacao por plano de treinamento.')
    if 'audit_id' in cols and n!='qms_audits':add('audit_id','qms_audits','id','Vinculo logico','Ligacao por auditoria.')
    if 'template_id' in cols and n!='contract_templates':add('template_id','contract_templates','id','Vinculo logico','Ligacao por modelo de contrato.')
    if 'equipment_id' in cols and n!='clinic_equipment':add('equipment_id','clinic_equipment','id','Vinculo logico','Ligacao por equipamento.')
    if 'job_id' in cols:
        cand=n.replace('_job_items','_jobs') if n.endswith('_job_items') else ('repasse_pdf_jobs' if n.endswith('_pdf_artifacts') else None)
        if cand and cand in mp:add('job_id',cand,pk(mp[cand])[0] if pk(mp[cand]) else 'job_id','Vinculo logico','Ligacao entre item/artefato e o job pai.')
    if n=='user_teams' and 'user_name' in cols:add('user_name','users','name','Vinculo logico','Associacao por nome do usuario/agendador; nao ha FK fisica.')
    if n=='proposal_followup_control' and 'proposal_id' in cols:add('proposal_id','feegow_proposals','id','Vinculo logico','Controle manual complementar da proposta comercial.')
    if n=='professional_procedure_rates' and 'procedure_code' in cols:add('procedure_code','feegow_procedures_catalog','codigo','Vinculo logico','Associacao por codigo/nome de procedimento catalogado.')
    return sorted(out,key=lambda x:(x[1],x[0]))

def mdtab(lines,hdr,rows):
    lines.append('| '+' | '.join(hdr)+' |'); lines.append('| '+' | '.join(['---']*len(hdr))+' |')
    for r in rows: lines.append('| '+' | '.join(str(x).replace('\n',' ').replace('|','\\|') for x in r)+' |')

def main():
    s=data(); DB.mkdir(parents=True,exist_ok=True); ts=s['tables']; mp={t['name']:t for t in ts}; refs=search([t['name'] for t in ts]); items=[]; relrows=[]; dc=Counter(); no_pk=[]; no_idx=[]
    for t in ts:
        r=refs[t['name']]; w=writer(r); d=domain(t['name'],w); rp=rels(t,mp); ix=idxs(t); pks=pk(t)
        if not pks:no_pk.append(t['name'])
        if not ix:no_idx.append(t['name'])
        dc[d]+=1
        for rr in rp: relrows.append([t['name']]+rr)
        items.append({'t':t,'w':w,'d':d,'p':PURPOSE.get(t['name'],'Tabela operacional/tecnica identificada no schema MySQL.'),'o':origin(w,t['name']),'wp':writeproc(w),'r':rp,'ix':ix,'pk':pks,'docs':r['docs'],'create':r['create']})
    items.sort(key=lambda x:(x['d'],x['t']['name']))
    now=datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
    lines=['# Base de Documentacao do MySQL','','Esta pasta consolida a documentacao do banco MySQL efetivamente em uso pelo painel da Consultare.','','## Escopo','',f"- Schema extraido diretamente do banco MySQL em `{s['database_name']}`.",f"- Versao do servidor reportada em `information_schema`: `{s['mysql_version']}`.",f"- Extracao/geracao desta base: `{now}`.",f"- Total de tabelas encontradas: `{s['table_count']}`.",'- Total de relacionamentos fisicos (FK) encontrados: `0`.','','## Arquivos desta base','','1. `database/README.md`','   Indice desta base dedicada e achados principais do schema.','2. `database/01-visao-geral-do-schema-mysql.md`','   Inventario executivo do schema, dominios, fontes reaproveitadas e riscos estruturais.','3. `database/02-relacionamentos-logicos-mysql.md`','   Mapa consolidado de relacionamentos fisicos e logicos inferidos do schema/codigo.','4. `database/03-dicionario-de-dados-mysql.md`','   Dicionario completo de tabelas e colunas do MySQL vivo.','5. `database/mysql-schema-live.json`','   Extracao estruturada do `information_schema` usada como base para estes documentos.','','## Fontes reaproveitadas/migradas','']
    lines += [f'- `{x}`' for x in LEGACY]
    lines += ['','## Achados principais','','- O schema vivo possui `116` tabelas.','- Nao ha `FOREIGN KEY` fisica declarada no banco em `information_schema`; os vinculos atuais sao majoritariamente logicos e mantidos pela aplicacao.',f"- Tabelas sem chave primaria detectada: `{', '.join(no_pk)}`.",f"- Tabelas sem indice detectado: `{', '.join(no_idx)}`.",'','## Distribuicao por dominio','']
    mdtab(lines,['Dominio','Descricao','Qtd. de tabelas'],[[k,DOM[k],dc.get(k,0)] for k in DOM]); lines.append(''); (DB/'README.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    ov=['# Visao Geral do Schema MySQL','','## Metodologia','','- Estrutura de tabelas, colunas, constraints e indices extraida diretamente de `information_schema` do MySQL em producao/uso atual.','- Origem da informacao e responsavel tecnico inferidos do codigo local (`workers/`, `frontend/src/lib/`, `frontend/src/app/api/` e scripts) e cruzados com a documentacao existente do projeto.','- Descricoes de colunas foram consolidadas a partir do nome do campo, contexto do modulo e referencias documentais existentes. Onde o MySQL nao possui `column_comment`, a descricao e interpretativa e deve ser refinada quando houver regra de negocio adicional.','','## Resumo executivo','',f"- Banco consultado: `{s['database_name']}`.",f"- Versao: `{s['mysql_version']}`.",f"- Tabelas encontradas: `{s['table_count']}`.",f"- Tabelas sem PK: `{len(no_pk)}`.",'- Tabelas sem FK fisica: `116` (nenhuma tabela possui FK fisica declarada).',f"- Tabelas sem indice: `{len(no_idx)}`.",'','## Inventario por dominio','']
    for k,v in DOM.items():
        subset=[i for i in items if i['d']==k]
        if not subset:continue
        ov += [f'### {v}','']
        mdtab(ov,['Tabela','Finalidade','Origem','Escrita principal','PK'],[[i['t']['name'],i['p'],i['o'],i['w'] or '-',', '.join(i['pk']) if i['pk'] else 'Sem PK declarada'] for i in subset]); ov.append('')
    ov += ['## Lacunas estruturais observadas no schema vivo','','### Tabelas sem chave primaria declarada','']+[f'- `{x}`' for x in no_pk]+['','### Tabelas sem indice','']+[f'- `{x}`' for x in no_idx]+['','### Observacao sobre relacionamentos','','- O banco nao materializa FKs fisicas em `information_schema` para os dominios documentados.','- Isso significa que integridade referencial esta sendo garantida principalmente pelo codigo da aplicacao, pelos jobs/workers e por convencoes de chave.','- O documento `02-relacionamentos-logicos-mysql.md` registra os vinculos logicos inferidos e deve ser tratado como a referencia atual de navegacao entre tabelas.','']
    (DB/'01-visao-geral-do-schema-mysql.md').write_text('\n'.join(ov)+'\n',encoding='utf-8')
    rl=['# Relacionamentos Logicos do MySQL','','## Premissas','','- Nenhuma `FOREIGN KEY` fisica foi encontrada no schema vivo extraido do MySQL.','- Os relacionamentos abaixo combinam vinculos logicos inferidos de nomes de colunas, jobs e repositories do projeto.','- Em caso de divergencia entre dado real e inferencia, prevalece o uso observado no codigo do modulo.','','## Mapa consolidado','']
    mdtab(rl,['Tabela origem','Coluna origem','Tabela destino','Coluna destino','Tipo','Observacao'],relrows); rl.append(''); (DB/'02-relacionamentos-logicos-mysql.md').write_text('\n'.join(rl)+'\n',encoding='utf-8')
    dd=['# Dicionario de Dados do MySQL','','Documento consolidado de tabelas e colunas do MySQL vivo do painel Consultare.','','## Leitura recomendada','','- Use `01-visao-geral-do-schema-mysql.md` para navegacao executiva e por dominio.','- Use `02-relacionamentos-logicos-mysql.md` para identificar vinculos entre tabelas.','- Use este arquivo para consulta detalhada de colunas, tipos, chaves, defaults e evidencias de origem.','']
    for k,v in DOM.items():
        subset=[i for i in items if i['d']==k]
        if not subset:continue
        dd += [f'## {v}','']
        for i in subset:
            t=i['t']; pkset=set(i['pk']); dd += [f"### `{t['name']}`",'',f"- Finalidade: {i['p']}",f"- Origem da informacao: {i['o']}",f"- Escrita/manutencao tecnica: {i['wp']}",f"- Tabela/engine: `{t.get('engine') or '-'}`",f"- Colacao: `{t.get('collation') or '-'}`",f"- Linhas estimadas pelo MySQL: `{t.get('estimated_rows')}`",f"- Chave primaria: `{', '.join(i['pk'])}`" if i['pk'] else '- Chave primaria: nao declarada no schema vivo',f"- Indices: {'; '.join([f'{x['name']} ({', '.join(x['columns'])})'+(' [UNQ]' if not x['non_unique'] else '') for x in i['ix']])}" if i['ix'] else '- Indices: nenhum indice identificado em `information_schema.statistics`',f"- Vinculos principais: {'; '.join([f'{x[0]} -> {x[1]}.{x[2]} ({x[3].lower()})' for x in i['r']])}" if i['r'] else '- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.']
            if i['create']: dd.append(f"- Evidencia de criacao/garantia de schema: `{i['create'][0]}`")
            if i['docs']: dd.append(f"- Evidencias documentais: `{', '.join(i['docs'][:4])}`")
            dd += ['']
            mdtab(dd,['Coluna','Tipo','Nulo','Chave','Default','Descricao'],[[c['name'],c.get('column_type') or c.get('data_type') or '-','Sim' if c.get('is_nullable') else 'Nao',keyf(c,pkset),dflt(c.get('default')),cdesc(t['name'],c['name'])] for c in t['columns']])
            dd += ['','---','']
    (DB/'03-dicionario-de-dados-mysql.md').write_text('\n'.join(dd)+'\n',encoding='utf-8')

if __name__=='__main__':main()
