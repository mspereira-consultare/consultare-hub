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

Escrita: worker_feegow.py

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

Escrita: worker Feegow (financeiro/agendamentos) e backfills.

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

Escrita: worker de faturamento diário e worker de backfill histórico.

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
