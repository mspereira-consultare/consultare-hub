# Dados, Integracoes e Workers

## Principio do legado

O legado opera em um modelo de ingestao local:

1. integracao ou scraping externo;
2. worker grava tabelas locais;
3. worker atualiza `system_status`;
4. APIs leem tabelas locais;
5. UI mostra dados, filtros, exports e status.

No Magic IA, esse padrao deve virar:

1. `JobEnvelope` tenant-aware;
2. segredo por tenant via `SecretRef`;
3. idempotencia por origem;
4. staging `raw_*` quando necessario;
5. tabelas canonicas Magic Core;
6. fatos analiticos em analytics serving;
7. auditoria append-only.

## Tabelas por dominio

### Administracao e plataforma

- `users`
- `user_page_permissions`
- `access_profiles`
- `access_profile_permissions`
- `user_access_profile_assignments`
- `access_permission_audit_log`
- `teams_master`
- `user_teams`
- `goals_config`
- `integrations_config`
- `system_status`

### Operacao online

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

### Feegow, comercial e agenda

- `feegow_appointments`
- `feegow_appointments_backfill_checkpoint`
- `feegow_patients`
- `feegow_patients_sync_state`
- `feegow_procedures_catalog`
- `feegow_proposals`
- `feegow_contracts`
- `feegow_patient_contacts_cache`
- `proposal_followup_control`

### Financeiro, custo e repasses

- `faturamento_analitico`
- `faturamento_backfill_checkpoint`
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

### Marketing e analytics

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

### Pessoas, RH, profissionais e contratos

- `employees`
- `employee_documents`
- `employee_documents_inactive`
- `employee_lifecycle_cases`
- `employee_lifecycle_tasks`
- `employee_locker_assignments`
- `employee_portal_invites`
- `employee_portal_sessions`
- `employee_portal_submissions`
- `employee_portal_submission_documents`
- `employee_recess_periods`
- `employee_uniform_items`
- `employee_audit_log`
- `professionals`
- `professional_registrations`
- `professional_documents`
- `professional_documents_inactive`
- `professional_procedure_rates`
- `professional_document_checklist`
- `professional_contracts`
- `professional_audit_log`
- `contract_templates`
- `contract_template_audit_log`
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

### Qualidade, equipamentos e regulatorio

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
- `clinic_equipment`
- `clinic_equipment_events`
- `clinic_equipment_files`
- `health_surveillance_licenses`
- `health_surveillance_documents`
- `health_surveillance_document_licenses`
- `health_surveillance_files`

### Intranet

- `intranet_assets`
- `intranet_audience_groups`
- `intranet_audience_group_rules`
- `intranet_user_audience_assignments`
- `intranet_editorial_scopes`
- `intranet_editorial_scope_assignments`
- `intranet_navigation_nodes`
- `intranet_navigation_node_audiences`
- `intranet_pages`
- `intranet_page_revisions`
- `intranet_page_audiences`
- `intranet_news_posts`
- `intranet_news_post_audiences`
- `intranet_faq_categories`
- `intranet_faq_items`
- `intranet_faq_item_audiences`
- `intranet_catalog_items`
- `intranet_procedure_profiles`
- `intranet_professional_profiles`
- `intranet_professional_catalog_items`
- `intranet_professional_notes`
- `intranet_professional_procedures`
- `intranet_professional_specialties`
- `intranet_qms_document_settings`
- `intranet_specialty_notes`
- `intranet_specialty_pages`
- `intranet_specialty_profiles`
- `intranet_chat_conversations`
- `intranet_chat_conversation_members`
- `intranet_chat_messages`
- `intranet_chat_message_attachments`
- `intranet_chat_moderation_log`

## Integracoes externas

### Feegow

Uso atual:

- agendamentos;
- pacientes;
- procedimentos;
- profissionais;
- propostas;
- contratos;
- faturamento;
- custo;
- repasses;
- monitores por paginas internas;
- autenticacao/cookies de app4.

Contratos atuais:

- API v1 com `FEEGOW_ACCESS_TOKEN`;
- scraping web com Playwright e cookies;
- `integrations_config` e env vars como fontes de credenciais;
- tabelas `feegow_*` como espelho local.

Magic IA:

- deve existir como `Feegow Bridge` por tenant;
- nao deve ser runtime core obrigatorio;
- deve usar ACL read-only quando consumir legado;
- deve mapear ids externos para entidades Magic Core;
- deve permitir desligar Feegow por tenant.

### Clinia

Uso atual:

- filas de WhatsApp;
- estatisticas de chat;
- estatisticas de agendamento;
- Clinia Ads;
- contatos que alimentam funil de marketing.

Magic IA:

- deve ser conector opcional por tenant;
- dados devem entrar como staging e depois fatos;
- cookie/token deve ser SecretRef por tenant;
- health e cobertura historica precisam ser visiveis por tenant.

### Google Ads e GA4

Uso atual:

- funil de marketing;
- campanhas;
- canais;
- dispositivos;
- landing pages;
- diagnostico de saude Google Ads.

Magic IA:

- deve ser conector oficial de marketing;
- `raw_*` deve ser staging;
- `fact_*` deve ir para analytics serving;
- customer/account ids devem pertencer ao tenant.

### MailerSend

Uso atual:

- envio de fechamento de repasses;
- webhook de eventos;
- status de provider separado de entrega real;
- anexos e PDFs vindos de S3.

Magic IA:

- deve virar servico transacional por tenant;
- remetente, reply-to, templates e webhooks devem ser tenant-scoped;
- eventos devem entrar em audit/event store.

### OpenAI

Uso atual:

- chatbot da intranet;
- resumo/IA do dashboard executivo;
- triagem de recrutamento;
- embeddings e structured outputs.

Magic IA:

- deve isolar corpus, logs e prompts por tenant;
- deve ter quotas/entitlements por modulo;
- deve registrar auditoria de uso quando afetar processo de negocio;
- nunca deve misturar conhecimento entre tenants.

### S3

Uso atual:

- documentos de colaboradores;
- documentos de profissionais;
- arquivos QMS;
- vigilancia sanitaria;
- equipamentos;
- anexos de tarefas;
- repasses PDFs;
- portal colaborador.

Magic IA:

- prefixo obrigatorio por tenant;
- metadados em banco com `tenant_id`;
- downloads sempre via API autorizada;
- lifecycle e retencao por classe de dado.

### Indeed

Uso atual:

- modulo recrutamento com integracao planejada/implementada em endpoints;
- feed/inbound de candidaturas;
- triagem IA de curriculos.

Magic IA:

- deve ser conector opcional do modulo RH/Recrutamento;
- vagas devem nascer no Magic Core;
- Indeed deve ser canal de publicacao e origem de candidaturas.

## Workers

### Feegow e operacao clinica

- `worker_auth.py`: renova token/cookies Feegow.
- `feegow_core.py`: helper para fluxos web Feegow.
- `feegow_client.py`: cliente API Feegow.
- `feegow_web_auth.py`: login app4, troca de unidade e captura de tokens/cookies.
- `worker_feegow_appointments.py`: sincroniza agendamentos.
- `worker_feegow_appointments_backfill.py`: backfill mensal de agendamentos.
- `worker_feegow_patients.py`: sincroniza cadastro de pacientes.
- `worker_feegow_procedures.py`: sincroniza catalogo de procedimentos.
- `worker_feegow_professionals_sync.py`: sincroniza profissionais.
- `worker_contracts.py`: sincroniza contratos.
- `worker_faturamento_scraping.py`: extrai faturamento.
- `worker_faturamento_scraping_2025.py`: backfill historico de faturamento.
- `worker_custo.py`: extrai custo.
- `worker_agenda_ocupacao.py`: calcula ocupacao de agenda.

### Monitoramento operacional

- `monitor_medico.py`: fila de atendimento medico.
- `monitor_recepcao.py`: fila de recepcao.
- `worker_clinia.py`: fila digital e estatisticas Clinia.
- `worker_auth_clinia.py`: renovacao de cookie Clinia.

### Marketing

- `worker_marketing_funnel_google.py`: Google Ads/GA4 e fatos do funil.
- `worker_clinia_ads.py`: Clinia Ads e fatos diarios.

### Financeiro e repasses

- `worker_repasse_consolidado.py`: repasses conferidos.
- `worker_consolidacao_profissionais.py`: repasses a conferir/consolidacao.
- `worker_repasse_email.py`: envios de fechamento.

### RH, intranet e IA

- `worker_payroll_point_import.py`: processamento de ponto da folha.
- `payroll_parse_point_pdf.py`: parser de ponto PDF.
- `worker_recruitment_ai.py`: triagem IA de recrutamento.
- `worker_intranet_knowledge.py`: indexacao de conhecimento da intranet.

### Orquestracao

- `workers/main.py`: listener, scheduler, monitores, fila serial, dispatcher, watchdog e healthcheck.

## Implicacoes multi-tenant

Todo worker do Magic IA deve receber ou resolver:

- `tenant_id`;
- `job_id`;
- `correlation_id`;
- `actor_type`;
- `actor_id`, quando houver usuario;
- `module_key`;
- `source_system`;
- `SecretRef`;
- politica de idempotencia;
- data scope autorizado;
- destino de staging/fato.

Nenhum worker deve:

- ler credencial global de tenant especifico;
- gravar tabela sem `tenant_id`;
- consumir dados de todos os tenants sem grants globais explicitos;
- compartilhar cache entre tenants;
- misturar logs de negocio com logs tecnicos sem correlacao.

## Padroes que devem virar contratos no Magic IA

- `system_status` deve evoluir para `job_runs`, `service_health` e `outbox/inbox`.
- `integrations_config` deve evoluir para `integration_connections` + `SecretRef`.
- `feegow_*` deve virar namespace de bridge, nao core.
- `raw_*` deve ser staging auditavel.
- `fact_*` deve alimentar analytics serving.
- arquivos em S3 devem ter metadados tenant-aware.
- tabelas de auditoria devem ser append-only.
- refresh manual deve sempre criar job ou evento idempotente.

