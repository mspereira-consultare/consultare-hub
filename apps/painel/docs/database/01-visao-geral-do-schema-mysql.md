# Visao Geral do Schema MySQL

## Metodologia

- Estrutura de tabelas, colunas, constraints e indices extraida diretamente de `information_schema` do MySQL em producao/uso atual.
- Origem da informacao e responsavel tecnico inferidos do codigo local (`workers/`, `frontend/src/lib/`, `frontend/src/app/api/` e scripts) e cruzados com a documentacao existente do projeto.
- Descricoes de colunas foram consolidadas a partir do nome do campo, contexto do modulo e referencias documentais existentes. Onde o MySQL nao possui `column_comment`, a descricao e interpretativa e deve ser refinada quando houver regra de negocio adicional.

## Resumo executivo

- Banco consultado: `railway`.
- Versao: `9.4.0`.
- Tabelas encontradas: `116`.
- Tabelas sem PK: `4`.
- Tabelas sem FK fisica: `116` (nenhuma tabela possui FK fisica declarada).
- Tabelas sem indice: `2`.

## Inventario por dominio

### Administracao, seguranca e governanca

| Tabela | Finalidade | Origem | Escrita principal | PK |
| --- | --- | --- | --- | --- |
| goals_config | Configuracao de metas salvas no painel. | Configuracao e operacao interna do painel. | frontend/src/app/api/admin/goals/route.ts | id |
| integrations_config | Credenciais e configuracoes tecnicas de integracoes. | Configuracao e operacao interna do painel. | workers/database_manager.py | Sem PK declarada |
| system_status | Heartbeat e estado operacional dos workers/orquestrador. | Configuracao e operacao interna do painel. | workers/database_manager.py | service_name |
| system_status_backup | Backup auxiliar do heartbeat. | Origem mista no painel/aplicacao; validar modulo escritor principal. | frontend/scripts/validate-turso-mysql.cjs | Sem PK declarada |
| teams_master | Cadastro mestre de equipes/setores. | Configuracao e operacao interna do painel. | frontend/src/app/api/admin/teams/route.ts | id |
| user_page_permissions | Matriz persistida de permissao por usuario e pagina. | Configuracao manual de permissoes no painel. | frontend/src/lib/permissions_server.ts | user_id, page_key |
| user_teams | Relacionamento entre usuarios/agendadores e equipes. | Configuracao e operacao interna do painel. | frontend/src/app/api/admin/user-teams/route.ts | id |
| users | Cadastro de usuarios do painel. | Configuracao e operacao interna do painel. | frontend/seed-turso.mjs | id |

### Operacao online, filas e checklists

| Tabela | Finalidade | Origem | Escrita principal | PK |
| --- | --- | --- | --- | --- |
| agenda_occupancy_daily | Snapshot diario de ocupacao da agenda. | Agenda/ocupacao operacional importada para o painel. | workers/worker_agenda_ocupacao.py | data_ref, unidade_id, especialidade_id |
| agenda_occupancy_jobs | Controle dos jobs de ocupacao da agenda. | Agenda/ocupacao operacional importada para o painel. | workers/worker_agenda_ocupacao.py | id |
| clinia_ads_job_items | Itens detalhados de jobs de Clinia Ads. | Clinia Ads / endpoints analiticos da Clinia. | workers/worker_clinia_ads.py | id |
| clinia_ads_jobs | Controle de execucao dos jobs de Clinia Ads. | Clinia Ads / endpoints analiticos da Clinia. | workers/worker_clinia_ads.py | id |
| clinia_appointment_stats | Metricas diarias de agendamentos do Clinia. | Clinia (filas, grupos e estatisticas operacionais). | workers/worker_clinia.py | date |
| clinia_chat_stats | Metricas diarias de chat do Clinia. | Clinia (filas, grupos e estatisticas operacionais). | workers/worker_clinia.py | date |
| clinia_group_snapshots | Snapshot operacional dos grupos/filas do Clinia. | Clinia (filas, grupos e estatisticas operacionais). | workers/worker_clinia.py | group_id |
| crc_checklist_daily | Checklist diario/manual do CRC. | Lancamento manual no painel para checklist operacional. | frontend/src/app/api/admin/checklist/crc/route.ts | date_ref |
| espera_medica | Fila operacional em tempo real do atendimento medico. | Origem mista no painel/aplicacao; validar modulo escritor principal. | workers/database_manager.py | hash_id |
| monitor_medico_cycle_log | Log de ciclos do monitor medico. | Origem mista no painel/aplicacao; validar modulo escritor principal. | workers/database_manager.py | id |
| monitor_medico_event_log | Log detalhado de eventos do monitor medico. | Origem mista no painel/aplicacao; validar modulo escritor principal. | workers/database_manager.py | id |
| recepcao_checklist_daily | Checklist diario/manual de recepcao. | Lancamento manual no painel para checklist operacional. | frontend/src/app/api/admin/checklist/recepcao/route.ts | date_ref, unit_key |
| recepcao_checklist_manual | Lancamentos manuais complementares da recepcao. | Lancamento manual no painel para checklist operacional. | frontend/src/app/api/admin/checklist/recepcao/route.ts | scope_key |
| recepcao_historico | Historico operacional da fila/recepcao. | Origem mista no painel/aplicacao; validar modulo escritor principal. | workers/database_manager.py | hash_id |

### Comercial, agenda, faturamento, custos e repasses

| Tabela | Finalidade | Origem | Escrita principal | PK |
| --- | --- | --- | --- | --- |
| custo_analitico | Base analitica detalhada de custos. | Origem mista no painel/aplicacao; validar modulo escritor principal. | workers/worker_custo.py | Sem PK declarada |
| custo_resumo_diario | Materializacao diaria de custos agregados. | Origem mista no painel/aplicacao; validar modulo escritor principal. | workers/worker_custo.py | data_ref, forma_pagamento, tipo_conta, tipo_conta_destino |
| custo_resumo_mensal | Materializacao mensal de custos agregados. | Origem mista no painel/aplicacao; validar modulo escritor principal. | workers/worker_custo.py | month_ref, forma_pagamento, tipo_conta, tipo_conta_destino |
| faturamento_analitico | Base analitica detalhada de faturamento/pagamentos do Feegow. | Scraping/fluxo web Feegow de faturamento. | workers/worker_faturamento_scraping.py | Sem PK declarada |
| faturamento_backfill_checkpoint | Checkpoint do backfill historico de faturamento. | Scraping/fluxo web Feegow de faturamento. | workers/worker_faturamento_scraping_2025.py | year, month |
| faturamento_resumo_diario | Materializacao diaria de faturamento agregada. | Scraping/fluxo web Feegow de faturamento. | workers/worker_faturamento_scraping.py | data_ref, unidade, grupo, procedimento_key |
| faturamento_resumo_mensal | Materializacao mensal de faturamento agregada. | Scraping/fluxo web Feegow de faturamento. | workers/worker_faturamento_scraping.py | month_ref, unidade, grupo, procedimento_key |
| feegow_appointments | Base transacional de agendamentos importados da Feegow. | Feegow API de agendamentos. | workers/worker_feegow_appointments.py | appointment_id |
| feegow_appointments_backfill_checkpoint | Checkpoint do backfill historico de agendamentos. | Feegow API de agendamentos. | workers/worker_feegow_appointments_backfill.py | year, month |
| feegow_contracts | Base de contratos/procedimentos/itens comerciais importados do Feegow. | Feegow web/API no fluxo de contratos. | workers/worker_contracts.py | registration_number |
| feegow_patient_contacts_cache | Cache local de contatos de pacientes Feegow. | Feegow API/modulo comercial. | workers/worker_proposals.py | patient_id |
| feegow_patients | Cadastro de pacientes sincronizado a partir da Feegow. | Feegow API de pacientes. | workers/worker_feegow_patients.py | patient_id |
| feegow_patients_sync_state | Estado tecnico da sincronizacao de pacientes Feegow. | Feegow API de pacientes. | workers/worker_feegow_patients.py | sync_key |
| feegow_procedures_catalog | Catalogo de procedimentos importado da Feegow. | Feegow API/catalogo de procedimentos. | workers/worker_feegow_procedures.py | procedimento_id |
| feegow_proposals | Base operacional de propostas/comercial importadas da Feegow. | Feegow API/modulo comercial. | workers/worker_proposals.py | proposal_id |
| feegow_repasse_a_conferir | Base detalhada de linhas de repasse para conferencia. | Integracao Feegow. | workers/worker_consolidacao_profissionais.py | id |
| feegow_repasse_consolidado | Base consolidada de repasse por profissional/competencia. | Dados Feegow/web usados na apuracao de repasses. | workers/worker_repasse_consolidado.py | id |
| proposal_followup_control | Controle manual de follow-up comercial das propostas. | Origem mista no painel/aplicacao; validar modulo escritor principal. | frontend/src/lib/proposals/repository.ts | proposal_id |
| repasse_consolidacao_job_items | Itens dos jobs de consolidacao de repasse. | Cadastro/manual do painel de profissionais e sincronizacoes auxiliares. | workers/worker_consolidacao_profissionais.py | id |
| repasse_consolidacao_jobs | Controle dos jobs de consolidacao de repasse. | Cadastro/manual do painel de profissionais e sincronizacoes auxiliares. | workers/worker_consolidacao_profissionais.py | id |
| repasse_consolidacao_line_marks | Marcacoes/flags manuais por linha de repasse. | Origem mista no painel/aplicacao; validar modulo escritor principal. | frontend/src/lib/repasses/repository.ts | period_ref, professional_id, source_row_hash, user_id |
| repasse_consolidacao_mark_legends | Legenda/catalogo das marcacoes de repasse. | Origem mista no painel/aplicacao; validar modulo escritor principal. | frontend/src/lib/repasses/repository.ts | user_id, color_key |
| repasse_consolidacao_notes | Observacoes manuais na consolidacao de repasse. | Origem mista no painel/aplicacao; validar modulo escritor principal. | frontend/src/lib/repasses/repository.ts | period_ref, professional_id |
| repasse_fechamento_manual | Fechamentos/confirmacoes manuais de repasse. | Origem mista no painel/aplicacao; validar modulo escritor principal. | frontend/src/lib/repasses/repository.ts | period_ref, professional_id |
| repasse_pdf_artifacts | Artefatos/PDFs gerados para repasse. | Origem mista no painel/aplicacao; validar modulo escritor principal. | frontend/src/lib/repasses/repository.ts | id |
| repasse_pdf_jobs | Controle de jobs de geracao de PDF de repasse. | Origem mista no painel/aplicacao; validar modulo escritor principal. | frontend/src/lib/repasses/repository.ts | id |
| repasse_professional_notes | Observacoes por profissional no modulo de repasses. | Origem mista no painel/aplicacao; validar modulo escritor principal. | frontend/src/lib/repasses/repository.ts | period_ref, professional_id |
| repasse_sync_job_items | Itens dos jobs de sincronizacao de repasse. | Origem mista no painel/aplicacao; validar modulo escritor principal. | workers/worker_repasse_consolidado.py | id |
| repasse_sync_jobs | Controle dos jobs de sincronizacao de repasse. | Origem mista no painel/aplicacao; validar modulo escritor principal. | workers/worker_repasse_consolidado.py | id |

### Marketing, CRM, funil e analytics

| Tabela | Finalidade | Origem | Escrita principal | PK |
| --- | --- | --- | --- | --- |
| clinia_crm_boards | Cadastro dos boards/pipelines do CRM Clinia. | CRM Clinia. | workers/worker_clinia_crm.py | id |
| clinia_crm_columns | Cadastro das colunas/estagios do CRM Clinia. | CRM Clinia. | workers/worker_clinia_crm.py | id |
| clinia_crm_funnel_mapping | Mapeamento do funil do CRM Clinia. | CRM Clinia. | workers/worker_clinia_crm.py | id |
| clinia_crm_item_snapshots | Historico de snapshots dos cards/leads do CRM Clinia. | CRM Clinia. | workers/worker_clinia_crm.py | id |
| clinia_crm_items_current | Estado corrente dos cards/leads do CRM Clinia. | CRM Clinia. | workers/worker_clinia_crm.py | crm_item_id |
| clinia_crm_job_items | Itens detalhados dos jobs do CRM Clinia. | CRM Clinia. | workers/worker_clinia_crm.py | id |
| clinia_crm_jobs | Controle dos jobs do CRM Clinia. | CRM Clinia. | workers/worker_clinia_crm.py | id |
| fact_clinia_ads_daily | Fato diario de anuncios/leads Clinia Ads. | Clinia Ads / endpoints analiticos da Clinia. | workers/worker_clinia_ads.py | id |
| fact_clinia_crm_lead_created_daily | Fato diario de leads criados no CRM Clinia. | CRM Clinia. | workers/worker_clinia_crm.py | id |
| fact_clinia_crm_pipeline_daily | Fato diario do pipeline CRM Clinia. | CRM Clinia. | workers/worker_clinia_crm.py | id |
| fact_marketing_funnel_daily | Fato principal diario do funil de marketing. | Google Ads, GA4 e mapeamentos de marketing. | workers/worker_marketing_funnel_google.py | id |
| fact_marketing_funnel_daily_channel | Fato diario do funil por canal. | Google Ads, GA4 e mapeamentos de marketing. | workers/worker_marketing_funnel_google.py | id |
| fact_marketing_funnel_daily_device | Fato diario do funil por dispositivo. | Google Ads, GA4 e mapeamentos de marketing. | workers/worker_marketing_funnel_google.py | id |
| fact_marketing_funnel_daily_landing_page | Fato diario do funil por landing page. | Google Ads, GA4 e mapeamentos de marketing. | workers/worker_marketing_funnel_google.py | id |
| marketing_campaign_mapping | Mapeamento/enriquecimento de campanhas de marketing. | Google Ads, GA4 e mapeamentos de marketing. | workers/worker_marketing_funnel_google.py | id |
| marketing_funnel_job_items | Itens detalhados dos jobs do funil. | Google Ads, GA4 e mapeamentos de marketing. | workers/worker_marketing_funnel_google.py | id |
| marketing_funnel_jobs | Controle dos jobs do funil de marketing. | Google Ads, GA4 e mapeamentos de marketing. | workers/worker_marketing_funnel_google.py | id |
| marketing_google_accounts | Cadastro tecnico de contas Google Ads/GA4. | Google Ads, GA4 e mapeamentos de marketing. | workers/worker_marketing_funnel_google.py | id |
| raw_clinia_ads_contacts | Staging/raw de contatos de anuncios Clinia. | Clinia Ads / endpoints analiticos da Clinia. | workers/worker_clinia_ads.py | event_hash |
| raw_ga4_campaign_daily | Staging/raw diario de campanhas GA4. | Google Ads, GA4 e mapeamentos de marketing. | workers/worker_marketing_funnel_google.py | id |
| raw_ga4_channel_daily | Staging/raw diario de canais GA4. | Google Ads, GA4 e mapeamentos de marketing. | workers/worker_marketing_funnel_google.py | id |
| raw_ga4_landing_page_daily | Staging/raw diario de landing pages GA4. | Google Ads, GA4 e mapeamentos de marketing. | workers/worker_marketing_funnel_google.py | id |
| raw_google_ads_campaign_daily | Staging/raw diario de campanhas Google Ads. | Google Ads, GA4 e mapeamentos de marketing. | workers/worker_marketing_funnel_google.py | id |
| raw_google_ads_campaign_device_daily | Staging/raw diario de campanhas Google Ads por dispositivo. | Google Ads, GA4 e mapeamentos de marketing. | workers/worker_marketing_funnel_google.py | id |

### Pessoas, profissionais, RH e contratos

| Tabela | Finalidade | Origem | Escrita principal | PK |
| --- | --- | --- | --- | --- |
| contract_template_audit_log | Auditoria de alteracoes em modelos de contrato. | Cadastro/manual de modelos de contrato no painel. | frontend/src/lib/contract_templates/repository.ts | id |
| contract_templates | Repositorio de modelos de contrato. | Cadastro/manual de modelos de contrato no painel. | frontend/src/lib/contract_templates/repository.ts | id |
| employee_audit_log | Auditoria das alteracoes no cadastro de colaboradores. | Cadastro/manual do painel de RH/DP e importacoes de folha. | frontend/src/lib/colaboradores/repository.ts | id |
| employee_documents | Documentos ativos dos colaboradores. | Cadastro/manual do painel de RH/DP e importacoes de folha. | frontend/src/lib/colaboradores/repository.ts | id |
| employee_documents_inactive | Historico de documentos inativos de colaboradores. | Cadastro/manual do painel de RH/DP e importacoes de folha. | frontend/src/lib/colaboradores/repository.ts | id |
| employee_locker_assignments | Controle de armarios/chaves. | Cadastro/manual do painel de RH/DP e importacoes de folha. | frontend/src/lib/colaboradores/repository.ts | id |
| employee_recess_periods | Cadastro de ferias/recessos/licencas. | Cadastro/manual do painel de RH/DP e importacoes de folha. | frontend/src/lib/colaboradores/repository.ts | id |
| employee_uniform_items | Controle de uniformes/EPIs por colaborador. | Cadastro/manual do painel de RH/DP e importacoes de folha. | frontend/src/lib/colaboradores/repository.ts | id |
| employees | Cadastro principal de colaboradores. | Cadastro/manual do painel de RH/DP e importacoes de folha. | frontend/src/lib/colaboradores/repository.ts | id |
| payroll_import_files | Arquivos importados para processamento da folha. | Cadastro/manual do painel de RH/DP e importacoes de folha. | frontend/src/lib/payroll/repository.ts | id |
| payroll_lines | Linhas calculadas/importadas de folha. | Cadastro/manual do painel de RH/DP e importacoes de folha. | frontend/src/lib/payroll/repository.ts | id |
| payroll_occurrences | Ocorrencias/apontamentos da folha. | Cadastro/manual do painel de RH/DP e importacoes de folha. | frontend/src/lib/payroll/repository.ts | id |
| payroll_periods | Competencias/peridos de fechamento da folha. | Cadastro/manual do painel de RH/DP e importacoes de folha. | frontend/src/lib/payroll/repository.ts | id |
| payroll_point_daily | Apontamento diario de ponto consolidado. | Cadastro/manual do painel de RH/DP e importacoes de folha. | frontend/src/lib/payroll/repository.ts | id |
| payroll_reference_rows | Linhas de referencia para conciliacao. | Cadastro/manual do painel de RH/DP e importacoes de folha. | frontend/src/lib/payroll/repository.ts | id |
| payroll_rules | Regras parametrizadas da folha. | Cadastro/manual do painel de RH/DP e importacoes de folha. | frontend/src/lib/payroll/repository.ts | id |
| professional_audit_log | Auditoria do cadastro de profissionais. | Integracao Feegow. | workers/worker_feegow_professionals_sync.py | id |
| professional_contracts | Historico e metadados de contratos de profissionais. | Cadastro/manual do painel de profissionais e sincronizacoes auxiliares. | frontend/src/lib/profissionais/repository.ts | id |
| professional_document_checklist | Checklist de documentos obrigatorios por profissional. | Integracao Feegow. | workers/worker_feegow_professionals_sync.py | id |
| professional_documents | Documentos ativos dos profissionais. | Cadastro/manual do painel de profissionais e sincronizacoes auxiliares. | frontend/src/lib/profissionais/repository.ts | id |
| professional_documents_inactive | Historico de documentos inativos de profissionais. | Cadastro/manual do painel de profissionais e sincronizacoes auxiliares. | frontend/src/lib/profissionais/repository.ts | id |
| professional_procedure_rates | Valores/repasses por profissional x procedimento. | Cadastro/manual do painel de profissionais e sincronizacoes auxiliares. | frontend/src/lib/profissionais/repository.ts | id |
| professional_registrations | Registros profissionais (CRM, conselho, UF etc.). | Integracao Feegow. | workers/worker_feegow_professionals_sync.py | id |
| professionals | Cadastro principal de profissionais/prestadores. | Integracao Feegow. | workers/worker_feegow_professionals_sync.py | id |

### Qualidade, documentos regulatorios e equipamentos

| Tabela | Finalidade | Origem | Escrita principal | PK |
| --- | --- | --- | --- | --- |
| clinic_equipment | Cadastro mestre de equipamentos clinicos. | Cadastro/manual do painel de equipamentos. | frontend/src/lib/equipamentos/repository.ts | id |
| clinic_equipment_events | Historico de eventos/manutencoes/calibracoes dos equipamentos. | Cadastro/manual do painel de equipamentos. | frontend/src/lib/equipamentos/repository.ts | id |
| clinic_equipment_files | Arquivos vinculados aos equipamentos. | Cadastro/manual do painel de equipamentos. | frontend/src/lib/equipamentos/repository.ts | id |
| health_surveillance_document_licenses | Relacionamento entre documentos e licencas regulatorias. | Cadastro/manual do painel de vigilancia sanitaria. | frontend/src/lib/vigilancia_sanitaria/repository.ts | document_id, license_id |
| health_surveillance_documents | Documentos regulatorios de vigilancia sanitaria. | Cadastro/manual do painel de vigilancia sanitaria. | frontend/src/lib/vigilancia_sanitaria/repository.ts | id |
| health_surveillance_files | Arquivos anexos de vigilancia sanitaria. | Cadastro/manual do painel de vigilancia sanitaria. | frontend/src/lib/vigilancia_sanitaria/repository.ts | id |
| health_surveillance_licenses | Cadastro de licencas e alvaras regulatorios. | Cadastro/manual do painel de vigilancia sanitaria. | frontend/src/lib/vigilancia_sanitaria/repository.ts | id |
| qms_audit_actions | Plano de acoes vinculado a auditorias QMS. | Cadastro/manual do modulo de qualidade e treinamentos. | frontend/src/lib/qms/audits_repository.ts | id |
| qms_audit_log | Auditoria tecnica das alteracoes no modulo QMS. | Cadastro/manual do modulo de qualidade e treinamentos. | frontend/src/lib/qms/repository.ts | id |
| qms_audits | Cadastro e acompanhamento de auditorias de qualidade. | Cadastro/manual do modulo de qualidade e treinamentos. | frontend/src/lib/qms/audits_repository.ts | id |
| qms_document_files | Arquivos/anexos das versoes de documentos QMS. | Cadastro/manual do modulo de qualidade e treinamentos. | frontend/src/lib/qms/repository.ts | id |
| qms_document_training_links | Vinculo entre documentos QMS e treinamentos. | Cadastro/manual do modulo de qualidade e treinamentos. | frontend/src/lib/qms/trainings_repository.ts | id |
| qms_document_versions | Versionamento formal dos documentos do QMS. | Cadastro/manual do modulo de qualidade e treinamentos. | frontend/src/lib/qms/repository.ts | id |
| qms_documents | Cadastro mestre de documentos do sistema de qualidade. | Cadastro/manual do modulo de qualidade e treinamentos. | frontend/src/lib/qms/repository.ts | id |
| qms_training_files | Arquivos/anexos de treinamentos. | Cadastro/manual do modulo de qualidade e treinamentos. | frontend/src/lib/qms/trainings_repository.ts | id |
| qms_training_plans | Planos/programacoes de treinamento. | Cadastro/manual do modulo de qualidade e treinamentos. | frontend/src/lib/qms/trainings_repository.ts | id |
| qms_trainings | Execucao/registro de treinamentos. | Cadastro/manual do modulo de qualidade e treinamentos. | frontend/src/lib/qms/trainings_repository.ts | id |

## Lacunas estruturais observadas no schema vivo

### Tabelas sem chave primaria declarada

- `custo_analitico`
- `faturamento_analitico`
- `integrations_config`
- `system_status_backup`

### Tabelas sem indice

- `custo_analitico`
- `system_status_backup`

### Observacao sobre relacionamentos

- O banco nao materializa FKs fisicas em `information_schema` para os dominios documentados.
- Isso significa que integridade referencial esta sendo garantida principalmente pelo codigo da aplicacao, pelos jobs/workers e por convencoes de chave.
- O documento `02-relacionamentos-logicos-mysql.md` registra os vinculos logicos inferidos e deve ser tratado como a referencia atual de navegacao entre tabelas.

