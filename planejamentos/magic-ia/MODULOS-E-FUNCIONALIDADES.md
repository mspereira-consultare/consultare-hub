# Modulos e Funcionalidades

Este documento traduz o que existe no `consultare-hub` para uma taxonomia comercial e tecnica do Magic IA.

Cada modulo abaixo deve ser tratado no novo SaaS como combinacao de:

- entitlement comercial;
- permissoes funcionais;
- escopo de dados;
- fonte de dados, que pode ser Magic Core ou Feegow Bridge;
- workers e integracoes associados.

## 1. Plataforma e Administracao

### Legado

Inclui:

- `/login`
- `/users`
- `/settings`
- `/ajuda`
- `/api/admin/users/*`
- `/api/admin/settings`
- `/api/admin/status`
- `/api/admin/refresh`

Funcionalidades:

- autenticacao por usuario/senha;
- sessao compartilhada entre painel e intranet;
- usuarios com roles globais;
- perfis de acesso e overrides por pagina;
- configuracao de integracoes tecnicas;
- status de workers;
- ajuda contextual.

Dados:

- `users`
- `user_page_permissions`
- `access_profiles`
- `access_profile_permissions`
- `user_access_profile_assignments`
- `access_permission_audit_log`
- `integrations_config`
- `system_status`

Magic IA:

- deve virar modulo de plataforma, sempre habilitado;
- deve separar IAM, tenant membership, perfis, grupos e data scopes;
- deve mover secrets para secret service por tenant;
- deve tratar `settings` como configuracao tenant-scoped, nao global;
- deve separar support/admin global de admin do tenant.

## 2. BI e Gestao

### Legado

Inclui:

- `/dashboard`
- `/dashboard-executivo`
- `/dashboard-executivo/tarefas`
- `/metas`
- `/metas/dashboard`
- `/produtividade`
- `/agenda-ocupacao`

Funcionalidades:

- visao geral de filas, faturamento, metas e projecoes;
- dashboard executivo com governanca propria;
- metas por KPI, periodo, unidade, equipe ou colaborador;
- produtividade e equipes;
- ocupacao de agenda por unidade e especialidade;
- Gantt executivo de tarefas.

Dados:

- `goals_config`
- `teams_master`
- `user_teams`
- `agenda_occupancy_daily`
- `agenda_occupancy_jobs`
- `feegow_appointments`
- `faturamento_resumo_diario`
- `faturamento_resumo_mensal`
- `system_status`
- tabelas `dashboard_executive_*`, quando presentes no banco atual;
- tabelas de tarefas e projetos.

Workers:

- `worker_agenda_ocupacao.py`
- `worker_feegow_appointments.py`
- workers de faturamento;
- agregacoes de tarefas.

Magic IA:

- deve nascer como camada analitica separada do OLTP;
- deve permitir dashboards por tenant, unidade, modulo e data scope;
- deve separar permissao de ver dashboard de escopo executivo de dados;
- deve permitir modo Feegow Bridge para clientes que usam Feegow;
- no Magic Core, agenda, metas e produtividade devem consumir entidades internas.

## 3. Comercial e Atendimento

### Legado

Inclui:

- `/propostas`
- `/propostas/pos-consulta`
- `/propostas/gerencial`
- `/agendamentos`
- `/checklist-crc`
- `/checklist-recepcao`
- `/monitor`
- APIs `/api/admin/propostas/*`
- APIs `/api/admin/agendamentos`
- APIs `/api/admin/checklist/*`
- APIs `/api/queue/*`

Funcionalidades:

- base operacional de propostas;
- follow-up manual por responsavel, conversao, observacao e retorno;
- leitura gerencial de propostas;
- pos-consulta;
- historico de agendamentos;
- checklists operacionais CRC e recepcao;
- monitor de filas medico, recepcao e WhatsApp/Clinia.

Dados:

- `feegow_proposals`
- `proposal_followup_control`
- `feegow_patient_contacts_cache`
- `feegow_appointments`
- `feegow_patients`
- `recepcao_checklist_daily`
- `recepcao_checklist_manual`
- `crc_checklist_daily`
- `espera_medica`
- `recepcao_historico`
- `clinia_group_snapshots`

Workers:

- `worker_proposals.py`
- `worker_feegow_appointments.py`
- `worker_feegow_patients.py`
- `monitor_medico.py`
- `monitor_recepcao.py`
- `worker_clinia.py`

Magic IA:

- deve virar modulo comercial/atendimento com CRM operacional proprio;
- propostas e follow-up devem ser Magic Core;
- Feegow Bridge deve hidratar propostas e agendamentos quando o tenant usar Feegow;
- pacientes, contatos, agenda e funil devem virar entidades nativas no objetivo final;
- checklists devem ser tenant-scoped e configuraveis por unidade.

## 4. Financeiro

### Legado

Inclui:

- `/financeiro`
- `/contratos`
- `/repasses`
- `/repasses/envios-fechamento`
- `/modelos-contrato`
- APIs `/api/admin/financial/*`
- APIs `/api/admin/contratos`
- APIs `/api/admin/repasses/*`
- APIs `/api/admin/contract-templates/*`
- webhook `/api/webhooks/mailersend/repasses`

Funcionalidades:

- faturamento por periodo, unidade, grupo e procedimento;
- comparativos de periodo;
- relatorio geral exportavel;
- contratos ResolveSaude;
- fechamento de repasses;
- consolidacao de repasses;
- geracao de PDFs;
- envio de fechamento por email;
- modelos de contrato com placeholders e auditoria.

Dados:

- `faturamento_analitico`
- `faturamento_resumo_diario`
- `faturamento_resumo_mensal`
- `custo_analitico`
- `custo_resumo_diario`
- `custo_resumo_mensal`
- `feegow_contracts`
- `feegow_repasse_consolidado`
- `feegow_repasse_a_conferir`
- `repasse_sync_jobs`
- `repasse_consolidacao_jobs`
- `repasse_professional_notes`
- `repasse_fechamento_manual`
- `repasse_pdf_jobs`
- `repasse_pdf_artifacts`
- tabelas de envios de email de repasse;
- `contract_templates`
- `contract_template_audit_log`

Workers:

- `worker_faturamento_scraping.py`
- `worker_faturamento_scraping_2025.py`
- `worker_contracts.py`
- `worker_repasse_consolidado.py`
- `worker_consolidacao_profissionais.py`
- `worker_repasse_email.py`

Magic IA:

- deve separar financeiro clinico, contratos, repasses e notificacoes;
- faturamento do Magic Core deve nascer de atendimentos/procedimentos internos;
- Feegow Bridge deve alimentar snapshots financeiros quando aplicavel;
- repasse deve virar motor proprio com regras por profissional, contrato e procedimento;
- emails transacionais devem ser tenant-scoped, com templates e remetentes por tenant.

## 5. Marketing

### Legado

Inclui:

- `/marketing/funil`
- `/marketing/controle`
- APIs `/api/admin/marketing/funil/*`
- APIs `/api/admin/marketing/controle/*`

Funcionalidades:

- funil de marketing com Google Ads, GA4, Clinia Ads, Feegow e faturamento;
- diagnostico de Google Ads;
- campanhas, canais, dispositivos e landing pages;
- controle semanal/mensal em MVP;
- exportacao XLSX no controle;
- blocos ainda em planejamento para reputacao e configuracoes especificas.

Dados:

- `marketing_google_accounts`
- `marketing_campaign_mapping`
- `marketing_funnel_jobs`
- `marketing_funnel_job_items`
- `raw_google_ads_campaign_daily`
- `raw_google_ads_campaign_device_daily`
- `raw_ga4_campaign_daily`
- `raw_ga4_channel_daily`
- `raw_ga4_landing_page_daily`
- `raw_clinia_ads_contacts`
- `fact_marketing_funnel_daily`
- `fact_marketing_funnel_daily_channel`
- `fact_marketing_funnel_daily_device`
- `fact_marketing_funnel_daily_landing_page`
- `clinia_ads_jobs`
- `clinia_ads_job_items`
- `fact_clinia_ads_daily`

Workers:

- `worker_marketing_funnel_google.py`
- `worker_clinia_ads.py`

Magic IA:

- deve nascer como modulo comercializavel separado;
- Google Ads, GA4, Meta Ads, Clinia e Feegow devem ser conectores por tenant;
- camada `raw_*` deve ser staging tenant-aware;
- camada `fact_*` deve ir para analytics serving;
- atribuicao campanha -> lead -> agendamento -> receita deve ser contrato nativo do Magic Core.

## 6. Pessoas e RH

### Legado

Inclui:

- `/colaboradores`
- `/folha-pagamento`
- `/recrutamento`
- `apps/portal-colaborador`
- APIs `/api/admin/colaboradores/*`
- APIs `/api/admin/folha-pagamento/*`
- APIs `/api/admin/recrutamento/*`
- APIs do portal colaborador.

Funcionalidades:

- cadastro e desligamento de colaboradores;
- documentos, ASO, uniformes, armarios e recessos;
- processos de admissao/desligamento;
- portal externo para envio de documentos;
- folha operacional por competencia;
- importacao de ponto em PDF;
- beneficios e previa XLSX;
- vagas, candidatos, funil de recrutamento, anexos e conversao para pre-admissao;
- triagem IA de recrutamento planejada/operacionalizada por worker.

Dados:

- `employees`
- `employee_documents`
- `employee_documents_inactive`
- `employee_uniform_items`
- `employee_locker_assignments`
- `employee_recess_periods`
- `employee_lifecycle_cases`
- `employee_lifecycle_tasks`
- `employee_audit_log`
- `employee_portal_invites`
- `employee_portal_sessions`
- `employee_portal_submissions`
- `employee_portal_submission_documents`
- `payroll_rules`
- `payroll_periods`
- `payroll_import_files`
- `payroll_point_daily`
- `payroll_occurrences`
- `payroll_lines`
- `payroll_reference_rows`
- `recruitment_jobs`
- `recruitment_candidates`
- `recruitment_candidate_files`
- `recruitment_candidate_history`

Workers:

- `worker_payroll_point_import.py`
- `payroll_parse_point_pdf.py`
- `worker_recruitment_ai.py`

Magic IA:

- deve nascer como modulo RH independente do Feegow;
- portal externo precisa ser tenant-aware desde o token;
- documentos devem usar storage particionado por tenant;
- folha V1 pode permanecer operacional, nao folha legal completa;
- recrutamento deve ser Magic Core, com Indeed como integracao opcional.

## 7. Operacao Clinica

### Legado

Inclui:

- `/profissionais`
- `/profissionais/mapas`
- `/agenda-ocupacao`
- `/equipamentos`
- `/equipamentos/os`
- partes de `/agendamentos`, `/financeiro`, `/repasses` e `/intranet/catalogo`.

Funcionalidades:

- cadastro de profissionais;
- registros, documentos e contratos de profissionais;
- procedimentos e valores por profissional;
- mapas de profissionais;
- equipamentos, calibracao, manutencao, eventos, anexos e ordens de servico;
- ocupacao de agenda por unidade/especialidade.

Dados:

- `professionals`
- `professional_registrations`
- `professional_documents`
- `professional_documents_inactive`
- `professional_procedure_rates`
- `professional_document_checklist`
- `professional_contracts`
- `professional_audit_log`
- `clinic_equipment`
- `clinic_equipment_events`
- `clinic_equipment_files`
- tabelas de ordens de servico de equipamento, quando habilitadas;
- `agenda_occupancy_daily`
- `feegow_procedures_catalog`

Workers:

- `worker_feegow_professionals_sync.py`
- `worker_feegow_procedures.py`
- `worker_agenda_ocupacao.py`

Magic IA:

- profissionais, procedimentos, agenda, unidades e equipamentos devem ser entidades nativas;
- Feegow Bridge pode importar catalogos e agenda durante transicao;
- equipamentos e manutencao ja podem nascer como Magic Core;
- mapas de profissionais devem virar visao operacional sobre cadastros internos.

## 8. Qualidade e Regulatorio

### Legado

Inclui:

- `/qualidade/documentos`
- `/qualidade/treinamentos`
- `/qualidade/auditorias`
- `/qualidade/vigilancia-sanitaria`
- APIs `/api/admin/qms/*`
- APIs `/api/admin/vigilancia-sanitaria/*`

Funcionalidades:

- documentos QMS, versoes, arquivos e treinamentos vinculados;
- auditorias e acoes corretivas;
- planos e realizacoes de treinamento;
- licencas e documentos regulatorios por unidade;
- anexos e vencimentos;
- exportacao XLSX.

Dados:

- `qms_documents`
- `qms_document_versions`
- `qms_document_files`
- `qms_document_training_links`
- `qms_audit_log`
- `qms_audits`
- `qms_audit_actions`
- `qms_training_plans`
- `qms_trainings`
- `qms_training_assignments`
- `qms_training_files`
- `health_surveillance_licenses`
- `health_surveillance_documents`
- `health_surveillance_document_licenses`
- `health_surveillance_files`

Magic IA:

- deve ser modulo Magic Core;
- documentos e treinamentos precisam de escopo por tenant, unidade, cargo e grupo;
- downloads precisam validar permissao e data scope;
- trilhas de auditoria devem ser append-only e tenant-aware.

## 9. Intranet

### Legado

Inclui:

- `apps/intranet`
- `/intranet` no painel;
- `/intranet/chatbot` no painel;
- APIs `/api/admin/intranet/*`;
- APIs publicas autenticadas da intranet.

Funcionalidades:

- portal institucional e operacional;
- paginas dinamicas por blocos;
- navegacao;
- noticias;
- FAQ;
- audiencias;
- escopos editoriais;
- catalogo de profissionais, servicos, consultas, exames e procedimentos;
- documentos QMS publicados;
- assets;
- busca;
- chatbot com conhecimento;
- chat interno;
- notificacoes;
- gestao editorial.

Dados:

- `intranet_pages`
- `intranet_page_revisions`
- `intranet_navigation_nodes`
- `intranet_news_posts`
- `intranet_faq_items`
- `intranet_audience_groups`
- `intranet_editorial_scopes`
- `intranet_assets`
- `intranet_catalog_items`
- `intranet_professional_profiles`
- `intranet_specialty_profiles`
- `intranet_qms_document_settings`
- `intranet_chat_*`
- tabelas de chatbot/conhecimento conforme repositorios do core.

Workers:

- `worker_intranet_knowledge.py`

Magic IA:

- pode ser modulo contratado de comunicacao interna;
- deve usar usuarios, grupos, cargos, unidades e data scope do tenant;
- chatbot precisa isolar corpus por tenant e modulo;
- conteudo editorial deve ter escopo de publicacao e audiencia tenant-aware.

## 10. Tarefas e Projetos

### Legado

Inclui:

- `/tarefas` na intranet;
- `/dashboard-executivo/tarefas` no painel;
- APIs `/api/tasks/*`;
- APIs `/api/task-projects/*`;
- APIs `/api/admin/tasks/*`;
- APIs `/api/admin/task-projects/*`.

Funcionalidades:

- tarefas avulsas;
- responsaveis, colaboradores e aprovadores;
- status operacional;
- comentarios, anexos e checklist;
- aprovacoes;
- projetos;
- membros de projeto;
- dependencias;
- ordenacao;
- Gantt;
- exportacao PDF e XLSX;
- portfolio Gantt.

Dados:

- tabelas de tarefas e projetos geridas por `packages/core/src/tasks/repository.ts`;
- anexos via storage;
- usuarios e colaboradores como participantes.

Magic IA:

- deve ser modulo Magic Core horizontal;
- precisa de escopo por tenant, unidade, equipe, projeto e membro;
- tarefas podem ser reutilizadas por todos os demais modulos;
- aprovacao deve ser politica configuravel por tenant.

