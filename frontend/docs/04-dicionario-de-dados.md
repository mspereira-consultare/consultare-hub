# Dicionário de Dados

Este documento lista as principais tabelas usadas pelo sistema, com objetivo funcional, chaves e responsáveis por escrita.

## Convenções

- Campos de data/hora em UTC/local conforme origem do worker.
- Chaves textuais podem estar normalizadas sem acento em algumas integrações.
- Tabelas de resumo são derivadas do analítico e devem ser tratadas como materialização.

---

## 1) Controle e Configuração

### `system_status`

| Campo | Descrição |
|---|---|
| `service_name` (PK) | Nome lógico do serviço/worker |
| `status` | Estado atual (`PENDING`, `RUNNING`, `ONLINE`, etc.) |
| `last_run` | Última execução |
| `details` | Mensagem de status/erro |

Escrita: orquestrador e APIs de refresh.

### `integrations_config`

| Campo | Descrição |
|---|---|
| `service` | Serviço (`feegow`, `clinia`) |
| `unit_id` | Unidade (quando aplicável) |
| `username` | Usuário da integração |
| `password` | Senha (quando aplicável) |
| `token` | Token/cookie |
| `cookies` | Cookies adicionais |
| `updated_at` | Data/hora de atualização |

Escrita: Settings, worker auth, database manager.

### `users`

| Campo | Descrição |
|---|---|
| `id` (PK) | UUID do usuário |
| `name` | Nome |
| `email` | Login |
| `password` | Hash bcrypt |
| `role` | `ADMIN`, `GESTOR`, `OPERADOR` |
| `department` | Departamento |
| `status` | `ATIVO`/`INATIVO` |
| `last_access` | Último acesso |
| `created_at`, `updated_at` | Auditoria básica |

Escrita: API de usuários.

### `user_page_permissions`

| Campo | Descrição |
|---|---|
| `user_id` (PK composta) | Usuário |
| `page_key` (PK composta) | Página |
| `can_view` | Permissão de visualização |
| `can_edit` | Permissão de edição |
| `can_refresh` | Permissão de refresh |
| `updated_at` | Atualização |

Escrita: API de permissões de usuário.

### `teams_master`

| Campo | Descrição |
|---|---|
| `id` (PK) | Identificador da equipe |
| `name` | Nome da equipe |
| `created_at`, `updated_at` | Auditoria |

Escrita: API de equipes.


### `feegow_appointments`

| Campo | Descrição |
|---|---|
| `id` (PK) | Identificador do agendamento |
| `scheduled_at` | Data/hora do agendamento |
| `scheduled_by` | Responsável pelo agendamento |
| `specialty` | Especialidade |
| `professional` | Profissional |
| `status_id` | Status numérico (ver STATUS_MAP) |
| `status` | Status textual |
| `patient_name` | Nome do paciente |
| `created_at` | Data/hora de criação |
| `updated_at` | Última atualização |

Escrita: worker_feegow_appointments.py

| Campo | Descrição |
|---|---|
| `id` (PK) | Identificador da relação |
| `user_name` | Nome do agendador/profissional |
| `team_id` | FK para `teams_master` |
| `created_at` | Data de vínculo |

Escrita: API de associação usuário-equipe.

---

## 2) Operação em Tempo Real

### `espera_medica`

| Campo | Descrição |
|---|---|
| `hash_id` (PK) | Identificador técnico do paciente na fila |
| `unidade` | Unidade |
| `paciente` | Nome do paciente |
| `chegada` | Horário de chegada |
| `espera_minutos` | Espera em minutos |
| `status` | Estado (aguardando, em atendimento, finalizado) |
| `profissional` | Profissional relacionado |
| `updated_at` | Última atualização |

Escrita: monitor médico.

### `recepcao_historico`

| Campo | Descrição |
|---|---|
| `hash_id` (PK) | Identificador técnico |
| `id_externo` | ID do registro na origem |
| `unidade_id`, `unidade_nome` | Unidade |
| `paciente_nome` | Paciente |
| `dt_chegada`, `dt_atendimento` | Tempos de fila/atendimento |
| `status` | Estado |
| `dia_referencia` | Data de referência |
| `updated_at` | Última atualização |

Escrita: monitor recepção.

### `clinia_group_snapshots`

| Campo | Descrição |
|---|---|
| `group_id` (PK) | Grupo Clinia |
| `group_name` | Nome do grupo |
| `queue_size` | Conversas abertas |
| `avg_wait_seconds` | Espera média em segundos |
| `updated_at` | Atualização |

Escrita: worker Clinia.

### `clinia_chat_stats`

Métricas diárias de chat (conversas, sem resposta, espera média).

### `clinia_appointment_stats`

Métricas diárias de agendamentos da Clinia (total, bot, CRC).

---

## 3) Comercial e Agenda

### `feegow_appointments`

| Campo | Descrição |
|---|---|
| `appointment_id` (PK) | ID do agendamento |
| `date` | Data da consulta |
| `status_id` | Status do agendamento |
| `value` | Valor |
| `specialty` | Especialidade |
| `professional_name` | Profissional |
| `procedure_group` | Grupo de procedimento |
| `scheduled_by` | Colaborador que criou |
| `unit_name` | Unidade |
| `scheduled_at` | Data/hora de criação do agendamento |
| `updated_at` | Atualização |

Escrita: worker Feegow de agendamentos (`appointments`) e backfills.

### `feegow_proposals`

| Campo | Descrição |
|---|---|
| `proposal_id` (PK) | ID da proposta |
| `date` | Data da proposta |
| `status` | Situação da proposta |
| `unit_name` | Unidade |
| `professional_name` | Profissional |
| `total_value` | Valor total (líquido calculado) |
| `items_json` | Itens da proposta |
| `updated_at` | Atualização |

Escrita: worker de propostas.

### `feegow_contracts`

| Campo | Descrição |
|---|---|
| `registration_number` (PK) | Matrícula do contrato/paciente |
| `contract_id` | ID do contrato |
| `created_at`, `start_date` | Datas |
| `patient_name` | Paciente |
| `plan_name` | Plano |
| `status_contract` | Situação contratual |
| `status_financial` | Situação financeira |
| `recurrence_value` | Mensalidade recorrente |
| `membership_value` | Valor de adesão |
| `updated_at` | Atualização |

Escrita: worker de contratos.

---

## 4) Metas

### `goals_config`

Tabela de configuração de metas.

Campos relevantes:

- identificação: `id`, `name`, `scope`, `sector`
- vigência: `start_date`, `end_date`, `periodicity`
- meta: `target_value`, `unit`
- automação: `linked_kpi_id`
- filtros: `filter_group`, `clinic_unit`, `collaborator`, `team`
- auditoria: `created_at`, `updated_at` (quando presente no schema)

Escrita: API de metas.

---

## 5) Faturamento

### `faturamento_analitico`

Base analítica de faturamento, alimentada por scraping.

Campos típicos usados no sistema:

- `data_do_pagamento`
- `unidade`
- `grupo`
- `procedimento`
- `total_pago`
- `usuario_da_conta` (quando disponível)
- `updated_at`

Escrita: worker de faturamento (janela móvel dos últimos 7 dias, por padrão) e worker de backfill histórico.

### `faturamento_resumo_diario`

Materialização diária derivada de `faturamento_analitico`.

| Campo | Descrição |
|---|---|
| `data_ref` | Dia (YYYY-MM-DD) |
| `unidade`, `grupo`, `procedimento` | Dimensões |
| `procedimento_key` | Chave técnica do procedimento (MySQL) |
| `total_pago` | Soma do valor pago |
| `qtd` | Quantidade agregada |
| `updated_at` | Atualização |

Escrita: worker de faturamento (rebuild por período).

### `faturamento_resumo_mensal`

Materialização mensal derivada de `faturamento_resumo_diario`.

| Campo | Descrição |
|---|---|
| `month_ref` | Mês (YYYY-MM) |
| `unidade`, `grupo`, `procedimento` | Dimensões |
| `procedimento_key` | Chave técnica do procedimento (MySQL) |
| `total_pago` | Soma mensal |
| `qtd` | Quantidade agregada |
| `updated_at` | Atualização |

Escrita: worker de faturamento e backfill.

### `faturamento_backfill_checkpoint`

Checkpoint de backfill mensal.

| Campo | Descrição |
|---|---|
| `year` (PK composta) | Ano |
| `month` (PK composta) | Mês |
| `completed_at` | Data/hora de conclusão |

Escrita: `worker_faturamento_scraping_2025.py`.

---

## 6) Checklists

### `crc_checklist_daily`

Persistência diária do checklist CRC.

| Campo | Descrição |
|---|---|
| `date_ref` (PK) | Dia |
| `calls_made` | Ligações realizadas |
| `abandon_rate` | Taxa de abandono (texto) |
| `updated_at` | Atualização |

Escrita: API do checklist CRC.

### `recepcao_checklist_manual`

Persistência por unidade do checklist recepção.

| Campo | Descrição |
|---|---|
| `scope_key` (PK) | Chave da unidade |
| `meta_resolve_target`, `meta_checkup_target` | Alvos manuais |
| `nf_status`, `contas_status` | Validações manuais |
| `google_rating`, `google_comments` | Qualidade |
| `pendencias_urgentes`, `situacoes_criticas` | Textos operacionais |
| `situacao_prazo`, `situacao_responsavel` | Gestão de ação |
| `acoes_realizadas` | Execução |
| `updated_at` | Atualização |

Escrita: API do checklist recepção.

### `recepcao_checklist_daily` (legado)

Tabela de persistência antiga por dia/unidade. Mantida para fallback de leitura.

---

## 7) Outras Tabelas

### `config`

Tabela usada por `POST /api/admin/token` para chave-valor simples.

Campos:

- `chave`
- `valor`
- `dt_atualizacao`

---

## 7) Gestao de Profissionais

### `professionals`

Cadastro principal do profissional.

Campos relevantes:
- `id` (PK)
- `name`
- `contract_party_type` (`PF`/`PJ`)
- `contract_type` (tipo de contrato para automacao)
- `contract_template_id` (modelo ativo vinculado ao profissional)
- `cpf`, `cnpj`, `legal_name`
- `specialty` (especialidade principal)
- `primary_specialty`
- `specialties_json` (lista de especialidades)
- `phone`, `email`
- `age_range` (`min-max`, ex.: `18-65`)
- `service_units_json`
- `has_feegow_permissions`
- `personal_doc_type`, `personal_doc_number`
- `address_text`
- `is_active`
- `has_physical_folder`, `physical_folder_note`
- `payment_minimum_text` (texto livre opcional para clausula de pagamento minimo)
- `contract_start_date`, `contract_end_date`
- `created_at`, `updated_at`

Escrita: API `/api/admin/profissionais`.

### `professional_registrations`

Registros regionais (multiplo por profissional).

Campos:
- `id` (PK)
- `professional_id`
- `council_type` (CRM, CRO, CRP...)
- `council_number`
- `council_uf`
- `is_primary`
- `created_at`, `updated_at`

Regra: cada profissional deve ter exatamente 1 registro principal.

### `feegow_procedures_catalog`

Catalogo de procedimentos sincronizado da API Feegow.

Campos:
- `procedimento_id` (PK)
- `nome`
- `codigo`
- `tipo_procedimento`
- `grupo_procedimento`
- `valor`
- `especialidades_json` (lista de especialidades)
- `raw_json` (payload bruto do item para rastreabilidade)
- `updated_at`

Escrita: worker `worker_feegow_procedures.py`.

### `professional_procedure_rates`

Tabela de vinculo `profissional x procedimento` com valor customizavel.

Campos:
- `id` (PK)
- `professional_id`
- `procedimento_id`
- `procedimento_nome`
- `valor_base` (valor de referencia do catalogo Feegow)
- `valor_profissional` (valor final negociado para o profissional)
- `created_at`, `updated_at`

Regra: `UNIQUE(professional_id, procedimento_id)`.
Escrita: API `PUT /api/admin/profissionais/:id/procedimentos`.

### `professional_document_checklist`

Checklist manual de transicao (controle fisico/digital).

Campos:
- `id` (PK)
- `professional_id`
- `doc_type`
- `has_physical_copy`, `has_digital_copy`
- `expires_at` (principalmente `CERTIDAO_ETICA`)
- `notes`
- `verified_by`, `verified_at`, `updated_at`

Uso: base de pendencias no modo hibrido, junto com `professional_documents`.
Observacao: o tipo `OUTRO` e upload-only (nao faz parte deste checklist).

### `professional_documents`

Tabela preparada para documentos com storage externo.

Campos:
- `id` (PK)
- `professional_id`
- `doc_type`
- `storage_provider`, `storage_bucket`, `storage_key`
- `original_name`, `mime_type`, `size_bytes`
- `expires_at`
- `is_active`
- `uploaded_by`, `created_at`

Observacao de tipos:
- aceita os tipos documentais oficiais do modulo e tambem `OUTRO` para anexos livres.
- contratos gerados automaticamente nao sao mais gravados nesta tabela.
- para contrato final assinado, usar upload manual com `doc_type = CONTRATO_ASSINADO`.

### `professional_contracts`

Historico de geracao de contratos por profissional.

Campos:
- `id` (PK)
- `professional_id`
- `template_key`, `template_version`
- `status`
- `storage_provider`, `storage_bucket`, `storage_key` (referencia principal, legado DOCX)
- `generated_by`, `generated_at`
- `error_message`, `meta_json`, `created_at`

Uso atual do `meta_json`:
- metadados do template;
- origem da geracao (`manual`/`reprocess`);
- arquivos gerados por formato (`files.docx` e `files.pdf`), com provider/bucket/key/nome/mime/size.

Status utilizados:
- `PROCESSANDO`
- `GERADO`
- `ERRO`
- `ASSINADO` (reservado para fluxo de assinatura)

### `contract_templates`

Catalogo versionado dos modelos de contrato em `.docx`.

Campos:
- `id` (PK)
- `name`
- `contract_type`
- `version`
- `status` (`draft`, `active`, `archived`)
- `storage_provider`, `storage_bucket`, `storage_key`
- `original_name`, `mime_type`, `size_bytes`
- `placeholders_json` (placeholders detectados no upload)
- `mapping_json` (mapeamento placeholder -> fonte de dados)
- `notes`
- `uploaded_by`, `uploaded_at`
- `activated_by`, `activated_at`
- `archived_at`

Regra:
- somente modelos `active` aparecem no cadastro de profissional;
- ativacao exige placeholders obrigatorios mapeados.

### `contract_template_audit_log`

Auditoria do ciclo de vida dos modelos de contrato.

Campos:
- `id` (PK)
- `template_id`
- `action` (`TEMPLATE_UPLOADED`, `TEMPLATE_MAPPING_UPDATED`, `TEMPLATE_ACTIVATED`, `TEMPLATE_ARCHIVED`)
- `actor_user_id`
- `payload_json`
- `created_at`

### `professional_audit_log`

Auditoria do modulo.

Campos:
- `id` (PK)
- `professional_id`
- `action`
- `actor_user_id`
- `payload_json`
- `created_at`

Escrita: APIs de criacao/edicao do modulo.

### Nota de escrita

No estado atual, `professional_documents` é alimentada por `POST /api/admin/profissionais/:id/documentos` com storage S3.
Contratos gerados automaticamente ficam em `professional_contracts` e sao baixados por endpoint proprio.
O modulo opera em modo hibrido: checklist manual + upload em S3 no mesmo fluxo.
## Tabelas - Modulo Qualidade (Sprint 1)

### `qms_documents`

Finalidade:
- cadastro mestre de POP/documento operacional.

Campos principais:
- `id` (PK)
- `code` (unico; formato legivel ex.: `POP-2026-0001`)
- `sector`
- `name`
- `objective`
- `periodicity_days`
- `status`
- `archived_at`
- `created_by`, `created_at`, `updated_by`, `updated_at`

### `qms_document_versions`

Finalidade:
- historico de revisoes/versoes do POP.

Campos principais:
- `id` (PK)
- `document_id` (vinculo logico com `qms_documents.id`)
- `version_label`
- `elaborated_by`, `reviewed_by`, `approved_by`
- `creation_date`, `last_review_date`, `next_review_date`
- `linked_training_ref` (temporario Sprint 1)
- `revision_reason`, `scope`, `notes`
- `is_current`
- `created_by`, `created_at`

### `qms_document_files`

Finalidade:
- metadados de arquivo do POP armazenado no S3.

Campos principais:
- `id` (PK)
- `document_version_id`
- `storage_provider`, `storage_bucket`, `storage_key`
- `filename`, `mime_type`, `size_bytes`
- `uploaded_by`, `uploaded_at`
- `is_active`

### `qms_audit_log`

Finalidade:
- trilha de auditoria de alteracoes do modulo.

Campos principais:
- `id` (PK)
- `entity_type`, `entity_id`
- `action`
- `before_json`, `after_json`
- `actor_user_id`
- `created_at`

## Tabelas - Modulo Qualidade (Sprint 2)

### `qms_training_plans`

Finalidade:
- planejamento anual de treinamentos.

Campos principais:
- `id` (PK)
- `code` (unico; formato `CRN-YYYY-0001`)
- `theme`, `sector`, `training_type`
- `objective`, `instructor`, `target_audience`
- `workload_hours`, `planned_date`, `expiration_date`
- `evaluation_applied`, `evaluation_type`
- `target_indicator`, `expected_goal`
- `status`, `notes`
- `created_by`, `created_at`, `updated_by`, `updated_at`

### `qms_trainings`

Finalidade:
- registro de realizacoes de treinamento.

Campos principais:
- `id` (PK)
- `code` (unico; formato `TRN-YYYY-0001`)
- `plan_id` (opcional)
- `name`, `sector`, `training_type`
- `instructor`, `target_audience`
- `performed_at`, `workload_hours`
- `evaluation_applied`, `average_score`
- `next_training_date`
- `participants_planned`, `participants_actual`
- `result_post_training`, `status`, `notes`
- `created_by`, `created_at`, `updated_by`, `updated_at`

### `qms_training_files`

Finalidade:
- metadados de anexos por realizacao.

Campos principais:
- `id` (PK)
- `training_id`
- `file_type` (`attendance_list`, `evaluation`, `evidence`, `other`)
- `storage_provider`, `storage_bucket`, `storage_key`
- `filename`, `mime_type`, `size_bytes`
- `uploaded_by`, `uploaded_at`
- `is_active`

### `qms_document_training_links`

Finalidade:
- ligacao entre POP e cronograma (N:N).

Campos principais:
- `id` (PK)
- `document_id`
- `training_plan_id`
- `created_at`

## Tabelas - Modulo Qualidade (Sprint 3)

### `qms_audits`

Finalidade:
- registrar auditorias internas por POP/versionamento, com dados de conformidade e plano de acao.

Campos principais:
- `id` (PK)
- `code` (unico; formato `AUD-YYYY-0001`)
- `document_id`
- `document_version_id`
- `responsible`
- `audit_date`
- `compliance_percent`
- `non_conformity`
- `action_plan`
- `correction_deadline`
- `reassessed`
- `effectiveness_check_date`
- `criticality` (`baixa`, `media`, `alta`)
- `status` (`aberta`, `em_tratativa`, `encerrada`)
- `created_by`, `created_at`, `updated_by`, `updated_at`

Regras:
- `document_version_id` deve pertencer ao `document_id` informado;
- status e reconciliado automaticamente com base nas acoes corretivas e no campo `reassessed`.

### `qms_audit_actions`

Finalidade:
- registrar plano de acao corretiva por auditoria.

Campos principais:
- `id` (PK)
- `audit_id`
- `description`
- `owner`
- `deadline`
- `status` (`aberta`, `em_andamento`, `concluida`, `atrasada`)
- `completion_note`
- `created_by`, `created_at`, `updated_by`, `updated_at`

Regras:
- acao com `deadline < hoje` e status `aberta/em_andamento` e marcada como `atrasada` no refresh;
- quando nao houver mais acoes abertas e a auditoria estiver reavaliada, a auditoria pode ser encerrada.
