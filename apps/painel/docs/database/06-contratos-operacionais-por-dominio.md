# Contratos Operacionais por Dominio

Este documento transforma o schema em contrato de integracao para quem vai construir API, job, webhook ou automacao nova.

## Estrutura de leitura

Cada dominio abaixo define:

- tabelas canonicas de leitura;
- tabelas que aceitam escrita do proprio modulo;
- tabelas que sao somente leitura;
- chaves de negocio;
- requisitos minimos de API/webhook;
- riscos de integridade.

## 1. Administracao e Governanca

### Tabelas canonicas

- `users`
- `user_page_permissions`
- `teams_master`
- `user_teams`
- `goals_config`
- `integrations_config`
- `system_status`

### Contrato

- Escrita em `users`, `user_page_permissions`, `teams_master`, `user_teams`, `goals_config` deve passar por API admin.
- `integrations_config` deve ser tratada como tabela sensivel de configuracao tecnica.
- `system_status` e de ownership do orquestrador/workers.

### Chaves de negocio

- `users.id`
- `user_page_permissions (user_id, page_key)`
- `teams_master.id`
- `user_teams.id`, com vinculo logico adicional `user_name + team_id`
- `goals_config.id`
- `integrations_config (service, unit_id)` como unicidade logica
- `system_status.service_name`

### Requisitos para API

- autenticar e autorizar por perfil;
- registrar alteracao com `updated_at` ou auditoria de dominio;
- nunca expor `password`, `token`, `cookies` de `integrations_config`.

## 2. Operacao Online

### Tabelas canonicas

- `espera_medica`
- `recepcao_historico`
- `monitor_medico_cycle_log`
- `monitor_medico_event_log`
- `recepcao_checklist_daily`
- `recepcao_checklist_manual`
- `crc_checklist_daily`
- `agenda_occupancy_daily`
- `agenda_occupancy_jobs`
- `clinia_group_snapshots`
- `clinia_chat_stats`
- `clinia_appointment_stats`

### Contrato

- tabelas de fila/monitor sao de leitura para APIs e dashboards;
- tabelas de checklist aceitam escrita manual somente via endpoints do modulo;
- `agenda_occupancy_jobs` deve ser tratada como trilha tecnica de processamento.

### Chaves de negocio

- `espera_medica.hash_id`
- `recepcao_historico.hash_id`
- `recepcao_checklist_daily (date_ref, unit_key)`
- `crc_checklist_daily.date_ref`
- `agenda_occupancy_daily (data_ref, unidade_id, especialidade_id)`

### Requisitos para API/webhook

- respostas operacionais devem ser paginadas ou resumidas;
- status de fila nao deve ser inferido sem revisar regra do monitor;
- para refresh manual, usar job/heartbeat em vez de mutar tabela de snapshot diretamente.

## 3. Feegow, Comercial e Agenda

### Tabelas canonicas

- `feegow_appointments`
- `feegow_patients`
- `feegow_procedures_catalog`
- `feegow_proposals`
- `feegow_contracts`
- `feegow_patient_contacts_cache`
- `proposal_followup_control`

### Contrato

- `feegow_*` e espelho de integracao: somente leitura fora do owner;
- `proposal_followup_control` e camada manual complementar e pode ser escrita pelo modulo de propostas;
- `feegow_patient_contacts_cache` e cache tecnico, nao contrato estavel para terceiros.

### Chaves de negocio

- `feegow_appointments.appointment_id`
- `feegow_patients.patient_id`
- `feegow_procedures_catalog.procedimento_id`
- `feegow_proposals.proposal_id`
- `proposal_followup_control.proposal_id`

### Requisitos para API/webhook

- novas APIs devem usar `proposal_id`, `patient_id`, `appointment_id` como idempotencia quando aplicavel;
- dados da Feegow podem ser sobrescritos por sincronizacao futura;
- campos manuais devem ficar separados em tabela do painel, nunca misturados no espelho bruto.

## 4. Faturamento, Custo e Repasses

### Tabelas canonicas

- `faturamento_analitico`
- `faturamento_resumo_diario`
- `faturamento_resumo_mensal`
- `custo_analitico`
- `custo_resumo_diario`
- `custo_resumo_mensal`
- `feegow_repasse_consolidado`
- `feegow_repasse_a_conferir`
- `repasse_sync_jobs`
- `repasse_sync_job_items`
- `repasse_consolidacao_jobs`
- `repasse_consolidacao_job_items`
- `repasse_professional_notes`
- `repasse_consolidacao_notes`
- `repasse_fechamento_manual`
- `repasse_consolidacao_line_marks`
- `repasse_consolidacao_mark_legends`
- `repasse_pdf_jobs`
- `repasse_pdf_artifacts`

### Contrato

- `resumo_*` e `fact-like` sao preferencia para leitura;
- `analitico` e `a_conferir` exigem cautela por volume e detalhe;
- tabelas `notes`, `marks`, `fechamento_manual` aceitam escrita do modulo de repasses;
- tabelas `jobs`, `sync`, `pdf` sao tecnicas e nao devem ser manipuladas por integracao externa.

### Chaves de negocio

- `faturamento_resumo_diario (data_ref, unidade, grupo, procedimento_key)`
- `faturamento_resumo_mensal (month_ref, unidade, grupo, procedimento_key)`
- `repasse_professional_notes (period_ref, professional_id)`
- `repasse_consolidacao_notes (period_ref, professional_id)`
- `repasse_fechamento_manual (period_ref, professional_id)`
- `repasse_consolidacao_line_marks (period_ref, professional_id, source_row_hash, user_id)`

### Requisitos para API/webhook

- para leitura, sempre definir janela temporal;
- para mutacao manual, exigir `period_ref` e entidade alvo;
- para jobs, usar `job_id` e `status` transicional;
- PDFs e artefatos devem ser tratados como derivados do fluxo, nunca como entrada primaria.

## 5. Marketing, CRM e Analytics

### Tabelas canonicas

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

### Contrato

- `raw_*` e somente staging/auditoria;
- `fact_*` e a camada preferencial para API gerencial;
- `marketing_campaign_mapping` pode receber parametrizacao manual do dominio;
- `clinia_ads_*` sao de ownership do respectivo worker.

### Chaves de negocio

- variam por origem, mas toda integracao nova deve preservar pelo menos:
  - data de negocio
  - conta/canal/campanha
  - id tecnico da origem quando existir
  - `job_id` quando passar por processamento batch

### Requisitos para API/webhook

- nao expor tabelas raw como contrato externo;
- separar camada de staging da camada de consulta;
- padronizar chaves de mapeamento de campanha;
- documentar claramente quando um numero e `capturado`, `atribuido` ou `calculado`.

## 6. Pessoas, RH e Contratos

### Tabelas canonicas

- `employees`
- `employee_documents`
- `employee_documents_inactive`
- `employee_uniform_items`
- `employee_locker_assignments`
- `employee_recess_periods`
- `employee_audit_log`
- `professionals`
- `professional_registrations`
- `professional_documents`
- `professional_documents_inactive`
- `professional_procedure_rates`
- `professional_document_checklist`
- `professional_contracts`
- `professional_audit_log`
- `payroll_rules`
- `payroll_periods`
- `payroll_import_files`
- `payroll_point_daily`
- `payroll_occurrences`
- `payroll_lines`
- `payroll_reference_rows`
- `contract_templates`
- `contract_template_audit_log`

### Contrato

- cadastros principais aceitam escrita via API do modulo;
- documentos ativos e inativos devem preservar historico;
- tabelas de folha exigem processamento transacional e rastreabilidade;
- `professional_audit_log`, `employee_audit_log` e `contract_template_audit_log` sao trilhas, nao input primario.

### Chaves de negocio

- `employees.id`
- `professionals.id`
- `employee_documents.id`, `professional_documents.id`
- `payroll_periods.id`
- `payroll_lines.id`
- `contract_templates.id`

### Requisitos para API/webhook

- todo upload deve gerar metadados de arquivo e autoria;
- mudancas de status/cadastro devem atualizar `updated_at`;
- imports de folha devem persistir arquivo, competencia, status e rastreio do processamento;
- para dados de RH, aplicar minimizacao e autorizacao forte.

## 7. Qualidade, Vigilancia e Equipamentos

### Tabelas canonicas

- `qms_documents`
- `qms_document_versions`
- `qms_document_files`
- `qms_document_training_links`
- `qms_audit_log`
- `qms_audits`
- `qms_audit_actions`
- `qms_training_plans`
- `qms_trainings`
- `qms_training_files`
- `health_surveillance_licenses`
- `health_surveillance_documents`
- `health_surveillance_document_licenses`
- `health_surveillance_files`
- `clinic_equipment`
- `clinic_equipment_events`
- `clinic_equipment_files`

### Contrato

- dominios documentais e regulatorios exigem historico, ownership claro e cuidado com exclusao;
- anexos devem ser tratados como metadado + storage, nao como blob arbitrario espalhado;
- `qms_document_versions` e a fonte de verdade para versao publicada do documento.

### Chaves de negocio

- `qms_documents.id`
- `qms_document_versions.id`
- `qms_audits.id`
- `qms_trainings.id`
- `health_surveillance_licenses.id`
- `health_surveillance_documents.id`
- `clinic_equipment.id`

### Requisitos para API/webhook

- uploads precisam guardar tipo, nome, autoria e timestamp;
- alteracoes de vencimento/renovacao devem ser auditaveis;
- links documento-licenca e documento-treinamento devem ser consistentes com a entidade pai;
- evitar hard delete sem politica formal.

## Padrao minimo para qualquer novo contrato de integracao

Todo dominio novo ou nova API/webhook deve declarar explicitamente:

- tabela owner
- tabela(s) de leitura publica do dominio
- chave de idempotencia
- regra de mutabilidade
- campos obrigatorios
- campos derivados
- status possiveis
- trilha tecnica (`created_at`, `updated_at`, `requested_at`, `processed_at`, `error_message`, etc.)

## Critério de prontidao

Um dev pode considerar um fluxo pronto para integracao quando:

- a tabela owner esta documentada;
- a chave de negocio esta clara;
- a regra de escrita esta centralizada;
- o consumo nao depende de inferencia fragil;
- ha idempotencia e tratamento de retry;
- os joins logicos necessarios estao documentados em [02-relacionamentos-logicos-mysql.md](./02-relacionamentos-logicos-mysql.md).
