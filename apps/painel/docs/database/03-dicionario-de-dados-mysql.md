# Dicionario de Dados do MySQL

Documento consolidado de tabelas e colunas do MySQL vivo do painel Consultare.

## Leitura recomendada

- Use `01-visao-geral-do-schema-mysql.md` para navegacao executiva e por dominio.
- Use `02-relacionamentos-logicos-mysql.md` para identificar vinculos entre tabelas.
- Use este arquivo para consulta detalhada de colunas, tipos, chaves, defaults e evidencias de origem.

## Administracao, seguranca e governanca

### `goals_config`

- Finalidade: Configuracao de metas salvas no painel.
- Origem da informacao: Cadastro/manual do painel de RH/DP e importacoes de folha.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/colaboradores/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `57`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: employee_id -> employees.id (vinculo logico)
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/01-visao-funcional-e-indicadores.md, apps/painel/docs/10-plano-tecnico-colaboradores.md, apps/painel/docs/database/05-matriz-de-escrita-e-consumo.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | bigint | Nao | PK | - | Identificador primario do registro. |
| name | text | Sim | - | - | Nome principal do registro. |
| scope | varchar(191) | Sim | - | CLINIC | Campo do dominio `goals_config` referente a scope. |
| sector | text | Sim | - | - | Campo do dominio `goals_config` referente a sector. |
| start_date | text | Sim | - | - | Data de start. |
| end_date | text | Sim | - | - | Data de end. |
| periodicity | text | Sim | - | - | Campo do dominio `goals_config` referente a periodicity. |
| target_value | double | Sim | - | - | Valor monetario ou numerico referente a target value. |
| unit | text | Sim | - | - | Campo do dominio `goals_config` referente a unit. |
| linked_kpi_id | text | Sim | - | - | Identificador de linked kpi usado para relacionar ou localizar o registro na origem/aplicacao. |
| filter_group | text | Sim | - | - | Campo do dominio `goals_config` referente a filter group. |
| created_at | text | Sim | - | - | Data/hora de criacao do registro no painel. |
| updated_at | text | Sim | - | - | Data/hora da ultima atualizacao local do registro. |
| collaborator | text | Sim | - | - | Campo do dominio `goals_config` referente a collaborator. |
| clinic_unit | text | Sim | - | - | Campo do dominio `goals_config` referente a clinic unit. |
| team | text | Sim | - | - | Campo do dominio `goals_config` referente a team. |
| employee_id | text | Sim | - | - | Identificador do colaborador relacionado ao registro. |

---

### `integrations_config`

- Finalidade: Credenciais e configuracoes tecnicas de integracoes.
- Origem da informacao: Configuracao e operacao interna do painel.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/database_manager.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `6`
- Chave primaria: nao declarada no schema vivo
- Indices: idx_service_unit (service, unit_id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/database_manager.py`
- Evidencias documentais: `apps/painel/docs/09-plano-tecnico-marketing-funil.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/05-runbook-operacional.md, apps/painel/docs/database/05-matriz-de-escrita-e-consumo.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| service | varchar(191) | Sim | IDX | - | Nome da integracao/servico relacionado ao registro. |
| username | text | Sim | - | - | Usuario/login tecnico ou de negocio relacionado ao registro. |
| password | text | Sim | - | - | Credencial/senha persistida para integracao ou autenticacao. |
| token | text | Sim | - | - | Token de autenticacao ou integracao persistido para uso tecnico. |
| unit_id | varchar(191) | Sim | - | - | Identificador da unidade na origem ou no dominio de negocio. |
| updated_at | text | Sim | - | - | Data/hora da ultima atualizacao local do registro. |
| cookies | text | Sim | - | - | Cookies/sessao persistidos para integracoes web. |

---

### `system_status`

- Finalidade: Heartbeat e estado operacional dos workers/orquestrador.
- Origem da informacao: Configuracao e operacao interna do painel.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/database_manager.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `19`
- Chave primaria: `service_name`
- Indices: PRIMARY (service_name) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/database_manager.py`
- Evidencias documentais: `apps/painel/docs/09-plano-tecnico-marketing-funil.md, apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/12-plano-tecnico-marketing-controle.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| service_name | varchar(191) | Nao | PK | - | Nome logico do servico, worker ou rotina monitorada. |
| status | text | Sim | - | - | Status operacional/negocial atual do registro. |
| last_run | text | Sim | - | - | Data/hora da ultima execucao conhecida da rotina. |
| details | text | Sim | - | - | Detalhes adicionais, mensagem de erro ou contexto operacional. |
| message | text | Sim | - | - | Campo do dominio `system_status` referente a message. |

---

### `system_status_backup`

- Finalidade: Backup auxiliar do heartbeat.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Escrita/garantia de schema em script `apps/painel/scripts/validate-turso-mysql.cjs`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `14`
- Chave primaria: nao declarada no schema vivo
- Indices: nenhum indice identificado em `information_schema.statistics`
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencias documentais: `apps/painel/docs/database/05-matriz-de-escrita-e-consumo.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/04-guia-de-integracao-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| service_name | text | Sim | - | - | Nome logico do servico, worker ou rotina monitorada. |
| status | text | Sim | - | - | Status operacional/negocial atual do registro. |
| last_run | text | Sim | - | - | Data/hora da ultima execucao conhecida da rotina. |
| details | text | Sim | - | - | Detalhes adicionais, mensagem de erro ou contexto operacional. |
| message | text | Sim | - | - | Campo do dominio `system_status_backup` referente a message. |

---

### `teams_master`

- Finalidade: Cadastro mestre de equipes/setores.
- Origem da informacao: Configuracao e operacao interna do painel.
- Escrita/manutencao tecnica: Escrita principal garantida por rota API em `apps/painel/src/app/api/admin/teams/route.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `4`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/painel/src/app/api/admin/user-teams/route.ts`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/01-visao-funcional-e-indicadores.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/05-matriz-de-escrita-e-consumo.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(191) | Nao | PK | - | Identificador primario do registro. |
| name | text | Nao | - | - | Nome principal do registro. |
| created_at | datetime | Sim | - | CURRENT_TIMESTAMP | Data/hora de criacao do registro no painel. |
| updated_at | datetime | Sim | - | CURRENT_TIMESTAMP | Data/hora da ultima atualizacao local do registro. |

---

### `user_page_permissions`

- Finalidade: Matriz persistida de permissao por usuario e pagina.
- Origem da informacao: Configuracao manual de permissoes no painel.
- Escrita/manutencao tecnica: Evidencia principal localizada em `packages/core/src/permissions_server.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `317`
- Chave primaria: `user_id, page_key`
- Indices: PRIMARY (user_id, page_key) [UNQ]
- Vinculos principais: user_id -> users.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `packages/core/src/permissions_server.ts`
- Evidencias documentais: `apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/02-matriz-de-permissoes.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| user_id | varchar(64) | Nao | PK | - | Identificador do usuario relacionado ao registro. |
| page_key | varchar(64) | Nao | PK | - | Campo do dominio `user_page_permissions` referente a page key. |
| can_view | int | Nao | - | - | Campo do dominio `user_page_permissions` referente a can view. |
| can_edit | int | Nao | - | - | Campo do dominio `user_page_permissions` referente a can edit. |
| can_refresh | int | Nao | - | - | Campo do dominio `user_page_permissions` referente a can refresh. |
| updated_at | text | Sim | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `user_teams`

- Finalidade: Relacionamento entre usuarios/agendadores e equipes.
- Origem da informacao: Configuracao e operacao interna do painel.
- Escrita/manutencao tecnica: Escrita principal garantida por rota API em `apps/painel/src/app/api/admin/user-teams/route.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `8`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: team_id -> teams_master.id (vinculo logico); user_name -> users.name (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/app/api/admin/user-teams/route.ts`
- Evidencias documentais: `apps/painel/docs/01-visao-funcional-e-indicadores.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/05-matriz-de-escrita-e-consumo.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(191) | Nao | PK | - | Identificador primario do registro. |
| user_name | text | Nao | - | - | Nome de user utilizado para exibicao, filtro ou agrupamento. |
| team_id | text | Nao | - | - | Identificador da equipe relacionada ao registro. |
| created_at | datetime | Sim | - | CURRENT_TIMESTAMP | Data/hora de criacao do registro no painel. |

---

### `users`

- Finalidade: Cadastro de usuarios do painel.
- Origem da informacao: Configuracao e operacao interna do painel.
- Escrita/manutencao tecnica: Evidencia principal localizada em `apps/painel/seed-turso.mjs`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `65`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: employee_id -> employees.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/seed-turso.mjs`
- Evidencias documentais: `apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/02-matriz-de-permissoes.md, apps/painel/docs/05-runbook-operacional.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(191) | Nao | PK | - | Identificador primario do registro. |
| name | text | Sim | - | - | Nome principal do registro. |
| email | text | Nao | - | - | Endereco de e-mail associado ao registro. |
| password | text | Nao | - | - | Credencial/senha persistida para integracao ou autenticacao. |
| role | varchar(191) | Sim | - | USER | Papel/perfil atribuido ao registro. |
| created_at | datetime | Sim | - | CURRENT_TIMESTAMP | Data/hora de criacao do registro no painel. |
| updated_at | datetime | Sim | - | CURRENT_TIMESTAMP | Data/hora da ultima atualizacao local do registro. |
| department | varchar(191) | Sim | - | Geral | Campo do dominio `users` referente a department. |
| status | varchar(191) | Sim | - | ATIVO | Status operacional/negocial atual do registro. |
| last_access | text | Sim | - | - | Campo do dominio `users` referente a last access. |
| username | varchar(120) | Sim | - | - | Usuario/login tecnico ou de negocio relacionado ao registro. |
| employee_id | varchar(64) | Sim | - | - | Identificador do colaborador relacionado ao registro. |

---

## Operacao online, filas e checklists

### `agenda_occupancy_daily`

- Finalidade: Snapshot diario de ocupacao da agenda.
- Origem da informacao: Agenda/ocupacao operacional importada para o painel.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_agenda_ocupacao.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `12547`
- Chave primaria: `data_ref, unidade_id, especialidade_id`
- Indices: PRIMARY (data_ref, unidade_id, especialidade_id) [UNQ]; idx_agenda_occ_daily_spec_date (especialidade_id, data_ref); idx_agenda_occ_daily_unit_date (unidade_id, data_ref)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_agenda_ocupacao.py`
- Evidencias documentais: `apps/painel/docs/08-agenda-ocupacao.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md, apps/painel/docs/database/07-mapa-api-rotas-tabelas.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| data_ref | varchar(10) | Nao | PK | - | Data de referencia usada para agregacao ou competencia. |
| unidade_id | int | Nao | PK | - | Identificador de unidade usado para relacionar ou localizar o registro na origem/aplicacao. |
| unidade_nome | varchar(120) | Nao | - | - | Campo do dominio `agenda_occupancy_daily` referente a unidade nome. |
| especialidade_id | int | Nao | PK | - | Identificador de especialidade usado para relacionar ou localizar o registro na origem/aplicacao. |
| especialidade_nome | varchar(180) | Nao | - | - | Campo do dominio `agenda_occupancy_daily` referente a especialidade nome. |
| agendamentos_count | int | Nao | - | - | Quantidade/contagem referente a agendamentos count. |
| horarios_disponiveis_count | int | Nao | - | - | Quantidade/contagem referente a horarios disponiveis count. |
| horarios_bloqueados_count | int | Nao | - | - | Quantidade/contagem referente a horarios bloqueados count. |
| capacidade_liquida_count | int | Nao | - | - | Quantidade/contagem referente a capacidade liquida count. |
| taxa_confirmacao_pct | decimal(10,4) | Nao | - | - | Percentual/taxa referente a taxa confirmacao percentual. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `agenda_occupancy_jobs`

- Finalidade: Controle dos jobs de ocupacao da agenda.
- Origem da informacao: Agenda/ocupacao operacional importada para o painel.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_agenda_ocupacao.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `14`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_agenda_occ_jobs_created (created_at); idx_agenda_occ_jobs_status (status)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_agenda_ocupacao.py`
- Evidencias documentais: `apps/painel/docs/08-agenda-ocupacao.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md, apps/painel/docs/database/07-mapa-api-rotas-tabelas.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| status | varchar(20) | Nao | IDX | - | Status operacional/negocial atual do registro. |
| start_date | varchar(10) | Nao | - | - | Data de start. |
| end_date | varchar(10) | Nao | - | - | Data de end. |
| unit_scope_json | longtext | Sim | - | - | Conteudo estruturado em JSON relacionado a unit scope. |
| requested_by | varchar(64) | Nao | - | - | Campo do dominio `agenda_occupancy_jobs` referente a requested by. |
| error_message | text | Sim | - | - | Mensagem de erro registrada durante processamento. |
| created_at | varchar(32) | Nao | IDX | - | Data/hora de criacao do registro no painel. |
| started_at | varchar(32) | Sim | - | - | Data/hora referente a started. |
| finished_at | varchar(32) | Sim | - | - | Data/hora referente a finished. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `clinia_ads_job_items`

- Finalidade: Itens detalhados de jobs de Clinia Ads.
- Origem da informacao: Clinia Ads / endpoints analiticos da Clinia.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_clinia_ads.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `142`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_clinia_ads_job_item_job (job_id)
- Vinculos principais: job_id -> clinia_ads_jobs.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `workers/worker_clinia_ads.py`
- Evidencias documentais: `apps/painel/docs/09-plano-tecnico-marketing-funil.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| job_id | varchar(64) | Nao | IDX | - | Identificador do job/processamento ao qual a linha pertence. |
| source_period | varchar(16) | Nao | - | - | Campo do dominio `clinia_ads_job_items` referente a source period. |
| status | varchar(20) | Nao | - | - | Status operacional/negocial atual do registro. |
| records_read | int | Nao | - | 0 | Campo do dominio `clinia_ads_job_items` referente a records read. |
| records_written | int | Nao | - | 0 | Campo do dominio `clinia_ads_job_items` referente a records written. |
| error_message | text | Sim | - | - | Mensagem de erro registrada durante processamento. |
| duration_ms | int | Nao | - | 0 | Campo do dominio `clinia_ads_job_items` referente a duration ms. |
| created_at | varchar(32) | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `clinia_ads_jobs`

- Finalidade: Controle de execucao dos jobs de Clinia Ads.
- Origem da informacao: Clinia Ads / endpoints analiticos da Clinia.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_clinia_ads.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `72`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_clinia_ads_jobs_created (created_at); idx_clinia_ads_jobs_status (status)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_clinia_ads.py`
- Evidencias documentais: `apps/painel/docs/09-plano-tecnico-marketing-funil.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| status | varchar(20) | Nao | IDX | - | Status operacional/negocial atual do registro. |
| scope_json | text | Sim | - | - | Conteudo estruturado em JSON relacionado a scope. |
| requested_by | varchar(64) | Nao | - | - | Campo do dominio `clinia_ads_jobs` referente a requested by. |
| error_message | text | Sim | - | - | Mensagem de erro registrada durante processamento. |
| created_at | varchar(32) | Nao | IDX | - | Data/hora de criacao do registro no painel. |
| started_at | varchar(32) | Sim | - | - | Data/hora referente a started. |
| finished_at | varchar(32) | Sim | - | - | Data/hora referente a finished. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `clinia_appointment_stats`

- Finalidade: Metricas diarias de agendamentos do Clinia.
- Origem da informacao: Clinia (filas, grupos e estatisticas operacionais).
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_clinia.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `87`
- Chave primaria: `date`
- Indices: PRIMARY (date) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_clinia.py`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/database/05-matriz-de-escrita-e-consumo.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| date | varchar(191) | Nao | PK | - | Data principal do evento/medicao. |
| total_appointments | bigint | Sim | - | 0 | Quantidade/contagem referente a total appointments. |
| bot_appointments | bigint | Sim | - | 0 | Campo do dominio `clinia_appointment_stats` referente a bot appointments. |
| crc_appointments | bigint | Sim | - | 0 | Campo do dominio `clinia_appointment_stats` referente a crc appointments. |
| updated_at | text | Sim | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `clinia_chat_stats`

- Finalidade: Metricas diarias de chat do Clinia.
- Origem da informacao: Clinia (filas, grupos e estatisticas operacionais).
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_clinia.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `87`
- Chave primaria: `date`
- Indices: PRIMARY (date) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_clinia.py`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/database/05-matriz-de-escrita-e-consumo.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| date | varchar(191) | Nao | PK | - | Data principal do evento/medicao. |
| total_conversations | bigint | Sim | - | 0 | Quantidade/contagem referente a total conversations. |
| total_without_response | bigint | Sim | - | 0 | Quantidade/contagem referente a total without response. |
| avg_wait_seconds | bigint | Sim | - | 0 | Campo do dominio `clinia_chat_stats` referente a avg wait seconds. |
| updated_at | text | Sim | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `clinia_group_snapshots`

- Finalidade: Snapshot operacional dos grupos/filas do Clinia.
- Origem da informacao: Clinia (filas, grupos e estatisticas operacionais).
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_clinia.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `10`
- Chave primaria: `group_id`
- Indices: PRIMARY (group_id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_clinia.py`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/01-visao-funcional-e-indicadores.md, apps/painel/docs/database/05-matriz-de-escrita-e-consumo.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| group_id | varchar(191) | Nao | PK | - | Identificador de group usado para relacionar ou localizar o registro na origem/aplicacao. |
| group_name | text | Sim | - | - | Nome de group utilizado para exibicao, filtro ou agrupamento. |
| queue_size | bigint | Sim | - | 0 | Campo do dominio `clinia_group_snapshots` referente a queue size. |
| avg_wait_seconds | bigint | Sim | - | 0 | Campo do dominio `clinia_group_snapshots` referente a avg wait seconds. |
| updated_at | text | Sim | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `crc_checklist_daily`

- Finalidade: Checklist diario/manual do CRC.
- Origem da informacao: Lancamento manual no painel para checklist operacional.
- Escrita/manutencao tecnica: Escrita principal garantida por rota API em `apps/painel/src/app/api/admin/checklist/crc/route.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `2`
- Chave primaria: `date_ref`
- Indices: PRIMARY (date_ref) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/painel/src/app/api/admin/checklist/crc/route.ts`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/01-visao-funcional-e-indicadores.md, apps/painel/docs/database/05-matriz-de-escrita-e-consumo.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| date_ref | varchar(10) | Nao | PK | - | Campo do dominio `crc_checklist_daily` referente a date referencia. |
| calls_made | int | Sim | - | 0 | Campo do dominio `crc_checklist_daily` referente a calls made. |
| abandon_rate | varchar(32) | Sim | - | '' | Percentual/taxa referente a abandon rate. |
| updated_at | text | Sim | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `espera_medica`

- Finalidade: Fila operacional em tempo real do atendimento medico.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/database_manager.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `588`
- Chave primaria: `hash_id`
- Indices: PRIMARY (hash_id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/database_manager.py`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/01-visao-funcional-e-indicadores.md, apps/painel/docs/database/05-matriz-de-escrita-e-consumo.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| hash_id | varchar(191) | Nao | PK | - | Identificador de hash usado para relacionar ou localizar o registro na origem/aplicacao. |
| unidade | text | Sim | - | - | Campo do dominio `espera_medica` referente a unidade. |
| paciente | text | Sim | - | - | Campo do dominio `espera_medica` referente a paciente. |
| chegada | text | Sim | - | - | Campo do dominio `espera_medica` referente a chegada. |
| espera | text | Sim | - | - | Campo do dominio `espera_medica` referente a espera. |
| status | text | Sim | - | - | Status operacional/negocial atual do registro. |
| profissional | text | Sim | - | - | Campo do dominio `espera_medica` referente a profissional. |
| updated_at | text | Sim | - | - | Data/hora da ultima atualizacao local do registro. |
| last_seen_at | text | Sim | - | - | Data/hora referente a last seen. |
| espera_minutos | bigint | Sim | - | - | Campo do dominio `espera_medica` referente a espera minutos. |

---

### `monitor_medico_cycle_log`

- Finalidade: Log de ciclos do monitor medico.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/database_manager.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `294079`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/database_manager.py`
- Evidencias documentais: `apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md, apps/painel/docs/database/06-contratos-operacionais-por-dominio.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| cycle_id | varchar(64) | Nao | - | - | Identificador de cycle usado para relacionar ou localizar o registro na origem/aplicacao. |
| cycle_started_at | text | Nao | - | - | Data/hora referente a cycle started. |
| unit_name | varchar(80) | Nao | - | - | Nome da unidade exibido/normalizado para consumo no painel. |
| unit_id | int | Sim | - | - | Identificador da unidade na origem ou no dominio de negocio. |
| session_was_active | int | Sim | - | 0 | Campo do dominio `monitor_medico_cycle_log` referente a session was active. |
| login_performed | int | Sim | - | 0 | Campo do dominio `monitor_medico_cycle_log` referente a login performed. |
| login_success | int | Sim | - | 0 | Campo do dominio `monitor_medico_cycle_log` referente a login success. |
| queue_fetch_status | varchar(40) | Sim | - | - | Status/etapa de queue fetch status. |
| queue_fetch_meta_json | longtext | Sim | - | - | Conteudo estruturado em JSON relacionado a queue fetch meta. |
| parse_status | varchar(20) | Sim | - | - | Status/etapa de parse status. |
| patients_detected_count | int | Sim | - | 0 | Quantidade/contagem referente a patients detected count. |
| hashes_detected_count | int | Sim | - | 0 | Quantidade/contagem referente a hashes detected count. |
| coleta_confiavel | int | Sim | - | 0 | Campo do dominio `monitor_medico_cycle_log` referente a coleta confiavel. |
| coleta_vazia | int | Sim | - | 0 | Campo do dominio `monitor_medico_cycle_log` referente a coleta vazia. |
| active_rows_before_count | int | Sim | - | 0 | Quantidade/contagem referente a active rows before count. |
| missing_candidates_count | int | Sim | - | 0 | Quantidade/contagem referente a missing candidates count. |
| absence_tracking_count | int | Sim | - | 0 | Quantidade/contagem referente a absence tracking count. |
| finalized_absence_count | int | Sim | - | 0 | Quantidade/contagem referente a finalized absence count. |
| finalized_hard_stale_count | int | Sim | - | 0 | Quantidade/contagem referente a finalized hard stale count. |
| cycle_result | varchar(20) | Sim | - | - | Campo do dominio `monitor_medico_cycle_log` referente a cycle result. |
| message | text | Sim | - | - | Campo do dominio `monitor_medico_cycle_log` referente a message. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `monitor_medico_event_log`

- Finalidade: Log detalhado de eventos do monitor medico.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/database_manager.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `475990`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/database_manager.py`
- Evidencias documentais: `apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md, apps/painel/docs/database/06-contratos-operacionais-por-dominio.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| cycle_id | varchar(64) | Nao | - | - | Identificador de cycle usado para relacionar ou localizar o registro na origem/aplicacao. |
| unit_name | varchar(80) | Sim | - | - | Nome da unidade exibido/normalizado para consumo no painel. |
| unit_id | int | Sim | - | - | Identificador da unidade na origem ou no dominio de negocio. |
| event_type | varchar(80) | Nao | - | - | Campo do dominio `monitor_medico_event_log` referente a event type. |
| severity | varchar(20) | Nao | - | - | Campo do dominio `monitor_medico_event_log` referente a severity. |
| patient_hash_id | varchar(64) | Sim | - | - | Identificador de patient hash usado para relacionar ou localizar o registro na origem/aplicacao. |
| patient_name | text | Sim | - | - | Nome de patient utilizado para exibicao, filtro ou agrupamento. |
| payload_json | longtext | Sim | - | - | Payload bruto ou quase bruto em JSON para auditoria/reprocessamento. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `recepcao_checklist_daily`

- Finalidade: Checklist diario/manual de recepcao.
- Origem da informacao: Lancamento manual no painel para checklist operacional.
- Escrita/manutencao tecnica: Escrita principal garantida por rota API em `apps/painel/src/app/api/admin/checklist/recepcao/route.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `1`
- Chave primaria: `date_ref, unit_key`
- Indices: PRIMARY (date_ref, unit_key) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/painel/src/app/api/admin/checklist/recepcao/route.ts`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md, apps/painel/docs/database/07-mapa-api-rotas-tabelas.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| date_ref | varchar(10) | Nao | PK | - | Campo do dominio `recepcao_checklist_daily` referente a date referencia. |
| unit_key | varchar(50) | Nao | PK | - | Campo do dominio `recepcao_checklist_daily` referente a unit key. |
| meta_resolve_target | int | Sim | - | 0 | Campo do dominio `recepcao_checklist_daily` referente a meta resolve target. |
| meta_checkup_target | int | Sim | - | 0 | Campo do dominio `recepcao_checklist_daily` referente a meta checkup target. |
| nf_status | varchar(20) | Sim | - | '' | Status/etapa de nf status. |
| contas_status | varchar(20) | Sim | - | '' | Status/etapa de contas status. |
| google_rating | varchar(32) | Sim | - | '' | Campo do dominio `recepcao_checklist_daily` referente a google rating. |
| google_comments | text | Sim | - | - | Campo do dominio `recepcao_checklist_daily` referente a google comments. |
| pendencias_urgentes | text | Sim | - | - | Campo do dominio `recepcao_checklist_daily` referente a pendencias urgentes. |
| situacoes_criticas | text | Sim | - | - | Campo do dominio `recepcao_checklist_daily` referente a situacoes criticas. |
| situacao_prazo | varchar(10) | Sim | - | - | Campo do dominio `recepcao_checklist_daily` referente a situacao prazo. |
| situacao_responsavel | varchar(120) | Sim | - | - | Campo do dominio `recepcao_checklist_daily` referente a situacao responsavel. |
| acoes_realizadas | text | Sim | - | - | Campo do dominio `recepcao_checklist_daily` referente a acoes realizadas. |
| updated_at | text | Sim | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `recepcao_checklist_manual`

- Finalidade: Lancamentos manuais complementares da recepcao.
- Origem da informacao: Lancamento manual no painel para checklist operacional.
- Escrita/manutencao tecnica: Escrita principal garantida por rota API em `apps/painel/src/app/api/admin/checklist/recepcao/route.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `1`
- Chave primaria: `scope_key`
- Indices: PRIMARY (scope_key) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/painel/src/app/api/admin/checklist/recepcao/route.ts`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/01-visao-funcional-e-indicadores.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| scope_key | varchar(50) | Nao | PK | - | Campo do dominio `recepcao_checklist_manual` referente a scope key. |
| meta_resolve_target | int | Sim | - | 0 | Campo do dominio `recepcao_checklist_manual` referente a meta resolve target. |
| meta_checkup_target | int | Sim | - | 0 | Campo do dominio `recepcao_checklist_manual` referente a meta checkup target. |
| nf_status | varchar(20) | Sim | - | '' | Status/etapa de nf status. |
| contas_status | varchar(20) | Sim | - | '' | Status/etapa de contas status. |
| google_rating | varchar(32) | Sim | - | '' | Campo do dominio `recepcao_checklist_manual` referente a google rating. |
| google_comments | text | Sim | - | - | Campo do dominio `recepcao_checklist_manual` referente a google comments. |
| pendencias_urgentes | text | Sim | - | - | Campo do dominio `recepcao_checklist_manual` referente a pendencias urgentes. |
| situacoes_criticas | text | Sim | - | - | Campo do dominio `recepcao_checklist_manual` referente a situacoes criticas. |
| situacao_prazo | varchar(10) | Sim | - | - | Campo do dominio `recepcao_checklist_manual` referente a situacao prazo. |
| situacao_responsavel | varchar(120) | Sim | - | - | Campo do dominio `recepcao_checklist_manual` referente a situacao responsavel. |
| acoes_realizadas | text | Sim | - | - | Campo do dominio `recepcao_checklist_manual` referente a acoes realizadas. |
| updated_at | text | Sim | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `recepcao_historico`

- Finalidade: Historico operacional da fila/recepcao.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/database_manager.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `10605`
- Chave primaria: `hash_id`
- Indices: PRIMARY (hash_id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/database_manager.py`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/01-visao-funcional-e-indicadores.md, apps/painel/docs/database/05-matriz-de-escrita-e-consumo.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| hash_id | varchar(191) | Nao | PK | - | Identificador de hash usado para relacionar ou localizar o registro na origem/aplicacao. |
| id_externo | bigint | Sim | - | - | Campo do dominio `recepcao_historico` referente a identificador externo. |
| unidade_id | bigint | Sim | - | - | Identificador de unidade usado para relacionar ou localizar o registro na origem/aplicacao. |
| unidade_nome | text | Sim | - | - | Campo do dominio `recepcao_historico` referente a unidade nome. |
| paciente_nome | text | Sim | - | - | Campo do dominio `recepcao_historico` referente a paciente nome. |
| dt_chegada | text | Sim | - | - | Data/hora de chegada. |
| dt_atendimento | text | Sim | - | - | Data/hora de atendimento. |
| status | text | Sim | - | - | Status operacional/negocial atual do registro. |
| dia_referencia | text | Sim | - | - | Campo do dominio `recepcao_historico` referente a dia referencia. |
| updated_at | text | Sim | - | - | Data/hora da ultima atualizacao local do registro. |

---

## Comercial, agenda, faturamento, custos e repasses

### `custo_analitico`

- Finalidade: Base analitica detalhada de custos.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_custo.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `5389`
- Chave primaria: nao declarada no schema vivo
- Indices: nenhum indice identificado em `information_schema.statistics`
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencias documentais: `apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/04-guia-de-integracao-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md, apps/painel/docs/database/README.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| record_type | text | Sim | - | - | Campo do dominio `custo_analitico` referente a record type. |
| invoice_id | bigint | Sim | - | - | Identificador de invoice usado para relacionar ou localizar o registro na origem/aplicacao. |
| movement_id | double | Sim | - | - | Identificador de movement usado para relacionar ou localizar o registro na origem/aplicacao. |
| tipo_conta | double | Sim | - | - | Campo do dominio `custo_analitico` referente a tipo conta. |
| conta_id | double | Sim | - | - | Identificador de conta usado para relacionar ou localizar o registro na origem/aplicacao. |
| valor | double | Sim | - | - | Campo do dominio `custo_analitico` referente a valor. |
| descricao | text | Sim | - | - | Campo do dominio `custo_analitico` referente a descricao. |
| responsavel | text | Sim | - | - | Campo do dominio `custo_analitico` referente a responsavel. |
| nfe | double | Sim | - | - | Campo do dominio `custo_analitico` referente a nfe. |
| data | text | Sim | - | - | Campo do dominio `custo_analitico` referente a data. |
| data_nfe | text | Sim | - | - | Campo do dominio `custo_analitico` referente a data nfe. |
| pagamento_id | double | Sim | - | - | Identificador de pagamento usado para relacionar ou localizar o registro na origem/aplicacao. |
| forma_pagamento | double | Sim | - | - | Campo do dominio `custo_analitico` referente a forma pagamento. |
| tipo_conta_destino | double | Sim | - | - | Campo do dominio `custo_analitico` referente a tipo conta destino. |
| conta_id_destino | double | Sim | - | - | Campo do dominio `custo_analitico` referente a conta identificador destino. |
| parcelas | double | Sim | - | - | Campo do dominio `custo_analitico` referente a parcelas. |
| bandeira_id | double | Sim | - | - | Identificador de bandeira usado para relacionar ou localizar o registro na origem/aplicacao. |
| transacao_numero | text | Sim | - | - | Campo do dominio `custo_analitico` referente a transacao numero. |
| transacao_autorizacao | text | Sim | - | - | Campo do dominio `custo_analitico` referente a transacao autorizacao. |
| transacao_parcelas | double | Sim | - | - | Campo do dominio `custo_analitico` referente a transacao parcelas. |
| item_id | double | Sim | - | - | Identificador do item/card da origem. |
| agendamento_id | double | Sim | - | - | Identificador de agendamento usado para relacionar ou localizar o registro na origem/aplicacao. |
| procedimento_id | double | Sim | - | - | Identificador de procedimento usado para relacionar ou localizar o registro na origem/aplicacao. |
| tipo | text | Sim | - | - | Campo do dominio `custo_analitico` referente a tipo. |
| desconto | double | Sim | - | - | Campo do dominio `custo_analitico` referente a desconto. |
| acrescimo | double | Sim | - | - | Campo do dominio `custo_analitico` referente a acrescimo. |
| quantidade | double | Sim | - | - | Campo do dominio `custo_analitico` referente a quantidade. |
| is_executado | text | Sim | - | - | Indicador logico relacionado a executado. |
| is_cancelado | text | Sim | - | - | Indicador logico relacionado a cancelado. |
| executante_id | double | Sim | - | - | Identificador de executante usado para relacionar ou localizar o registro na origem/aplicacao. |
| associacao_executante_id | double | Sim | - | - | Identificador de associacao executante usado para relacionar ou localizar o registro na origem/aplicacao. |
| pacote_id | double | Sim | - | - | Identificador de pacote usado para relacionar ou localizar o registro na origem/aplicacao. |
| centro_custo_id | double | Sim | - | - | Identificador de centro custo usado para relacionar ou localizar o registro na origem/aplicacao. |
| categoria_id | double | Sim | - | - | Identificador de categoria usado para relacionar ou localizar o registro na origem/aplicacao. |
| updated_at | text | Sim | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `custo_resumo_diario`

- Finalidade: Materializacao diaria de custos agregados.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_custo.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `11`
- Chave primaria: `data_ref, forma_pagamento, tipo_conta, tipo_conta_destino`
- Indices: PRIMARY (data_ref, forma_pagamento, tipo_conta, tipo_conta_destino) [UNQ]; idx_custo_resumo_diario_data (data_ref)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_custo.py`
- Evidencias documentais: `apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/04-guia-de-integracao-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md, apps/painel/docs/database/06-contratos-operacionais-por-dominio.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| data_ref | varchar(191) | Nao | PK | - | Data de referencia usada para agregacao ou competencia. |
| forma_pagamento | varchar(191) | Nao | PK | - | Campo do dominio `custo_resumo_diario` referente a forma pagamento. |
| tipo_conta | varchar(191) | Nao | PK | - | Campo do dominio `custo_resumo_diario` referente a tipo conta. |
| tipo_conta_destino | varchar(191) | Nao | PK | - | Campo do dominio `custo_resumo_diario` referente a tipo conta destino. |
| total_valor | double | Sim | - | - | Quantidade/contagem referente a total valor. |
| qtd | bigint | Sim | - | - | Campo do dominio `custo_resumo_diario` referente a qtd. |
| updated_at | text | Sim | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `custo_resumo_mensal`

- Finalidade: Materializacao mensal de custos agregados.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_custo.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `2`
- Chave primaria: `month_ref, forma_pagamento, tipo_conta, tipo_conta_destino`
- Indices: PRIMARY (month_ref, forma_pagamento, tipo_conta, tipo_conta_destino) [UNQ]; idx_custo_resumo_mensal_month (month_ref)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_custo.py`
- Evidencias documentais: `apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/04-guia-de-integracao-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md, apps/painel/docs/database/06-contratos-operacionais-por-dominio.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| month_ref | varchar(191) | Nao | PK | - | Mes/competencia de referencia. |
| forma_pagamento | varchar(191) | Nao | PK | - | Campo do dominio `custo_resumo_mensal` referente a forma pagamento. |
| tipo_conta | varchar(191) | Nao | PK | - | Campo do dominio `custo_resumo_mensal` referente a tipo conta. |
| tipo_conta_destino | varchar(191) | Nao | PK | - | Campo do dominio `custo_resumo_mensal` referente a tipo conta destino. |
| total_valor | double | Sim | - | - | Quantidade/contagem referente a total valor. |
| qtd | bigint | Sim | - | - | Campo do dominio `custo_resumo_mensal` referente a qtd. |
| updated_at | text | Sim | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `faturamento_analitico`

- Finalidade: Base analitica detalhada de faturamento/pagamentos do Feegow.
- Origem da informacao: Scraping/fluxo web Feegow de faturamento.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_faturamento_scraping.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `527699`
- Chave primaria: nao declarada no schema vivo
- Indices: uq_faturamento_analitico_line_key_hash (line_key_hash) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencias documentais: `apps/painel/docs/09-plano-tecnico-marketing-funil.md, apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/05-runbook-operacional.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| data_de_referência | text | Sim | - | - | Campo do dominio `faturamento_analitico` referente a data de referência. |
| data_do_pagamento | text | Sim | - | - | Campo do dominio `faturamento_analitico` referente a data do pagamento. |
| data_removida | text | Sim | - | - | Campo do dominio `faturamento_analitico` referente a data removida. |
| forma_de_pagamento | text | Sim | - | - | Campo do dominio `faturamento_analitico` referente a forma de pagamento. |
| tipo | text | Sim | - | - | Campo do dominio `faturamento_analitico` referente a tipo. |
| desconto | double | Sim | - | - | Campo do dominio `faturamento_analitico` referente a desconto. |
| acréscimo | double | Sim | - | - | Campo do dominio `faturamento_analitico` referente a acréscimo. |
| valor_produzido | double | Sim | - | - | Campo do dominio `faturamento_analitico` referente a valor produzido. |
| total_bruto | double | Sim | - | - | Quantidade/contagem referente a total bruto. |
| total_pago | double | Sim | - | - | Quantidade/contagem referente a total pago. |
| paciente | text | Sim | - | - | Campo do dominio `faturamento_analitico` referente a paciente. |
| procedimento | text | Sim | - | - | Campo do dominio `faturamento_analitico` referente a procedimento. |
| usuário_que_agendou | text | Sim | - | - | Campo do dominio `faturamento_analitico` referente a usuário que agendou. |
| tipo_do_procedimento | text | Sim | - | - | Campo do dominio `faturamento_analitico` referente a tipo do procedimento. |
| grupo | text | Sim | - | - | Campo do dominio `faturamento_analitico` referente a grupo. |
| unidade | text | Sim | - | - | Campo do dominio `faturamento_analitico` referente a unidade. |
| prontuário | double | Sim | - | - | Campo do dominio `faturamento_analitico` referente a prontuário. |
| updated_at | text | Sim | - | - | Data/hora da ultima atualizacao local do registro. |
| usuario_da_conta | text | Sim | - | - | Campo do dominio `faturamento_analitico` referente a usuario da conta. |
| data_do_pagamento_original | text | Sim | - | - | Campo do dominio `faturamento_analitico` referente a data do pagamento original. |
| line_key_hash | varchar(32) | Sim | UNQ | - | Campo do dominio `faturamento_analitico` referente a line key hash. |

---

### `faturamento_backfill_checkpoint`

- Finalidade: Checkpoint do backfill historico de faturamento.
- Origem da informacao: Scraping/fluxo web Feegow de faturamento.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_faturamento_scraping_2025.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `46`
- Chave primaria: `year, month`
- Indices: PRIMARY (year, month) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_faturamento_scraping_2025.py`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/05-runbook-operacional.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| year | bigint | Nao | PK | - | Campo do dominio `faturamento_backfill_checkpoint` referente a year. |
| month | bigint | Nao | PK | - | Campo do dominio `faturamento_backfill_checkpoint` referente a month. |
| completed_at | text | Sim | - | - | Data/hora de conclusao do processamento. |

---

### `faturamento_resumo_diario`

- Finalidade: Materializacao diaria de faturamento agregada.
- Origem da informacao: Scraping/fluxo web Feegow de faturamento.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_faturamento_scraping.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `213376`
- Chave primaria: `data_ref, unidade, grupo, procedimento_key`
- Indices: PRIMARY (data_ref, unidade, grupo, procedimento_key) [UNQ]; idx_fat_resumo_diario_data (data_ref); idx_fat_resumo_diario_data_grupo (data_ref, grupo); idx_fat_resumo_diario_data_unidade (data_ref, unidade); idx_fat_resumo_diario_grupo (grupo); idx_fat_resumo_diario_proc (procedimento); idx_fat_resumo_diario_unidade (unidade)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_faturamento_scraping_2025.py`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/05-runbook-operacional.md, apps/painel/docs/01-visao-funcional-e-indicadores.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| data_ref | varchar(191) | Nao | PK | - | Data de referencia usada para agregacao ou competencia. |
| unidade | varchar(191) | Nao | PK | - | Campo do dominio `faturamento_resumo_diario` referente a unidade. |
| grupo | varchar(191) | Nao | PK | - | Campo do dominio `faturamento_resumo_diario` referente a grupo. |
| procedimento | varchar(191) | Nao | IDX | - | Campo do dominio `faturamento_resumo_diario` referente a procedimento. |
| total_pago | double | Sim | - | - | Quantidade/contagem referente a total pago. |
| qtd | bigint | Sim | - | - | Campo do dominio `faturamento_resumo_diario` referente a qtd. |
| updated_at | text | Sim | - | - | Data/hora da ultima atualizacao local do registro. |
| procedimento_key | varchar(32) | Nao | PK | '' | Campo do dominio `faturamento_resumo_diario` referente a procedimento key. |

---

### `faturamento_resumo_mensal`

- Finalidade: Materializacao mensal de faturamento agregada.
- Origem da informacao: Scraping/fluxo web Feegow de faturamento.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_faturamento_scraping.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `35211`
- Chave primaria: `month_ref, unidade, grupo, procedimento_key`
- Indices: PRIMARY (month_ref, unidade, grupo, procedimento_key) [UNQ]; idx_fat_resumo_mensal_grupo (grupo); idx_fat_resumo_mensal_month (month_ref); idx_fat_resumo_mensal_month_grupo (month_ref, grupo); idx_fat_resumo_mensal_month_unidade (month_ref, unidade); idx_fat_resumo_mensal_proc (procedimento); idx_fat_resumo_mensal_unidade (unidade)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_faturamento_scraping_2025.py`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/05-runbook-operacional.md, apps/painel/docs/01-visao-funcional-e-indicadores.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| month_ref | varchar(191) | Nao | PK | - | Mes/competencia de referencia. |
| unidade | varchar(191) | Nao | PK | - | Campo do dominio `faturamento_resumo_mensal` referente a unidade. |
| grupo | varchar(191) | Nao | PK | - | Campo do dominio `faturamento_resumo_mensal` referente a grupo. |
| procedimento | varchar(191) | Nao | IDX | - | Campo do dominio `faturamento_resumo_mensal` referente a procedimento. |
| total_pago | double | Sim | - | - | Quantidade/contagem referente a total pago. |
| qtd | bigint | Sim | - | - | Campo do dominio `faturamento_resumo_mensal` referente a qtd. |
| updated_at | text | Sim | - | - | Data/hora da ultima atualizacao local do registro. |
| procedimento_key | varchar(32) | Nao | PK | '' | Campo do dominio `faturamento_resumo_mensal` referente a procedimento key. |

---

### `feegow_appointments`

- Finalidade: Base transacional de agendamentos importados da Feegow.
- Origem da informacao: Feegow API de agendamentos.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_feegow_appointments.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `413351`
- Chave primaria: `appointment_id`
- Indices: PRIMARY (appointment_id) [UNQ]
- Vinculos principais: patient_id -> feegow_patients.patient_id (vinculo logico)
- Evidencia de criacao/garantia de schema: `workers/worker_feegow_appointments.py`
- Evidencias documentais: `apps/painel/docs/09-plano-tecnico-marketing-funil.md, apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/05-runbook-operacional.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| appointment_id | bigint | Nao | PK | - | Identificador do agendamento na origem transacional. |
| date | text | Sim | - | - | Data principal do evento/medicao. |
| status_id | bigint | Sim | - | - | Identificador de status usado para relacionar ou localizar o registro na origem/aplicacao. |
| value | double | Sim | - | - | Valor monetario ou numerico referente a value. |
| specialty | text | Sim | - | - | Campo do dominio `feegow_appointments` referente a specialty. |
| professional_name | text | Sim | - | - | Nome do profissional exibido/normalizado para consumo no painel. |
| procedure_group | text | Sim | - | - | Grupo/categoria do procedimento para analise gerencial. |
| scheduled_by | text | Sim | - | - | Campo do dominio `feegow_appointments` referente a scheduled by. |
| unit_name | text | Sim | - | - | Nome da unidade exibido/normalizado para consumo no painel. |
| updated_at | text | Sim | - | - | Data/hora da ultima atualizacao local do registro. |
| scheduled_at | text | Sim | - | - | Data/hora em que o agendamento/evento foi criado na origem. |
| patient_id | int | Sim | - | - | Identificador do paciente na origem transacional. |
| procedure_id | int | Sim | - | - | Identificador do procedimento na origem. |
| procedure_name | text | Sim | - | - | Nome do procedimento associado ao registro. |
| first_appointment_flag | int | Sim | - | - | Indicador logico relacionado a first appointment. |

---

### `feegow_appointments_backfill_checkpoint`

- Finalidade: Checkpoint do backfill historico de agendamentos.
- Origem da informacao: Feegow API de agendamentos.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_feegow_appointments_backfill.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `52`
- Chave primaria: `year, month`
- Indices: PRIMARY (year, month) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_feegow_appointments_backfill.py`
- Evidencias documentais: `apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| year | int | Nao | PK | - | Campo do dominio `feegow_appointments_backfill_checkpoint` referente a year. |
| month | int | Nao | PK | - | Campo do dominio `feegow_appointments_backfill_checkpoint` referente a month. |
| from_date | date | Sim | - | - | Data de from. |
| to_date | date | Sim | - | - | Data de to. |
| rows_saved | int | Sim | - | - | Campo do dominio `feegow_appointments_backfill_checkpoint` referente a rows saved. |
| completed_at | datetime | Sim | - | - | Data/hora de conclusao do processamento. |

---

### `feegow_contracts`

- Finalidade: Base de contratos/procedimentos/itens comerciais importados do Feegow.
- Origem da informacao: Feegow web/API no fluxo de contratos.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_contracts.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `17904`
- Chave primaria: `registration_number`
- Indices: PRIMARY (registration_number) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_contracts.py`
- Evidencias documentais: `apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/01-visao-funcional-e-indicadores.md, apps/painel/docs/database/05-matriz-de-escrita-e-consumo.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| registration_number | varchar(191) | Nao | PK | - | Campo do dominio `feegow_contracts` referente a registration number. |
| contract_id | text | Sim | - | - | Identificador de contract usado para relacionar ou localizar o registro na origem/aplicacao. |
| created_at | text | Sim | - | - | Data/hora de criacao do registro no painel. |
| start_date | text | Sim | - | - | Data de start. |
| patient_name | text | Sim | - | - | Nome de patient utilizado para exibicao, filtro ou agrupamento. |
| plan_name | text | Sim | - | - | Nome de plan utilizado para exibicao, filtro ou agrupamento. |
| status_contract | text | Sim | - | - | Status/etapa de status contract. |
| status_financial | text | Sim | - | - | Status/etapa de status financial. |
| recurrence_value | double | Sim | - | - | Valor monetario ou numerico referente a recurrence value. |
| membership_value | double | Sim | - | - | Valor monetario ou numerico referente a membership value. |
| updated_at | text | Sim | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `feegow_patient_contacts_cache`

- Finalidade: Cache local de contatos de pacientes Feegow.
- Origem da informacao: Feegow API/modulo comercial.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_proposals.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `4155`
- Chave primaria: `patient_id`
- Indices: PRIMARY (patient_id) [UNQ]
- Vinculos principais: patient_id -> feegow_patients.patient_id (vinculo logico)
- Evidencia de criacao/garantia de schema: `workers/worker_proposals.py`
- Evidencias documentais: `apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/05-matriz-de-escrita-e-consumo.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| patient_id | int | Nao | PK | - | Identificador do paciente na origem transacional. |
| patient_name | text | Sim | - | - | Nome de patient utilizado para exibicao, filtro ou agrupamento. |
| phone_primary | text | Sim | - | - | Campo do dominio `feegow_patient_contacts_cache` referente a phone primary. |
| email_primary | text | Sim | - | - | Campo do dominio `feegow_patient_contacts_cache` referente a email primary. |
| cpf | text | Sim | - | - | Campo do dominio `feegow_patient_contacts_cache` referente a cpf. |
| updated_at | text | Sim | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `feegow_patients`

- Finalidade: Cadastro de pacientes sincronizado a partir da Feegow.
- Origem da informacao: Feegow API de pacientes.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_feegow_patients.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `246924`
- Chave primaria: `patient_id`
- Indices: PRIMARY (patient_id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_feegow_patients.py`
- Evidencias documentais: `apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/05-runbook-operacional.md, apps/painel/docs/01-visao-funcional-e-indicadores.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| patient_id | int | Nao | PK | - | Identificador do paciente na origem transacional. |
| nome | text | Sim | - | - | Campo do dominio `feegow_patients` referente a nome. |
| nome_social | text | Sim | - | - | Campo do dominio `feegow_patients` referente a nome social. |
| nascimento | text | Sim | - | - | Campo do dominio `feegow_patients` referente a nascimento. |
| bairro | text | Sim | - | - | Campo do dominio `feegow_patients` referente a bairro. |
| tabela_id | int | Sim | - | - | Identificador de tabela usado para relacionar ou localizar o registro na origem/aplicacao. |
| sexo_id | int | Sim | - | - | Identificador de sexo usado para relacionar ou localizar o registro na origem/aplicacao. |
| email | text | Sim | - | - | Endereco de e-mail associado ao registro. |
| celular | text | Sim | - | - | Campo do dominio `feegow_patients` referente a celular. |
| criado_em | text | Sim | - | - | Campo do dominio `feegow_patients` referente a criado em. |
| alterado_em | text | Sim | - | - | Campo do dominio `feegow_patients` referente a alterado em. |
| programa_saude_json | text | Sim | - | - | Conteudo estruturado em JSON relacionado a programa saude. |
| payload_json | text | Sim | - | - | Payload bruto ou quase bruto em JSON para auditoria/reprocessamento. |
| updated_at | text | Sim | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `feegow_patients_sync_state`

- Finalidade: Estado tecnico da sincronizacao de pacientes Feegow.
- Origem da informacao: Feegow API de pacientes.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_feegow_patients.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `3`
- Chave primaria: `sync_key`
- Indices: PRIMARY (sync_key) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_feegow_patients.py`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md, apps/painel/docs/database/07-mapa-api-rotas-tabelas.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| sync_key | varchar(100) | Nao | PK | - | Campo do dominio `feegow_patients_sync_state` referente a sync key. |
| sync_value | text | Sim | - | - | Valor monetario ou numerico referente a sync value. |
| updated_at | text | Sim | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `feegow_procedures_catalog`

- Finalidade: Catalogo de procedimentos importado da Feegow.
- Origem da informacao: Feegow API/catalogo de procedimentos.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_feegow_procedures.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `3353`
- Chave primaria: `procedimento_id`
- Indices: PRIMARY (procedimento_id) [UNQ]; idx_feegow_procedures_catalog_nome (nome)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_feegow_procedures.py`
- Evidencias documentais: `apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/05-runbook-operacional.md, apps/painel/docs/database/05-matriz-de-escrita-e-consumo.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| procedimento_id | bigint | Nao | PK | - | Identificador de procedimento usado para relacionar ou localizar o registro na origem/aplicacao. |
| nome | varchar(255) | Nao | IDX | - | Campo do dominio `feegow_procedures_catalog` referente a nome. |
| codigo | varchar(80) | Sim | - | - | Campo do dominio `feegow_procedures_catalog` referente a codigo. |
| tipo_procedimento | int | Sim | - | - | Campo do dominio `feegow_procedures_catalog` referente a tipo procedimento. |
| grupo_procedimento | int | Sim | - | - | Campo do dominio `feegow_procedures_catalog` referente a grupo procedimento. |
| valor | decimal(12,2) | Nao | - | 0.00 | Campo do dominio `feegow_procedures_catalog` referente a valor. |
| especialidades_json | longtext | Sim | - | - | Conteudo estruturado em JSON relacionado a especialidades. |
| raw_json | longtext | Sim | - | - | Conteudo estruturado em JSON relacionado a raw. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `feegow_proposals`

- Finalidade: Base operacional de propostas/comercial importadas da Feegow.
- Origem da informacao: Feegow API/modulo comercial.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_proposals.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `15625`
- Chave primaria: `proposal_id`
- Indices: PRIMARY (proposal_id) [UNQ]; idx_prop_date (date); idx_prop_patient (patient_id); idx_prop_status (status); idx_prop_unit (unit_name)
- Vinculos principais: patient_id -> feegow_patients.patient_id (vinculo logico)
- Evidencia de criacao/garantia de schema: `workers/worker_proposals.py`
- Evidencias documentais: `apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/01-visao-funcional-e-indicadores.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| proposal_id | bigint | Nao | PK | - | Identificador de proposal usado para relacionar ou localizar o registro na origem/aplicacao. |
| date | varchar(191) | Sim | IDX | - | Data principal do evento/medicao. |
| status | text | Sim | IDX | - | Status operacional/negocial atual do registro. |
| unit_name | varchar(191) | Sim | IDX | - | Nome da unidade exibido/normalizado para consumo no painel. |
| professional_name | text | Sim | - | - | Nome do profissional exibido/normalizado para consumo no painel. |
| total_value | double | Sim | - | - | Quantidade/contagem referente a total value. |
| items_json | text | Sim | - | - | Conteudo estruturado em JSON relacionado a items. |
| updated_at | text | Sim | - | - | Data/hora da ultima atualizacao local do registro. |
| patient_id | int | Sim | IDX | - | Identificador do paciente na origem transacional. |
| proposal_last_update | text | Sim | - | - | Campo do dominio `feegow_proposals` referente a proposal last update. |

---

### `feegow_repasse_a_conferir`

- Finalidade: Base detalhada de linhas de repasse para conferencia.
- Origem da informacao: Integracao Feegow.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_consolidacao_profissionais.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `3864`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_repasse_conferir_detail_status (detail_status); idx_repasse_conferir_exec_date (execution_date); idx_repasse_conferir_period_prof (period_ref, professional_id); idx_repasse_conferir_status (detail_status); source_row_hash (source_row_hash) [UNQ]
- Vinculos principais: professional_id -> professionals.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `workers/worker_consolidacao_profissionais.py`
- Evidencias documentais: `apps/painel/docs/07-plano-tecnico-repasses.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/04-guia-de-integracao-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| period_ref | varchar(7) | Nao | IDX | - | Competencia ou periodo de referencia do registro. |
| professional_id | varchar(64) | Nao | - | - | Identificador do profissional relacionado ao registro. |
| professional_name | varchar(180) | Nao | - | - | Nome do profissional exibido/normalizado para consumo no painel. |
| invoice_id | varchar(64) | Sim | - | - | Identificador de invoice usado para relacionar ou localizar o registro na origem/aplicacao. |
| execution_date | varchar(32) | Sim | IDX | - | Data de execution. |
| patient_name | varchar(180) | Sim | - | - | Nome de patient utilizado para exibicao, filtro ou agrupamento. |
| unit_name | varchar(120) | Sim | - | - | Nome da unidade exibido/normalizado para consumo no painel. |
| account_date | varchar(32) | Sim | - | - | Data de account. |
| requester_name | varchar(180) | Sim | - | - | Nome de requester utilizado para exibicao, filtro ou agrupamento. |
| specialty_name | varchar(180) | Sim | - | - | Nome de specialty utilizado para exibicao, filtro ou agrupamento. |
| procedure_name | varchar(255) | Sim | - | - | Nome do procedimento associado ao registro. |
| attendance_value | decimal(14,2) | Nao | - | - | Valor monetario ou numerico referente a attendance value. |
| detail_status | varchar(32) | Sim | IDX | - | Status/etapa de detail status. |
| detail_status_text | varchar(255) | Sim | - | - | Status/etapa de detail status text. |
| role_code | varchar(32) | Sim | - | - | Codigo de role na origem ou em regra de negocio. |
| role_name | varchar(120) | Sim | - | - | Nome de role utilizado para exibicao, filtro ou agrupamento. |
| detail_professional_name | varchar(180) | Sim | - | - | Nome de detail professional utilizado para exibicao, filtro ou agrupamento. |
| detail_repasse_value | decimal(14,2) | Nao | - | - | Valor monetario ou numerico referente a detail repasse value. |
| executante_option_value | varchar(64) | Sim | - | - | Valor monetario ou numerico referente a executante option value. |
| executante_option_title | varchar(255) | Sim | - | - | Campo do dominio `feegow_repasse_a_conferir` referente a executante option title. |
| source_row_hash | varchar(64) | Nao | UNQ | - | Campo do dominio `feegow_repasse_a_conferir` referente a source row hash. |
| is_active | int | Nao | - | - | Indicador logico de atividade do registro. |
| last_job_id | varchar(64) | Sim | - | - | Identificador de last job usado para relacionar ou localizar o registro na origem/aplicacao. |
| created_at | varchar(32) | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `feegow_repasse_consolidado`

- Finalidade: Base consolidada de repasse por profissional/competencia.
- Origem da informacao: Dados Feegow/web usados na apuracao de repasses.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_repasse_consolidado.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `2475`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_repasse_consolidado_data_exec (data_exec); idx_repasse_consolidado_period_prof (period_ref, professional_id); source_row_hash (source_row_hash) [UNQ]
- Vinculos principais: professional_id -> professionals.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `workers/worker_repasse_consolidado.py`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/05-runbook-operacional.md, apps/painel/docs/07-plano-tecnico-repasses.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| period_ref | varchar(7) | Nao | IDX | - | Competencia ou periodo de referencia do registro. |
| professional_id | varchar(64) | Nao | - | - | Identificador do profissional relacionado ao registro. |
| professional_name | varchar(180) | Nao | - | - | Nome do profissional exibido/normalizado para consumo no painel. |
| data_exec | varchar(32) | Nao | IDX | - | Campo do dominio `feegow_repasse_consolidado` referente a data exec. |
| paciente | varchar(180) | Nao | - | - | Campo do dominio `feegow_repasse_consolidado` referente a paciente. |
| descricao | varchar(255) | Nao | - | - | Campo do dominio `feegow_repasse_consolidado` referente a descricao. |
| funcao | varchar(120) | Nao | - | - | Campo do dominio `feegow_repasse_consolidado` referente a funcao. |
| convenio | varchar(180) | Nao | - | - | Campo do dominio `feegow_repasse_consolidado` referente a convenio. |
| repasse_value | decimal(14,2) | Nao | - | - | Valor monetario ou numerico referente a repasse value. |
| source_row_hash | varchar(64) | Nao | UNQ | - | Campo do dominio `feegow_repasse_consolidado` referente a source row hash. |
| is_active | int | Nao | - | - | Indicador logico de atividade do registro. |
| last_job_id | varchar(64) | Sim | - | - | Identificador de last job usado para relacionar ou localizar o registro na origem/aplicacao. |
| created_at | varchar(32) | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `proposal_followup_control`

- Finalidade: Controle manual de follow-up comercial das propostas.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/proposals/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `proposal_id`
- Indices: PRIMARY (proposal_id) [UNQ]
- Vinculos principais: proposal_id -> feegow_proposals.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/proposals/repository.ts`
- Evidencias documentais: `apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/01-visao-funcional-e-indicadores.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| proposal_id | bigint | Nao | PK | - | Identificador de proposal usado para relacionar ou localizar o registro na origem/aplicacao. |
| conversion_status | varchar(40) | Sim | - | - | Status/etapa de conversion status. |
| conversion_reason | varchar(64) | Sim | - | - | Campo do dominio `proposal_followup_control` referente a conversion reason. |
| responsible_user_id | varchar(64) | Sim | - | - | Identificador de responsible user usado para relacionar ou localizar o registro na origem/aplicacao. |
| responsible_user_name | text | Sim | - | - | Nome de responsible user utilizado para exibicao, filtro ou agrupamento. |
| updated_by_user_id | varchar(64) | Sim | - | - | Identificador de updated by user usado para relacionar ou localizar o registro na origem/aplicacao. |
| updated_by_user_name | text | Sim | - | - | Nome de updated by user utilizado para exibicao, filtro ou agrupamento. |
| updated_at | text | Sim | - | - | Data/hora da ultima atualizacao local do registro. |
| observation | text | Sim | - | - | Observacao operacional/manual do registro. |
| last_contact_at | text | Sim | - | - | Data/hora referente a last contact. |
| next_contact_at | text | Sim | - | - | Data/hora referente a next contact. |

---

### `repasse_consolidacao_job_items`

- Finalidade: Itens dos jobs de consolidacao de repasse.
- Origem da informacao: Cadastro/manual do painel de profissionais e sincronizacoes auxiliares.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_consolidacao_profissionais.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `238`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_repasse_consol_items_job (job_id); idx_repasse_consol_items_prof (professional_id); idx_repasse_consol_items_status (status); idx_repasse_consolidacao_items_job (job_id); idx_repasse_consolidacao_items_prof (professional_id); idx_repasse_consolidacao_items_status (status)
- Vinculos principais: professional_id -> professionals.id (vinculo logico); job_id -> repasse_consolidacao_jobs.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `workers/worker_consolidacao_profissionais.py`
- Evidencias documentais: `apps/painel/docs/07-plano-tecnico-repasses.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/04-guia-de-integracao-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| job_id | varchar(64) | Nao | IDX | - | Identificador do job/processamento ao qual a linha pertence. |
| professional_id | varchar(64) | Nao | IDX | - | Identificador do profissional relacionado ao registro. |
| professional_name | varchar(180) | Nao | - | - | Nome do profissional exibido/normalizado para consumo no painel. |
| status | varchar(40) | Nao | IDX | - | Status operacional/negocial atual do registro. |
| rows_count | int | Nao | - | - | Quantidade/contagem referente a rows count. |
| total_value | decimal(14,2) | Nao | - | - | Quantidade/contagem referente a total value. |
| error_message | text | Sim | - | - | Mensagem de erro registrada durante processamento. |
| duration_ms | int | Sim | - | - | Campo do dominio `repasse_consolidacao_job_items` referente a duration ms. |
| created_at | varchar(32) | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `repasse_consolidacao_jobs`

- Finalidade: Controle dos jobs de consolidacao de repasse.
- Origem da informacao: Cadastro/manual do painel de profissionais e sincronizacoes auxiliares.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_consolidacao_profissionais.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `9`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_repasse_consol_jobs_created (created_at); idx_repasse_consol_jobs_period (period_ref); idx_repasse_consol_jobs_status (status); idx_repasse_consolidacao_jobs_created (created_at); idx_repasse_consolidacao_jobs_period (period_ref); idx_repasse_consolidacao_jobs_status (status)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_consolidacao_profissionais.py`
- Evidencias documentais: `apps/painel/docs/07-plano-tecnico-repasses.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/04-guia-de-integracao-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| period_ref | varchar(7) | Nao | IDX | - | Competencia ou periodo de referencia do registro. |
| scope | varchar(20) | Nao | - | - | Campo do dominio `repasse_consolidacao_jobs` referente a scope. |
| professional_ids_json | text | Sim | - | - | Conteudo estruturado em JSON relacionado a professional ids. |
| status | varchar(20) | Nao | IDX | - | Status operacional/negocial atual do registro. |
| requested_by | varchar(64) | Nao | - | - | Campo do dominio `repasse_consolidacao_jobs` referente a requested by. |
| started_at | varchar(32) | Sim | - | - | Data/hora referente a started. |
| finished_at | varchar(32) | Sim | - | - | Data/hora referente a finished. |
| error | text | Sim | - | - | Campo do dominio `repasse_consolidacao_jobs` referente a error. |
| created_at | varchar(32) | Nao | IDX | - | Data/hora de criacao do registro no painel. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `repasse_consolidacao_line_marks`

- Finalidade: Marcacoes/flags manuais por linha de repasse.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/repasses/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `5`
- Chave primaria: `period_ref, professional_id, source_row_hash, user_id`
- Indices: PRIMARY (period_ref, professional_id, source_row_hash, user_id) [UNQ]; idx_repasse_consolidacao_line_marks_period_prof (period_ref, professional_id); idx_repasse_consolidacao_line_marks_user (user_id, updated_at)
- Vinculos principais: professional_id -> professionals.id (vinculo logico); user_id -> users.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/repasses/repository.ts`
- Evidencias documentais: `apps/painel/docs/07-plano-tecnico-repasses.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/05-matriz-de-escrita-e-consumo.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| period_ref | varchar(7) | Nao | PK | - | Competencia ou periodo de referencia do registro. |
| professional_id | varchar(64) | Nao | PK | - | Identificador do profissional relacionado ao registro. |
| source_row_hash | varchar(64) | Nao | PK | - | Campo do dominio `repasse_consolidacao_line_marks` referente a source row hash. |
| user_id | varchar(64) | Nao | PK | - | Identificador do usuario relacionado ao registro. |
| color_key | varchar(16) | Nao | - | - | Campo do dominio `repasse_consolidacao_line_marks` referente a color key. |
| note | text | Sim | - | - | Campo do dominio `repasse_consolidacao_line_marks` referente a note. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `repasse_consolidacao_mark_legends`

- Finalidade: Legenda/catalogo das marcacoes de repasse.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/repasses/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `3`
- Chave primaria: `user_id, color_key`
- Indices: PRIMARY (user_id, color_key) [UNQ]; idx_repasse_consolidacao_legends_updated (updated_at)
- Vinculos principais: user_id -> users.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/repasses/repository.ts`
- Evidencias documentais: `apps/painel/docs/07-plano-tecnico-repasses.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/05-matriz-de-escrita-e-consumo.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| user_id | varchar(64) | Nao | PK | - | Identificador do usuario relacionado ao registro. |
| color_key | varchar(16) | Nao | PK | - | Campo do dominio `repasse_consolidacao_mark_legends` referente a color key. |
| label | varchar(120) | Nao | - | - | Campo do dominio `repasse_consolidacao_mark_legends` referente a label. |
| updated_at | varchar(32) | Nao | IDX | - | Data/hora da ultima atualizacao local do registro. |

---

### `repasse_consolidacao_notes`

- Finalidade: Observacoes manuais na consolidacao de repasse.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/repasses/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `1`
- Chave primaria: `period_ref, professional_id`
- Indices: PRIMARY (period_ref, professional_id) [UNQ]; idx_repasse_consolidacao_notes_prof (professional_id)
- Vinculos principais: professional_id -> professionals.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/repasses/repository.ts`
- Evidencias documentais: `apps/painel/docs/07-plano-tecnico-repasses.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/05-matriz-de-escrita-e-consumo.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| period_ref | varchar(7) | Nao | PK | - | Competencia ou periodo de referencia do registro. |
| professional_id | varchar(64) | Nao | PK | - | Identificador do profissional relacionado ao registro. |
| note | text | Sim | - | - | Campo do dominio `repasse_consolidacao_notes` referente a note. |
| internal_note | text | Sim | - | - | Campo do dominio `repasse_consolidacao_notes` referente a internal note. |
| updated_by | varchar(64) | Nao | - | - | Campo do dominio `repasse_consolidacao_notes` referente a updated by. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `repasse_fechamento_manual`

- Finalidade: Fechamentos/confirmacoes manuais de repasse.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/repasses/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `2`
- Chave primaria: `period_ref, professional_id`
- Indices: PRIMARY (period_ref, professional_id) [UNQ]; idx_repasse_fechamento_manual_prof (professional_id)
- Vinculos principais: professional_id -> professionals.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/repasses/repository.ts`
- Evidencias documentais: `apps/painel/docs/07-plano-tecnico-repasses.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/05-matriz-de-escrita-e-consumo.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| period_ref | varchar(7) | Nao | PK | - | Competencia ou periodo de referencia do registro. |
| professional_id | varchar(64) | Nao | PK | - | Identificador do profissional relacionado ao registro. |
| repasse_final_value | decimal(14,2) | Sim | - | - | Valor monetario ou numerico referente a repasse final value. |
| produtividade_value | decimal(14,2) | Sim | - | - | Valor monetario ou numerico referente a produtividade value. |
| updated_by | varchar(64) | Nao | - | - | Campo do dominio `repasse_fechamento_manual` referente a updated by. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `repasse_pdf_artifacts`

- Finalidade: Artefatos/PDFs gerados para repasse.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/repasses/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `2`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_repasse_pdf_artifacts_job (pdf_job_id); idx_repasse_pdf_artifacts_prof (professional_id)
- Vinculos principais: professional_id -> professionals.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/repasses/repository.ts`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/05-runbook-operacional.md, apps/painel/docs/07-plano-tecnico-repasses.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| pdf_job_id | varchar(64) | Nao | IDX | - | Identificador de PDF job usado para relacionar ou localizar o registro na origem/aplicacao. |
| period_ref | varchar(7) | Nao | - | - | Competencia ou periodo de referencia do registro. |
| professional_id | varchar(64) | Nao | IDX | - | Identificador do profissional relacionado ao registro. |
| professional_name | varchar(180) | Nao | - | - | Nome do profissional exibido/normalizado para consumo no painel. |
| storage_provider | varchar(30) | Nao | - | - | Campo do dominio `repasse_pdf_artifacts` referente a storage provider. |
| storage_bucket | varchar(120) | Sim | - | - | Campo do dominio `repasse_pdf_artifacts` referente a storage bucket. |
| storage_key | varchar(255) | Nao | - | - | Campo do dominio `repasse_pdf_artifacts` referente a storage key. |
| file_name | varchar(255) | Nao | - | - | Nome original ou amigavel do arquivo. |
| size_bytes | int | Nao | - | - | Campo do dominio `repasse_pdf_artifacts` referente a size bytes. |
| created_at | varchar(32) | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `repasse_pdf_jobs`

- Finalidade: Controle de jobs de geracao de PDF de repasse.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/repasses/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `11`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_repasse_pdf_jobs_created (created_at); idx_repasse_pdf_jobs_period (period_ref); idx_repasse_pdf_jobs_status (status)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/repasses/repository.ts`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/05-runbook-operacional.md, apps/painel/docs/07-plano-tecnico-repasses.md, apps/painel/docs/database/05-matriz-de-escrita-e-consumo.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| period_ref | varchar(7) | Nao | IDX | - | Competencia ou periodo de referencia do registro. |
| scope | varchar(20) | Nao | - | - | Campo do dominio `repasse_pdf_jobs` referente a scope. |
| professional_ids_json | longtext | Sim | - | - | Conteudo estruturado em JSON relacionado a professional ids. |
| status | varchar(20) | Nao | IDX | - | Status operacional/negocial atual do registro. |
| requested_by | varchar(64) | Nao | - | - | Campo do dominio `repasse_pdf_jobs` referente a requested by. |
| started_at | varchar(32) | Sim | - | - | Data/hora referente a started. |
| finished_at | varchar(32) | Sim | - | - | Data/hora referente a finished. |
| error | text | Sim | - | - | Campo do dominio `repasse_pdf_jobs` referente a error. |
| created_at | varchar(32) | Nao | IDX | - | Data/hora de criacao do registro no painel. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `repasse_professional_notes`

- Finalidade: Observacoes por profissional no modulo de repasses.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/repasses/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `1`
- Chave primaria: `period_ref, professional_id`
- Indices: PRIMARY (period_ref, professional_id) [UNQ]; idx_repasse_prof_notes_prof (professional_id)
- Vinculos principais: professional_id -> professionals.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/repasses/repository.ts`
- Evidencias documentais: `apps/painel/docs/07-plano-tecnico-repasses.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/05-matriz-de-escrita-e-consumo.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| period_ref | varchar(7) | Nao | PK | - | Competencia ou periodo de referencia do registro. |
| professional_id | varchar(64) | Nao | PK | - | Identificador do profissional relacionado ao registro. |
| note | text | Sim | - | - | Campo do dominio `repasse_professional_notes` referente a note. |
| updated_by | varchar(64) | Nao | - | - | Campo do dominio `repasse_professional_notes` referente a updated by. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |
| internal_note | text | Sim | - | - | Campo do dominio `repasse_professional_notes` referente a internal note. |

---

### `repasse_sync_job_items`

- Finalidade: Itens dos jobs de sincronizacao de repasse.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_repasse_consolidado.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `477`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_repasse_sync_items_job (job_id); idx_repasse_sync_items_prof (professional_id); idx_repasse_sync_items_status (status)
- Vinculos principais: professional_id -> professionals.id (vinculo logico); job_id -> repasse_sync_jobs.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `workers/worker_repasse_consolidado.py`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/05-runbook-operacional.md, apps/painel/docs/07-plano-tecnico-repasses.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| job_id | varchar(64) | Nao | IDX | - | Identificador do job/processamento ao qual a linha pertence. |
| professional_id | varchar(64) | Nao | IDX | - | Identificador do profissional relacionado ao registro. |
| professional_name | varchar(180) | Nao | - | - | Nome do profissional exibido/normalizado para consumo no painel. |
| status | varchar(20) | Nao | IDX | - | Status operacional/negocial atual do registro. |
| rows_count | int | Nao | - | - | Quantidade/contagem referente a rows count. |
| total_value | decimal(14,2) | Nao | - | - | Quantidade/contagem referente a total value. |
| error_message | text | Sim | - | - | Mensagem de erro registrada durante processamento. |
| duration_ms | int | Sim | - | - | Campo do dominio `repasse_sync_job_items` referente a duration ms. |
| created_at | varchar(32) | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `repasse_sync_jobs`

- Finalidade: Controle dos jobs de sincronizacao de repasse.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_repasse_consolidado.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `20`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_repasse_sync_jobs_created (created_at); idx_repasse_sync_jobs_period (period_ref); idx_repasse_sync_jobs_status (status)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_repasse_consolidado.py`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/05-runbook-operacional.md, apps/painel/docs/07-plano-tecnico-repasses.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| period_ref | varchar(7) | Nao | IDX | - | Competencia ou periodo de referencia do registro. |
| status | varchar(20) | Nao | IDX | - | Status operacional/negocial atual do registro. |
| requested_by | varchar(64) | Nao | - | - | Campo do dominio `repasse_sync_jobs` referente a requested by. |
| started_at | varchar(32) | Sim | - | - | Data/hora referente a started. |
| finished_at | varchar(32) | Sim | - | - | Data/hora referente a finished. |
| error | text | Sim | - | - | Campo do dominio `repasse_sync_jobs` referente a error. |
| created_at | varchar(32) | Nao | IDX | - | Data/hora de criacao do registro no painel. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |
| scope | varchar(20) | Nao | - | all | Campo do dominio `repasse_sync_jobs` referente a scope. |
| professional_ids_json | text | Sim | - | - | Conteudo estruturado em JSON relacionado a professional ids. |

---

## Marketing, CRM, funil e analytics

### `fact_clinia_ads_daily`

- Finalidade: Fato diario de anuncios/leads Clinia Ads.
- Origem da informacao: Clinia Ads / endpoints analiticos da Clinia.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_clinia_ads.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `3061`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_clinia_ads_fact_date_brand (date_ref, brand_slug); idx_clinia_ads_fact_origin (origin); idx_clinia_ads_fact_source (source_id)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_clinia_ads.py`
- Evidencias documentais: `apps/painel/docs/09-plano-tecnico-marketing-funil.md, apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/12-plano-tecnico-marketing-controle.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| date_ref | varchar(10) | Nao | IDX | - | Campo do dominio `fact_clinia_ads_daily` referente a date referencia. |
| brand_slug | varchar(64) | Nao | - | - | Campo do dominio `fact_clinia_ads_daily` referente a brand slug. |
| origin | varchar(64) | Nao | IDX | - | Campo do dominio `fact_clinia_ads_daily` referente a origin. |
| source_id | varchar(255) | Sim | IDX | - | Identificador de source usado para relacionar ou localizar o registro na origem/aplicacao. |
| source_url | text | Sim | - | - | Campo do dominio `fact_clinia_ads_daily` referente a source URL. |
| source_url_hash | varchar(64) | Nao | - | - | Campo do dominio `fact_clinia_ads_daily` referente a source URL hash. |
| title | varchar(255) | Sim | - | - | Campo do dominio `fact_clinia_ads_daily` referente a title. |
| contacts_received | int | Nao | - | 0 | Campo do dominio `fact_clinia_ads_daily` referente a contacts received. |
| new_contacts_received | int | Nao | - | 0 | Campo do dominio `fact_clinia_ads_daily` referente a new contacts received. |
| appointments_converted | int | Nao | - | 0 | Campo do dominio `fact_clinia_ads_daily` referente a appointments converted. |
| conversion_rate | decimal(10,4) | Nao | - | 0.0000 | Percentual/taxa referente a conversion rate. |
| avg_conversion_time_sec | decimal(14,2) | Nao | - | 0.00 | Campo do dominio `fact_clinia_ads_daily` referente a avg conversion time sec. |
| source_last_sync_at | varchar(32) | Nao | - | - | Data/hora referente a source last sync. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `fact_marketing_funnel_daily`

- Finalidade: Fato principal diario do funil de marketing.
- Origem da informacao: Google Ads, GA4 e mapeamentos de marketing.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_marketing_funnel_google.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `3816`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_fact_mkt_date_brand (date_ref, brand_slug); ux_fact_mkt_funnel_key (date_ref, brand_slug, unit_key, specialty_key, channel_key, campaign_key) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_marketing_funnel_google.py`
- Evidencias documentais: `apps/painel/docs/09-plano-tecnico-marketing-funil.md, apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/12-plano-tecnico-marketing-controle.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| date_ref | varchar(10) | Nao | IDX | - | Campo do dominio `fact_marketing_funnel_daily` referente a date referencia. |
| brand_slug | varchar(64) | Nao | - | - | Campo do dominio `fact_marketing_funnel_daily` referente a brand slug. |
| unit_key | varchar(80) | Nao | - | - | Campo do dominio `fact_marketing_funnel_daily` referente a unit key. |
| specialty_key | varchar(80) | Nao | - | - | Campo do dominio `fact_marketing_funnel_daily` referente a specialty key. |
| channel_key | varchar(120) | Nao | - | - | Campo do dominio `fact_marketing_funnel_daily` referente a channel key. |
| campaign_key | varchar(160) | Nao | - | - | Campo do dominio `fact_marketing_funnel_daily` referente a campaign key. |
| campaign_name | varchar(255) | Sim | - | - | Nome de campaign utilizado para exibicao, filtro ou agrupamento. |
| source | varchar(120) | Sim | - | - | Origem declarada do dado ou do evento. |
| medium | varchar(120) | Sim | - | - | Campo do dominio `fact_marketing_funnel_daily` referente a medium. |
| attribution_rule | varchar(80) | Nao | - | - | Campo do dominio `fact_marketing_funnel_daily` referente a attribution rule. |
| spend | decimal(14,2) | Nao | - | 0.00 | Campo do dominio `fact_marketing_funnel_daily` referente a spend. |
| impressions | int | Nao | - | 0 | Campo do dominio `fact_marketing_funnel_daily` referente a impressions. |
| clicks | int | Nao | - | 0 | Campo do dominio `fact_marketing_funnel_daily` referente a clicks. |
| ctr | decimal(10,4) | Nao | - | 0.0000 | Campo do dominio `fact_marketing_funnel_daily` referente a ctr. |
| cpc | decimal(14,4) | Nao | - | 0.0000 | Campo do dominio `fact_marketing_funnel_daily` referente a cpc. |
| leads | int | Nao | - | 0 | Campo do dominio `fact_marketing_funnel_daily` referente a leads. |
| cpl | decimal(14,4) | Nao | - | 0.0000 | Campo do dominio `fact_marketing_funnel_daily` referente a cpl. |
| appointments | int | Sim | - | - | Campo do dominio `fact_marketing_funnel_daily` referente a appointments. |
| revenue | decimal(14,2) | Sim | - | - | Valor monetario ou numerico referente a revenue. |
| show_rate | decimal(10,4) | Sim | - | - | Percentual/taxa referente a show rate. |
| source_last_sync_at | varchar(32) | Nao | - | - | Data/hora referente a source last sync. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |
| sessions | int | Nao | - | 0 | Campo do dominio `fact_marketing_funnel_daily` referente a sessions. |
| total_users | int | Nao | - | 0 | Quantidade/contagem referente a total users. |
| new_users | int | Nao | - | 0 | Campo do dominio `fact_marketing_funnel_daily` referente a new users. |
| engaged_sessions | int | Nao | - | 0 | Campo do dominio `fact_marketing_funnel_daily` referente a engaged sessions. |
| engagement_rate | decimal(10,4) | Nao | - | 0.0000 | Percentual/taxa referente a engagement rate. |
| avg_session_duration_sec | decimal(14,4) | Nao | - | 0.0000 | Campo do dominio `fact_marketing_funnel_daily` referente a avg session duration sec. |
| page_views | int | Nao | - | 0 | Campo do dominio `fact_marketing_funnel_daily` referente a page views. |
| event_count | int | Nao | - | 0 | Quantidade/contagem referente a event count. |
| session_default_channel_group | varchar(120) | Sim | - | - | Campo do dominio `fact_marketing_funnel_daily` referente a session default channel group. |
| interactions | int | Nao | - | 0 | Campo do dominio `fact_marketing_funnel_daily` referente a interactions. |
| conversions | decimal(14,4) | Nao | - | 0.0000 | Campo do dominio `fact_marketing_funnel_daily` referente a conversions. |
| all_conversions | decimal(14,4) | Nao | - | 0.0000 | Campo do dominio `fact_marketing_funnel_daily` referente a all conversions. |
| conversions_value | decimal(14,4) | Nao | - | 0.0000 | Valor monetario ou numerico referente a conversions value. |
| cost_per_conversion | decimal(14,4) | Nao | - | 0.0000 | Valor monetario ou numerico referente a cost per conversion. |

---

### `fact_marketing_funnel_daily_channel`

- Finalidade: Fato diario do funil por canal.
- Origem da informacao: Google Ads, GA4 e mapeamentos de marketing.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_marketing_funnel_google.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `759`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_fact_mkt_channel_date_brand (date_ref, brand_slug); ux_fact_mkt_channel_key (date_ref, brand_slug, campaign_key, channel_group) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_marketing_funnel_google.py`
- Evidencias documentais: `apps/painel/docs/09-plano-tecnico-marketing-funil.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md, apps/painel/docs/database/07-mapa-api-rotas-tabelas.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| date_ref | varchar(10) | Nao | IDX | - | Campo do dominio `fact_marketing_funnel_daily_channel` referente a date referencia. |
| brand_slug | varchar(64) | Nao | - | - | Campo do dominio `fact_marketing_funnel_daily_channel` referente a brand slug. |
| campaign_key | varchar(160) | Nao | - | - | Campo do dominio `fact_marketing_funnel_daily_channel` referente a campaign key. |
| campaign_name | varchar(255) | Sim | - | - | Nome de campaign utilizado para exibicao, filtro ou agrupamento. |
| channel_group | varchar(120) | Nao | - | - | Campo do dominio `fact_marketing_funnel_daily_channel` referente a channel group. |
| sessions | int | Nao | - | 0 | Campo do dominio `fact_marketing_funnel_daily_channel` referente a sessions. |
| users | int | Nao | - | 0 | Campo do dominio `fact_marketing_funnel_daily_channel` referente a users. |
| leads | int | Nao | - | 0 | Campo do dominio `fact_marketing_funnel_daily_channel` referente a leads. |
| event_count | int | Nao | - | 0 | Quantidade/contagem referente a event count. |
| source_last_sync_at | varchar(32) | Nao | - | - | Data/hora referente a source last sync. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `fact_marketing_funnel_daily_device`

- Finalidade: Fato diario do funil por dispositivo.
- Origem da informacao: Google Ads, GA4 e mapeamentos de marketing.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_marketing_funnel_google.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `4022`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_fact_mkt_device_date_brand (date_ref, brand_slug); ux_fact_mkt_device_key (date_ref, brand_slug, campaign_key, device) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_marketing_funnel_google.py`
- Evidencias documentais: `apps/painel/docs/09-plano-tecnico-marketing-funil.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md, apps/painel/docs/database/07-mapa-api-rotas-tabelas.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| date_ref | varchar(10) | Nao | IDX | - | Campo do dominio `fact_marketing_funnel_daily_device` referente a date referencia. |
| brand_slug | varchar(64) | Nao | - | - | Campo do dominio `fact_marketing_funnel_daily_device` referente a brand slug. |
| campaign_key | varchar(160) | Nao | - | - | Campo do dominio `fact_marketing_funnel_daily_device` referente a campaign key. |
| campaign_name | varchar(255) | Sim | - | - | Nome de campaign utilizado para exibicao, filtro ou agrupamento. |
| device | varchar(60) | Nao | - | - | Campo do dominio `fact_marketing_funnel_daily_device` referente a device. |
| spend | decimal(14,2) | Nao | - | 0.00 | Campo do dominio `fact_marketing_funnel_daily_device` referente a spend. |
| impressions | int | Nao | - | 0 | Campo do dominio `fact_marketing_funnel_daily_device` referente a impressions. |
| clicks | int | Nao | - | 0 | Campo do dominio `fact_marketing_funnel_daily_device` referente a clicks. |
| conversions | decimal(14,4) | Nao | - | 0.0000 | Campo do dominio `fact_marketing_funnel_daily_device` referente a conversions. |
| all_conversions | decimal(14,4) | Nao | - | 0.0000 | Campo do dominio `fact_marketing_funnel_daily_device` referente a all conversions. |
| source_last_sync_at | varchar(32) | Nao | - | - | Data/hora referente a source last sync. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `fact_marketing_funnel_daily_landing_page`

- Finalidade: Fato diario do funil por landing page.
- Origem da informacao: Google Ads, GA4 e mapeamentos de marketing.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_marketing_funnel_google.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `3185`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_fact_mkt_landing_date_brand (date_ref, brand_slug)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_marketing_funnel_google.py`
- Evidencias documentais: `apps/painel/docs/09-plano-tecnico-marketing-funil.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md, apps/painel/docs/database/07-mapa-api-rotas-tabelas.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| date_ref | varchar(10) | Nao | IDX | - | Campo do dominio `fact_marketing_funnel_daily_landing_page` referente a date referencia. |
| brand_slug | varchar(64) | Nao | - | - | Campo do dominio `fact_marketing_funnel_daily_landing_page` referente a brand slug. |
| campaign_key | varchar(160) | Nao | - | - | Campo do dominio `fact_marketing_funnel_daily_landing_page` referente a campaign key. |
| campaign_name | varchar(255) | Sim | - | - | Nome de campaign utilizado para exibicao, filtro ou agrupamento. |
| source | varchar(120) | Sim | - | - | Origem declarada do dado ou do evento. |
| medium | varchar(120) | Sim | - | - | Campo do dominio `fact_marketing_funnel_daily_landing_page` referente a medium. |
| landing_page | text | Nao | - | - | Campo do dominio `fact_marketing_funnel_daily_landing_page` referente a landing page. |
| sessions | int | Nao | - | 0 | Campo do dominio `fact_marketing_funnel_daily_landing_page` referente a sessions. |
| total_users | int | Nao | - | 0 | Quantidade/contagem referente a total users. |
| new_users | int | Nao | - | 0 | Campo do dominio `fact_marketing_funnel_daily_landing_page` referente a new users. |
| engaged_sessions | int | Nao | - | 0 | Campo do dominio `fact_marketing_funnel_daily_landing_page` referente a engaged sessions. |
| leads | int | Nao | - | 0 | Campo do dominio `fact_marketing_funnel_daily_landing_page` referente a leads. |
| event_count | int | Nao | - | 0 | Quantidade/contagem referente a event count. |
| source_last_sync_at | varchar(32) | Nao | - | - | Data/hora referente a source last sync. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `marketing_campaign_mapping`

- Finalidade: Mapeamento/enriquecimento de campanhas de marketing.
- Origem da informacao: Google Ads, GA4 e mapeamentos de marketing.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_marketing_funnel_google.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_mkt_map_brand_active (brand_slug, is_active); idx_mkt_map_priority (priority)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_marketing_funnel_google.py`
- Evidencias documentais: `apps/painel/docs/database/05-matriz-de-escrita-e-consumo.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md, apps/painel/docs/database/06-contratos-operacionais-por-dominio.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| brand_slug | varchar(64) | Nao | IDX | - | Campo do dominio `marketing_campaign_mapping` referente a brand slug. |
| campaign_match_type | varchar(20) | Nao | - | - | Campo do dominio `marketing_campaign_mapping` referente a campaign match type. |
| campaign_match_value | varchar(255) | Nao | - | - | Valor monetario ou numerico referente a campaign match value. |
| unit_key | varchar(80) | Sim | - | - | Campo do dominio `marketing_campaign_mapping` referente a unit key. |
| specialty_key | varchar(80) | Sim | - | - | Campo do dominio `marketing_campaign_mapping` referente a specialty key. |
| channel_key | varchar(120) | Sim | - | - | Campo do dominio `marketing_campaign_mapping` referente a channel key. |
| priority | int | Nao | IDX | 0 | Campo do dominio `marketing_campaign_mapping` referente a priority. |
| is_active | int | Nao | - | 1 | Indicador logico de atividade do registro. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `marketing_funnel_job_items`

- Finalidade: Itens detalhados dos jobs do funil.
- Origem da informacao: Google Ads, GA4 e mapeamentos de marketing.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_marketing_funnel_google.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `17`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_mkt_funnel_item_job (job_id); idx_mkt_funnel_item_status (status)
- Vinculos principais: job_id -> marketing_funnel_jobs.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `workers/worker_marketing_funnel_google.py`
- Evidencias documentais: `apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/05-matriz-de-escrita-e-consumo.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| job_id | varchar(64) | Nao | IDX | - | Identificador do job/processamento ao qual a linha pertence. |
| brand_slug | varchar(64) | Nao | - | - | Campo do dominio `marketing_funnel_job_items` referente a brand slug. |
| ads_customer_id | varchar(64) | Sim | - | - | Identificador de Ads customer usado para relacionar ou localizar o registro na origem/aplicacao. |
| ga4_property_id | varchar(64) | Sim | - | - | Identificador de GA4 property usado para relacionar ou localizar o registro na origem/aplicacao. |
| status | varchar(30) | Nao | IDX | - | Status operacional/negocial atual do registro. |
| records_read | int | Nao | - | 0 | Campo do dominio `marketing_funnel_job_items` referente a records read. |
| records_written | int | Nao | - | 0 | Campo do dominio `marketing_funnel_job_items` referente a records written. |
| error_message | text | Sim | - | - | Mensagem de erro registrada durante processamento. |
| duration_ms | int | Sim | - | - | Campo do dominio `marketing_funnel_job_items` referente a duration ms. |
| created_at | varchar(32) | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `marketing_funnel_jobs`

- Finalidade: Controle dos jobs do funil de marketing.
- Origem da informacao: Google Ads, GA4 e mapeamentos de marketing.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_marketing_funnel_google.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `18`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_mkt_funnel_jobs_created (created_at); idx_mkt_funnel_jobs_status (status)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_marketing_funnel_google.py`
- Evidencias documentais: `apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/12-plano-tecnico-marketing-controle.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/05-matriz-de-escrita-e-consumo.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| status | varchar(20) | Nao | IDX | - | Status operacional/negocial atual do registro. |
| period_ref | varchar(7) | Nao | - | - | Competencia ou periodo de referencia do registro. |
| start_date | varchar(10) | Nao | - | - | Data de start. |
| end_date | varchar(10) | Nao | - | - | Data de end. |
| scope_json | text | Sim | - | - | Conteudo estruturado em JSON relacionado a scope. |
| requested_by | varchar(64) | Nao | - | - | Campo do dominio `marketing_funnel_jobs` referente a requested by. |
| error_message | text | Sim | - | - | Mensagem de erro registrada durante processamento. |
| created_at | varchar(32) | Nao | IDX | - | Data/hora de criacao do registro no painel. |
| started_at | varchar(32) | Sim | - | - | Data/hora referente a started. |
| finished_at | varchar(32) | Sim | - | - | Data/hora referente a finished. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `marketing_google_accounts`

- Finalidade: Cadastro tecnico de contas Google Ads/GA4.
- Origem da informacao: Google Ads, GA4 e mapeamentos de marketing.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_marketing_funnel_google.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `1`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_mkt_google_accounts_active (is_active); idx_mkt_google_accounts_brand (brand_slug)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_marketing_funnel_google.py`
- Evidencias documentais: `apps/painel/docs/database/05-matriz-de-escrita-e-consumo.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md, apps/painel/docs/database/06-contratos-operacionais-por-dominio.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| brand_slug | varchar(64) | Nao | IDX | - | Campo do dominio `marketing_google_accounts` referente a brand slug. |
| ads_customer_id | varchar(64) | Sim | - | - | Identificador de Ads customer usado para relacionar ou localizar o registro na origem/aplicacao. |
| ga4_property_id | varchar(64) | Sim | - | - | Identificador de GA4 property usado para relacionar ou localizar o registro na origem/aplicacao. |
| is_active | int | Nao | IDX | 1 | Indicador logico de atividade do registro. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `raw_clinia_ads_contacts`

- Finalidade: Staging/raw de contatos de anuncios Clinia.
- Origem da informacao: Clinia Ads / endpoints analiticos da Clinia.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_clinia_ads.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `5466`
- Chave primaria: `event_hash`
- Indices: PRIMARY (event_hash) [UNQ]; idx_clinia_ads_raw_date_brand (date_ref, brand_slug); idx_clinia_ads_raw_origin (origin); idx_clinia_ads_raw_source (source_id); idx_clinia_ads_raw_stage (stage)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_clinia_ads.py`
- Evidencias documentais: `apps/painel/docs/09-plano-tecnico-marketing-funil.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md, apps/painel/docs/database/07-mapa-api-rotas-tabelas.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| event_hash | varchar(64) | Nao | PK | - | Campo do dominio `raw_clinia_ads_contacts` referente a event hash. |
| sync_job_id | varchar(64) | Nao | - | - | Identificador de sync job usado para relacionar ou localizar o registro na origem/aplicacao. |
| brand_slug | varchar(64) | Nao | - | - | Campo do dominio `raw_clinia_ads_contacts` referente a brand slug. |
| source_period | varchar(16) | Nao | - | - | Campo do dominio `raw_clinia_ads_contacts` referente a source period. |
| date_ref | varchar(10) | Nao | IDX | - | Campo do dominio `raw_clinia_ads_contacts` referente a date referencia. |
| jid | varchar(80) | Nao | - | - | Campo do dominio `raw_clinia_ads_contacts` referente a jid. |
| origin | varchar(64) | Sim | IDX | - | Campo do dominio `raw_clinia_ads_contacts` referente a origin. |
| source_id | varchar(255) | Sim | IDX | - | Identificador de source usado para relacionar ou localizar o registro na origem/aplicacao. |
| source_url | text | Sim | - | - | Campo do dominio `raw_clinia_ads_contacts` referente a source URL. |
| source_url_hash | varchar(64) | Nao | - | - | Campo do dominio `raw_clinia_ads_contacts` referente a source URL hash. |
| title | varchar(255) | Sim | - | - | Campo do dominio `raw_clinia_ads_contacts` referente a title. |
| stage | varchar(40) | Nao | IDX | - | Status/etapa de stage. |
| created_at | varchar(32) | Sim | - | - | Data/hora de criacao do registro no painel. |
| conversion_time_sec | int | Nao | - | 0 | Campo do dominio `raw_clinia_ads_contacts` referente a conversion time sec. |
| name | varchar(255) | Sim | - | - | Nome principal do registro. |
| personal_name | varchar(255) | Sim | - | - | Nome de personal utilizado para exibicao, filtro ou agrupamento. |
| verified_name | varchar(255) | Sim | - | - | Nome de verified utilizado para exibicao, filtro ou agrupamento. |
| organization_id | varchar(64) | Sim | - | - | Identificador de organization usado para relacionar ou localizar o registro na origem/aplicacao. |
| payload_json | longtext | Sim | - | - | Payload bruto ou quase bruto em JSON para auditoria/reprocessamento. |
| synced_at | varchar(32) | Nao | - | - | Data/hora referente a synced. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `raw_ga4_campaign_daily`

- Finalidade: Staging/raw diario de campanhas GA4.
- Origem da informacao: Google Ads, GA4 e mapeamentos de marketing.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_marketing_funnel_google.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `885`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_raw_ga4_date_brand (date_ref, brand_slug); ux_raw_ga4_row_hash (row_hash) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_marketing_funnel_google.py`
- Evidencias documentais: `apps/painel/docs/09-plano-tecnico-marketing-funil.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md, apps/painel/docs/database/06-contratos-operacionais-por-dominio.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| row_hash | varchar(64) | Nao | UNQ | - | Campo do dominio `raw_ga4_campaign_daily` referente a row hash. |
| sync_job_id | varchar(64) | Nao | - | - | Identificador de sync job usado para relacionar ou localizar o registro na origem/aplicacao. |
| date_ref | varchar(10) | Nao | IDX | - | Campo do dominio `raw_ga4_campaign_daily` referente a date referencia. |
| brand_slug | varchar(64) | Nao | - | - | Campo do dominio `raw_ga4_campaign_daily` referente a brand slug. |
| ga4_property_id | varchar(64) | Nao | - | - | Identificador de GA4 property usado para relacionar ou localizar o registro na origem/aplicacao. |
| source | varchar(120) | Sim | - | - | Origem declarada do dado ou do evento. |
| medium | varchar(120) | Sim | - | - | Campo do dominio `raw_ga4_campaign_daily` referente a medium. |
| campaign_name | varchar(255) | Sim | - | - | Nome de campaign utilizado para exibicao, filtro ou agrupamento. |
| sessions | int | Nao | - | 0 | Campo do dominio `raw_ga4_campaign_daily` referente a sessions. |
| total_users | int | Nao | - | 0 | Quantidade/contagem referente a total users. |
| leads | int | Nao | - | 0 | Campo do dominio `raw_ga4_campaign_daily` referente a leads. |
| payload_json | text | Sim | - | - | Payload bruto ou quase bruto em JSON para auditoria/reprocessamento. |
| payload_hash | varchar(64) | Sim | - | - | Campo do dominio `raw_ga4_campaign_daily` referente a payload hash. |
| collected_at | varchar(32) | Nao | - | - | Data/hora referente a collected. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |
| new_users | int | Nao | - | 0 | Campo do dominio `raw_ga4_campaign_daily` referente a new users. |
| engaged_sessions | int | Nao | - | 0 | Campo do dominio `raw_ga4_campaign_daily` referente a engaged sessions. |
| engagement_rate | decimal(10,4) | Nao | - | 0.0000 | Percentual/taxa referente a engagement rate. |
| average_session_duration | decimal(14,4) | Nao | - | 0.0000 | Campo do dominio `raw_ga4_campaign_daily` referente a average session duration. |
| screen_page_views | int | Nao | - | 0 | Campo do dominio `raw_ga4_campaign_daily` referente a screen page views. |
| event_count | int | Nao | - | 0 | Quantidade/contagem referente a event count. |
| session_default_channel_group | varchar(120) | Sim | - | - | Campo do dominio `raw_ga4_campaign_daily` referente a session default channel group. |

---

### `raw_ga4_channel_daily`

- Finalidade: Staging/raw diario de canais GA4.
- Origem da informacao: Google Ads, GA4 e mapeamentos de marketing.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_marketing_funnel_google.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `732`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_raw_ga4_channel_date_brand (date_ref, brand_slug); ux_raw_ga4_channel_row_hash (row_hash) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_marketing_funnel_google.py`
- Evidencias documentais: `apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md, apps/painel/docs/database/06-contratos-operacionais-por-dominio.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| row_hash | varchar(64) | Nao | UNQ | - | Campo do dominio `raw_ga4_channel_daily` referente a row hash. |
| sync_job_id | varchar(64) | Nao | - | - | Identificador de sync job usado para relacionar ou localizar o registro na origem/aplicacao. |
| date_ref | varchar(10) | Nao | IDX | - | Campo do dominio `raw_ga4_channel_daily` referente a date referencia. |
| brand_slug | varchar(64) | Nao | - | - | Campo do dominio `raw_ga4_channel_daily` referente a brand slug. |
| ga4_property_id | varchar(64) | Nao | - | - | Identificador de GA4 property usado para relacionar ou localizar o registro na origem/aplicacao. |
| campaign_name | varchar(255) | Sim | - | - | Nome de campaign utilizado para exibicao, filtro ou agrupamento. |
| channel_group | varchar(120) | Sim | - | - | Campo do dominio `raw_ga4_channel_daily` referente a channel group. |
| sessions | int | Nao | - | 0 | Campo do dominio `raw_ga4_channel_daily` referente a sessions. |
| users | int | Nao | - | 0 | Campo do dominio `raw_ga4_channel_daily` referente a users. |
| key_events | int | Nao | - | 0 | Campo do dominio `raw_ga4_channel_daily` referente a key events. |
| event_count | int | Nao | - | 0 | Quantidade/contagem referente a event count. |
| payload_json | text | Sim | - | - | Payload bruto ou quase bruto em JSON para auditoria/reprocessamento. |
| payload_hash | varchar(64) | Sim | - | - | Campo do dominio `raw_ga4_channel_daily` referente a payload hash. |
| collected_at | varchar(32) | Nao | - | - | Data/hora referente a collected. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `raw_ga4_landing_page_daily`

- Finalidade: Staging/raw diario de landing pages GA4.
- Origem da informacao: Google Ads, GA4 e mapeamentos de marketing.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_marketing_funnel_google.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `3242`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_raw_ga4_landing_date_brand (date_ref, brand_slug); ux_raw_ga4_landing_row_hash (row_hash) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_marketing_funnel_google.py`
- Evidencias documentais: `apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md, apps/painel/docs/database/06-contratos-operacionais-por-dominio.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| row_hash | varchar(64) | Nao | UNQ | - | Campo do dominio `raw_ga4_landing_page_daily` referente a row hash. |
| sync_job_id | varchar(64) | Nao | - | - | Identificador de sync job usado para relacionar ou localizar o registro na origem/aplicacao. |
| date_ref | varchar(10) | Nao | IDX | - | Campo do dominio `raw_ga4_landing_page_daily` referente a date referencia. |
| brand_slug | varchar(64) | Nao | - | - | Campo do dominio `raw_ga4_landing_page_daily` referente a brand slug. |
| ga4_property_id | varchar(64) | Nao | - | - | Identificador de GA4 property usado para relacionar ou localizar o registro na origem/aplicacao. |
| campaign_name | varchar(255) | Sim | - | - | Nome de campaign utilizado para exibicao, filtro ou agrupamento. |
| source | varchar(120) | Sim | - | - | Origem declarada do dado ou do evento. |
| medium | varchar(120) | Sim | - | - | Campo do dominio `raw_ga4_landing_page_daily` referente a medium. |
| landing_page | text | Sim | - | - | Campo do dominio `raw_ga4_landing_page_daily` referente a landing page. |
| sessions | int | Nao | - | 0 | Campo do dominio `raw_ga4_landing_page_daily` referente a sessions. |
| total_users | int | Nao | - | 0 | Quantidade/contagem referente a total users. |
| new_users | int | Nao | - | 0 | Campo do dominio `raw_ga4_landing_page_daily` referente a new users. |
| engaged_sessions | int | Nao | - | 0 | Campo do dominio `raw_ga4_landing_page_daily` referente a engaged sessions. |
| key_events | int | Nao | - | 0 | Campo do dominio `raw_ga4_landing_page_daily` referente a key events. |
| event_count | int | Nao | - | 0 | Quantidade/contagem referente a event count. |
| payload_json | text | Sim | - | - | Payload bruto ou quase bruto em JSON para auditoria/reprocessamento. |
| payload_hash | varchar(64) | Sim | - | - | Campo do dominio `raw_ga4_landing_page_daily` referente a payload hash. |
| collected_at | varchar(32) | Nao | - | - | Data/hora referente a collected. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `raw_google_ads_campaign_daily`

- Finalidade: Staging/raw diario de campanhas Google Ads.
- Origem da informacao: Google Ads, GA4 e mapeamentos de marketing.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_marketing_funnel_google.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `2831`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_raw_ads_date_brand (date_ref, brand_slug); ux_raw_ads_row_hash (row_hash) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_marketing_funnel_google.py`
- Evidencias documentais: `apps/painel/docs/09-plano-tecnico-marketing-funil.md, apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| row_hash | varchar(64) | Nao | UNQ | - | Campo do dominio `raw_google_ads_campaign_daily` referente a row hash. |
| sync_job_id | varchar(64) | Nao | - | - | Identificador de sync job usado para relacionar ou localizar o registro na origem/aplicacao. |
| date_ref | varchar(10) | Nao | IDX | - | Campo do dominio `raw_google_ads_campaign_daily` referente a date referencia. |
| brand_slug | varchar(64) | Nao | - | - | Campo do dominio `raw_google_ads_campaign_daily` referente a brand slug. |
| ads_customer_id | varchar(64) | Nao | - | - | Identificador de Ads customer usado para relacionar ou localizar o registro na origem/aplicacao. |
| campaign_id | varchar(64) | Sim | - | - | Identificador de campaign usado para relacionar ou localizar o registro na origem/aplicacao. |
| campaign_name | varchar(255) | Sim | - | - | Nome de campaign utilizado para exibicao, filtro ou agrupamento. |
| impressions | int | Nao | - | 0 | Campo do dominio `raw_google_ads_campaign_daily` referente a impressions. |
| clicks | int | Nao | - | 0 | Campo do dominio `raw_google_ads_campaign_daily` referente a clicks. |
| spend | decimal(14,2) | Nao | - | 0.00 | Campo do dominio `raw_google_ads_campaign_daily` referente a spend. |
| payload_json | text | Sim | - | - | Payload bruto ou quase bruto em JSON para auditoria/reprocessamento. |
| payload_hash | varchar(64) | Sim | - | - | Campo do dominio `raw_google_ads_campaign_daily` referente a payload hash. |
| collected_at | varchar(32) | Nao | - | - | Data/hora referente a collected. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |
| campaign_status | varchar(40) | Sim | - | - | Status/etapa de campaign status. |
| advertising_channel_type | varchar(60) | Sim | - | - | Campo do dominio `raw_google_ads_campaign_daily` referente a advertising channel type. |
| campaign_start_date | varchar(10) | Sim | - | - | Data de campaign start. |
| campaign_end_date | varchar(10) | Sim | - | - | Data de campaign end. |
| ctr | decimal(10,4) | Nao | - | 0.0000 | Campo do dominio `raw_google_ads_campaign_daily` referente a ctr. |
| average_cpc | decimal(14,4) | Nao | - | 0.0000 | Campo do dominio `raw_google_ads_campaign_daily` referente a average cpc. |
| interactions | int | Nao | - | 0 | Campo do dominio `raw_google_ads_campaign_daily` referente a interactions. |
| conversions | decimal(14,4) | Nao | - | 0.0000 | Campo do dominio `raw_google_ads_campaign_daily` referente a conversions. |
| all_conversions | decimal(14,4) | Nao | - | 0.0000 | Campo do dominio `raw_google_ads_campaign_daily` referente a all conversions. |
| conversions_value | decimal(14,4) | Nao | - | 0.0000 | Valor monetario ou numerico referente a conversions value. |
| cost_per_conversion | decimal(14,4) | Nao | - | 0.0000 | Valor monetario ou numerico referente a cost per conversion. |
| campaign_primary_status | varchar(40) | Sim | - | - | Status/etapa de campaign primary status. |
| campaign_primary_status_reasons_json | text | Sim | - | - | Conteudo estruturado em JSON relacionado a campaign primary status reasons. |
| bidding_strategy_type | varchar(60) | Sim | - | - | Percentual/taxa referente a bidding strategy type. |
| optimization_score | decimal(10,4) | Nao | - | 0.0000 | Campo do dominio `raw_google_ads_campaign_daily` referente a optimization score. |
| budget_name | varchar(255) | Sim | - | - | Nome de budget utilizado para exibicao, filtro ou agrupamento. |
| budget_period | varchar(40) | Sim | - | - | Campo do dominio `raw_google_ads_campaign_daily` referente a budget period. |
| budget_amount | decimal(14,2) | Nao | - | 0.00 | Valor monetario ou numerico referente a budget amount. |
| currency_code | varchar(10) | Sim | - | - | Codigo de currency na origem ou em regra de negocio. |

---

### `raw_google_ads_campaign_device_daily`

- Finalidade: Staging/raw diario de campanhas Google Ads por dispositivo.
- Origem da informacao: Google Ads, GA4 e mapeamentos de marketing.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_marketing_funnel_google.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `3458`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_raw_ads_device_date_brand (date_ref, brand_slug); ux_raw_ads_device_row_hash (row_hash) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_marketing_funnel_google.py`
- Evidencias documentais: `apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md, apps/painel/docs/database/06-contratos-operacionais-por-dominio.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| row_hash | varchar(64) | Nao | UNQ | - | Campo do dominio `raw_google_ads_campaign_device_daily` referente a row hash. |
| sync_job_id | varchar(64) | Nao | - | - | Identificador de sync job usado para relacionar ou localizar o registro na origem/aplicacao. |
| date_ref | varchar(10) | Nao | IDX | - | Campo do dominio `raw_google_ads_campaign_device_daily` referente a date referencia. |
| brand_slug | varchar(64) | Nao | - | - | Campo do dominio `raw_google_ads_campaign_device_daily` referente a brand slug. |
| ads_customer_id | varchar(64) | Nao | - | - | Identificador de Ads customer usado para relacionar ou localizar o registro na origem/aplicacao. |
| campaign_id | varchar(64) | Sim | - | - | Identificador de campaign usado para relacionar ou localizar o registro na origem/aplicacao. |
| campaign_name | varchar(255) | Sim | - | - | Nome de campaign utilizado para exibicao, filtro ou agrupamento. |
| device | varchar(60) | Nao | - | - | Campo do dominio `raw_google_ads_campaign_device_daily` referente a device. |
| impressions | int | Nao | - | 0 | Campo do dominio `raw_google_ads_campaign_device_daily` referente a impressions. |
| clicks | int | Nao | - | 0 | Campo do dominio `raw_google_ads_campaign_device_daily` referente a clicks. |
| spend | decimal(14,2) | Nao | - | 0.00 | Campo do dominio `raw_google_ads_campaign_device_daily` referente a spend. |
| conversions | decimal(14,4) | Nao | - | 0.0000 | Campo do dominio `raw_google_ads_campaign_device_daily` referente a conversions. |
| all_conversions | decimal(14,4) | Nao | - | 0.0000 | Campo do dominio `raw_google_ads_campaign_device_daily` referente a all conversions. |
| payload_json | text | Sim | - | - | Payload bruto ou quase bruto em JSON para auditoria/reprocessamento. |
| payload_hash | varchar(64) | Sim | - | - | Campo do dominio `raw_google_ads_campaign_device_daily` referente a payload hash. |
| collected_at | varchar(32) | Nao | - | - | Data/hora referente a collected. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

## Pessoas, profissionais, RH e contratos

### `contract_template_audit_log`

- Finalidade: Auditoria de alteracoes em modelos de contrato.
- Origem da informacao: Cadastro/manual de modelos de contrato no painel.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/contract_templates/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `28`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: template_id -> contract_templates.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/contract_templates/repository.ts`
- Evidencias documentais: `apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/05-matriz-de-escrita-e-consumo.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| template_id | varchar(64) | Nao | - | - | Identificador do modelo relacionado ao registro. |
| action | varchar(60) | Nao | - | - | Campo do dominio `contract_template_audit_log` referente a action. |
| actor_user_id | varchar(64) | Nao | - | - | Identificador de actor user usado para relacionar ou localizar o registro na origem/aplicacao. |
| payload_json | longtext | Sim | - | - | Payload bruto ou quase bruto em JSON para auditoria/reprocessamento. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `contract_templates`

- Finalidade: Repositorio de modelos de contrato.
- Origem da informacao: Cadastro/manual de modelos de contrato no painel.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/contract_templates/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `5`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/contract_templates/repository.ts`
- Evidencias documentais: `apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/02-matriz-de-permissoes.md, apps/painel/docs/01-visao-funcional-e-indicadores.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| name | varchar(180) | Nao | - | - | Nome principal do registro. |
| contract_type | varchar(40) | Nao | - | - | Campo do dominio `contract_templates` referente a contract type. |
| version | int | Nao | - | - | Campo do dominio `contract_templates` referente a version. |
| status | varchar(20) | Nao | - | draft | Status operacional/negocial atual do registro. |
| storage_provider | varchar(30) | Nao | - | - | Campo do dominio `contract_templates` referente a storage provider. |
| storage_bucket | varchar(120) | Sim | - | - | Campo do dominio `contract_templates` referente a storage bucket. |
| storage_key | varchar(255) | Nao | - | - | Campo do dominio `contract_templates` referente a storage key. |
| original_name | varchar(255) | Nao | - | - | Nome de original utilizado para exibicao, filtro ou agrupamento. |
| mime_type | varchar(120) | Nao | - | - | Tipo MIME do arquivo armazenado. |
| size_bytes | bigint | Nao | - | - | Campo do dominio `contract_templates` referente a size bytes. |
| placeholders_json | longtext | Nao | - | - | Conteudo estruturado em JSON relacionado a placeholders. |
| mapping_json | longtext | Sim | - | - | Conteudo estruturado em JSON relacionado a mapping. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| uploaded_by | varchar(64) | Nao | - | - | Campo do dominio `contract_templates` referente a uploaded by. |
| uploaded_at | text | Nao | - | - | Data/hora referente a uploaded. |
| activated_by | varchar(64) | Sim | - | - | Campo do dominio `contract_templates` referente a activated by. |
| activated_at | text | Sim | - | - | Data/hora referente a activated. |
| archived_at | text | Sim | - | - | Data/hora referente a archived. |

---

### `employee_audit_log`

- Finalidade: Auditoria das alteracoes no cadastro de colaboradores.
- Origem da informacao: Cadastro/manual do painel de RH/DP e importacoes de folha.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/colaboradores/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `241`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: employee_id -> employees.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/colaboradores/repository.ts`
- Evidencias documentais: `apps/painel/docs/10-plano-tecnico-colaboradores.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| employee_id | varchar(64) | Sim | - | - | Identificador do colaborador relacionado ao registro. |
| action | varchar(60) | Nao | - | - | Campo do dominio `employee_audit_log` referente a action. |
| actor_user_id | varchar(64) | Nao | - | - | Identificador de actor user usado para relacionar ou localizar o registro na origem/aplicacao. |
| payload_json | longtext | Sim | - | - | Payload bruto ou quase bruto em JSON para auditoria/reprocessamento. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `employee_documents`

- Finalidade: Documentos ativos dos colaboradores.
- Origem da informacao: Cadastro/manual do painel de RH/DP e importacoes de folha.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/colaboradores/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `55`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_employee_documents_employee (employee_id)
- Vinculos principais: employee_id -> employees.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/colaboradores/repository.ts`
- Evidencias documentais: `apps/painel/docs/10-plano-tecnico-colaboradores.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/05-matriz-de-escrita-e-consumo.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| employee_id | varchar(64) | Nao | IDX | - | Identificador do colaborador relacionado ao registro. |
| doc_type | varchar(60) | Nao | - | - | Campo do dominio `employee_documents` referente a doc type. |
| storage_provider | varchar(30) | Nao | - | - | Campo do dominio `employee_documents` referente a storage provider. |
| storage_bucket | varchar(120) | Sim | - | - | Campo do dominio `employee_documents` referente a storage bucket. |
| storage_key | varchar(255) | Nao | - | - | Campo do dominio `employee_documents` referente a storage key. |
| original_name | varchar(255) | Nao | - | - | Nome de original utilizado para exibicao, filtro ou agrupamento. |
| mime_type | varchar(120) | Nao | - | - | Tipo MIME do arquivo armazenado. |
| size_bytes | bigint | Nao | - | - | Campo do dominio `employee_documents` referente a size bytes. |
| issue_date | date | Sim | - | - | Data de issue. |
| expires_at | date | Sim | - | - | Data/hora referente a expires. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| is_active | int | Nao | - | 1 | Indicador logico de atividade do registro. |
| uploaded_by | varchar(64) | Nao | - | - | Campo do dominio `employee_documents` referente a uploaded by. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `employee_documents_inactive`

- Finalidade: Historico de documentos inativos de colaboradores.
- Origem da informacao: Cadastro/manual do painel de RH/DP e importacoes de folha.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/colaboradores/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `4`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_employee_documents_inactive_employee (employee_id); source_document_id (source_document_id) [UNQ]
- Vinculos principais: employee_id -> employees.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/colaboradores/repository.ts`
- Evidencias documentais: `apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/10-plano-tecnico-colaboradores.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| source_document_id | varchar(64) | Nao | UNQ | - | Identificador de source document usado para relacionar ou localizar o registro na origem/aplicacao. |
| employee_id | varchar(64) | Nao | IDX | - | Identificador do colaborador relacionado ao registro. |
| doc_type | varchar(60) | Nao | - | - | Campo do dominio `employee_documents_inactive` referente a doc type. |
| storage_provider | varchar(30) | Nao | - | - | Campo do dominio `employee_documents_inactive` referente a storage provider. |
| storage_bucket | varchar(120) | Sim | - | - | Campo do dominio `employee_documents_inactive` referente a storage bucket. |
| storage_key | varchar(255) | Nao | - | - | Campo do dominio `employee_documents_inactive` referente a storage key. |
| original_name | varchar(255) | Nao | - | - | Nome de original utilizado para exibicao, filtro ou agrupamento. |
| mime_type | varchar(120) | Nao | - | - | Tipo MIME do arquivo armazenado. |
| size_bytes | bigint | Nao | - | - | Campo do dominio `employee_documents_inactive` referente a size bytes. |
| issue_date | date | Sim | - | - | Data de issue. |
| expires_at | date | Sim | - | - | Data/hora referente a expires. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| inactive_reason | varchar(30) | Nao | - | - | Campo do dominio `employee_documents_inactive` referente a inactive reason. |
| uploaded_by | varchar(64) | Nao | - | - | Campo do dominio `employee_documents_inactive` referente a uploaded by. |
| original_created_at | text | Nao | - | - | Data/hora referente a original created. |
| archived_by | varchar(64) | Nao | - | - | Campo do dominio `employee_documents_inactive` referente a archived by. |
| archived_at | text | Nao | - | - | Data/hora referente a archived. |

---

### `employee_lifecycle_cases`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Cadastro/manual do painel de RH/DP e importacoes de folha.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/colaboradores/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_employee_lifecycle_cases_employee (employee_id); idx_employee_lifecycle_cases_stage (stage)
- Vinculos principais: employee_id -> employees.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/colaboradores/repository.ts`
- Evidencias documentais: `apps/painel/docs/10-plano-tecnico-colaboradores.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| employee_id | varchar(64) | Nao | IDX | - | Identificador do colaborador relacionado ao registro. |
| case_type | varchar(20) | Nao | - | - | Campo do dominio `employee_lifecycle_cases` referente a case type. |
| stage | varchar(40) | Nao | IDX | - | Status/etapa de stage. |
| owner_name | varchar(180) | Sim | - | - | Nome de owner utilizado para exibicao, filtro ou agrupamento. |
| target_date | date | Sim | - | - | Data de target. |
| closed_at | text | Sim | - | - | Data/hora referente a closed. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `employee_lifecycle_tasks`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Cadastro/manual do painel de RH/DP e importacoes de folha.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/colaboradores/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_employee_lifecycle_tasks_case (case_id)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/colaboradores/repository.ts`
- Evidencias documentais: `apps/painel/docs/10-plano-tecnico-colaboradores.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| case_id | varchar(64) | Nao | IDX | - | Identificador de case usado para relacionar ou localizar o registro na origem/aplicacao. |
| task_key | varchar(80) | Nao | - | - | Campo do dominio `employee_lifecycle_tasks` referente a task key. |
| title | varchar(180) | Nao | - | - | Campo do dominio `employee_lifecycle_tasks` referente a title. |
| status | varchar(20) | Nao | - | - | Status operacional/negocial atual do registro. |
| owner_name | varchar(180) | Sim | - | - | Nome de owner utilizado para exibicao, filtro ou agrupamento. |
| due_date | date | Sim | - | - | Data de due. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| source_type | varchar(40) | Nao | - | - | Campo do dominio `employee_lifecycle_tasks` referente a source type. |
| source_ref | varchar(120) | Sim | - | - | Campo do dominio `employee_lifecycle_tasks` referente a source referencia. |
| sort_order | int | Nao | - | 0 | Ordem relativa de exibicao/processamento. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `employee_locker_assignments`

- Finalidade: Controle de armarios/chaves.
- Origem da informacao: Cadastro/manual do painel de RH/DP e importacoes de folha.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/colaboradores/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_employee_locker_assignments_active (unit_name, locker_code, is_active); idx_employee_locker_assignments_employee (employee_id)
- Vinculos principais: employee_id -> employees.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/colaboradores/repository.ts`
- Evidencias documentais: `apps/painel/docs/10-plano-tecnico-colaboradores.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| employee_id | varchar(64) | Nao | IDX | - | Identificador do colaborador relacionado ao registro. |
| unit_name | varchar(180) | Nao | IDX | - | Nome da unidade exibido/normalizado para consumo no painel. |
| locker_code | varchar(120) | Nao | - | - | Codigo de locker na origem ou em regra de negocio. |
| location_detail | varchar(180) | Sim | - | - | Campo do dominio `employee_locker_assignments` referente a location detail. |
| key_status | varchar(30) | Nao | - | - | Status/etapa de key status. |
| assigned_at | date | Sim | - | - | Data/hora referente a assigned. |
| returned_at | date | Sim | - | - | Data/hora referente a returned. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| is_active | int | Nao | - | 1 | Indicador logico de atividade do registro. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `employee_portal_invites`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `packages/core/src/employee_portal/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `5`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_employee_portal_invites_employee (employee_id); idx_employee_portal_invites_status (status); token_hash (token_hash) [UNQ]
- Vinculos principais: employee_id -> employees.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `packages/core/src/employee_portal/repository.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| employee_id | varchar(64) | Nao | IDX | - | Identificador do colaborador relacionado ao registro. |
| token_hash | varchar(128) | Nao | UNQ | - | Campo do dominio `employee_portal_invites` referente a token hash. |
| status | varchar(30) | Nao | IDX | - | Status operacional/negocial atual do registro. |
| expires_at | text | Nao | - | - | Data/hora referente a expires. |
| created_by | varchar(64) | Nao | - | - | Campo do dominio `employee_portal_invites` referente a created by. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| revoked_by | varchar(64) | Sim | - | - | Campo do dominio `employee_portal_invites` referente a revoked by. |
| revoked_at | text | Sim | - | - | Data/hora referente a revoked. |
| last_used_at | text | Sim | - | - | Data/hora referente a last used. |
| attempt_count | int | Nao | - | 0 | Quantidade/contagem referente a attempt count. |
| locked_until | text | Sim | - | - | Campo do dominio `employee_portal_invites` referente a locked until. |
| token_encrypted | text | Sim | - | - | Campo do dominio `employee_portal_invites` referente a token encrypted. |

---

### `employee_portal_sessions`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `packages/core/src/employee_portal/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `3`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_employee_portal_sessions_employee (employee_id); session_hash (session_hash) [UNQ]
- Vinculos principais: employee_id -> employees.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `packages/core/src/employee_portal/repository.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| employee_id | varchar(64) | Nao | IDX | - | Identificador do colaborador relacionado ao registro. |
| invite_id | varchar(64) | Nao | - | - | Identificador de invite usado para relacionar ou localizar o registro na origem/aplicacao. |
| session_hash | varchar(128) | Nao | UNQ | - | Campo do dominio `employee_portal_sessions` referente a session hash. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| expires_at | text | Nao | - | - | Data/hora referente a expires. |
| revoked_at | text | Sim | - | - | Data/hora referente a revoked. |
| ip_address | varchar(80) | Sim | - | - | Campo do dominio `employee_portal_sessions` referente a ip address. |
| user_agent | text | Sim | - | - | Campo do dominio `employee_portal_sessions` referente a user agent. |

---

### `employee_portal_submission_documents`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `packages/core/src/employee_portal/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `1`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_employee_portal_submission_documents_employee (employee_id); idx_employee_portal_submission_documents_submission (submission_id)
- Vinculos principais: employee_id -> employees.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `packages/core/src/employee_portal/repository.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| submission_id | varchar(64) | Nao | IDX | - | Identificador de submission usado para relacionar ou localizar o registro na origem/aplicacao. |
| employee_id | varchar(64) | Nao | IDX | - | Identificador do colaborador relacionado ao registro. |
| doc_type | varchar(60) | Nao | - | - | Campo do dominio `employee_portal_submission_documents` referente a doc type. |
| storage_provider | varchar(30) | Nao | - | - | Campo do dominio `employee_portal_submission_documents` referente a storage provider. |
| storage_bucket | varchar(120) | Sim | - | - | Campo do dominio `employee_portal_submission_documents` referente a storage bucket. |
| storage_key | varchar(255) | Nao | - | - | Campo do dominio `employee_portal_submission_documents` referente a storage key. |
| original_name | varchar(255) | Nao | - | - | Nome de original utilizado para exibicao, filtro ou agrupamento. |
| mime_type | varchar(120) | Nao | - | - | Tipo MIME do arquivo armazenado. |
| size_bytes | bigint | Nao | - | - | Campo do dominio `employee_portal_submission_documents` referente a size bytes. |
| checksum | varchar(128) | Sim | - | - | Hash/checksum para validacao de integridade. |
| issue_date | date | Sim | - | - | Data de issue. |
| expires_at | date | Sim | - | - | Data/hora referente a expires. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| status | varchar(30) | Nao | - | - | Status operacional/negocial atual do registro. |
| rejection_reason | text | Sim | - | - | Campo do dominio `employee_portal_submission_documents` referente a rejection reason. |
| reviewed_by | varchar(64) | Sim | - | - | Campo do dominio `employee_portal_submission_documents` referente a reviewed by. |
| reviewed_at | text | Sim | - | - | Data/hora referente a reviewed. |
| promoted_document_id | varchar(64) | Sim | - | - | Identificador de promoted document usado para relacionar ou localizar o registro na origem/aplicacao. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `employee_portal_submissions`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `packages/core/src/employee_portal/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `1`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_employee_portal_submissions_employee (employee_id)
- Vinculos principais: employee_id -> employees.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `packages/core/src/employee_portal/repository.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| employee_id | varchar(64) | Nao | IDX | - | Identificador do colaborador relacionado ao registro. |
| invite_id | varchar(64) | Sim | - | - | Identificador de invite usado para relacionar ou localizar o registro na origem/aplicacao. |
| status | varchar(30) | Nao | - | - | Status operacional/negocial atual do registro. |
| personal_status | varchar(30) | Nao | - | DRAFT | Status/etapa de personal status. |
| personal_data_json | longtext | Sim | - | - | Conteudo estruturado em JSON relacionado a personal data. |
| personal_rejection_reason | text | Sim | - | - | Campo do dominio `employee_portal_submissions` referente a personal rejection reason. |
| consent_lgpd | int | Nao | - | 0 | Campo do dominio `employee_portal_submissions` referente a consent lgpd. |
| consent_lgpd_at | text | Sim | - | - | Data/hora referente a consent lgpd. |
| submitted_at | text | Sim | - | - | Data/hora referente a submitted. |
| reviewed_by | varchar(64) | Sim | - | - | Campo do dominio `employee_portal_submissions` referente a reviewed by. |
| reviewed_at | text | Sim | - | - | Data/hora referente a reviewed. |
| review_notes | text | Sim | - | - | Campo do dominio `employee_portal_submissions` referente a review notes. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `employee_recess_periods`

- Finalidade: Cadastro de ferias/recessos/licencas.
- Origem da informacao: Cadastro/manual do painel de RH/DP e importacoes de folha.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/colaboradores/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `1`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_employee_recess_periods_employee (employee_id)
- Vinculos principais: employee_id -> employees.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/colaboradores/repository.ts`
- Evidencias documentais: `apps/painel/docs/10-plano-tecnico-colaboradores.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| employee_id | varchar(64) | Nao | IDX | - | Identificador do colaborador relacionado ao registro. |
| acquisition_start_date | date | Sim | - | - | Data de acquisition start. |
| acquisition_end_date | date | Sim | - | - | Data de acquisition end. |
| days_due | int | Nao | - | 0 | Campo do dominio `employee_recess_periods` referente a days due. |
| days_paid | int | Nao | - | 0 | Campo do dominio `employee_recess_periods` referente a days paid. |
| leave_deadline_date | date | Sim | - | - | Data de leave deadline. |
| vacation_start_date | date | Sim | - | - | Data de vacation start. |
| vacation_duration_days | int | Nao | - | 0 | Campo do dominio `employee_recess_periods` referente a vacation duration days. |
| sell_ten_days | int | Nao | - | 0 | Campo do dominio `employee_recess_periods` referente a sell ten days. |
| thirteenth_on_vacation | int | Nao | - | 0 | Campo do dominio `employee_recess_periods` referente a thirteenth on vacation. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `employee_uniform_items`

- Finalidade: Controle de uniformes/EPIs por colaborador.
- Origem da informacao: Cadastro/manual do painel de RH/DP e importacoes de folha.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/colaboradores/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `1`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_employee_uniform_items_employee (employee_id)
- Vinculos principais: employee_id -> employees.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/colaboradores/repository.ts`
- Evidencias documentais: `apps/painel/docs/10-plano-tecnico-colaboradores.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| employee_id | varchar(64) | Nao | IDX | - | Identificador do colaborador relacionado ao registro. |
| withdrawal_date | date | Sim | - | - | Data de withdrawal. |
| item_description | varchar(255) | Nao | - | - | Campo do dominio `employee_uniform_items` referente a item description. |
| quantity | int | Nao | - | 1 | Quantidade/contagem referente a quantity. |
| signed_receipt | int | Nao | - | 0 | Campo do dominio `employee_uniform_items` referente a signed receipt. |
| delivery_type | varchar(30) | Nao | - | - | Campo do dominio `employee_uniform_items` referente a delivery type. |
| delivered_by | varchar(180) | Sim | - | - | Campo do dominio `employee_uniform_items` referente a delivered by. |
| status | varchar(20) | Nao | - | - | Status operacional/negocial atual do registro. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `employees`

- Finalidade: Cadastro principal de colaboradores.
- Origem da informacao: Cadastro/manual do painel de RH/DP e importacoes de folha.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/colaboradores/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `68`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_employees_full_name (full_name); idx_employees_status (status)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/colaboradores/repository.ts`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/06-plano-tecnico-qualidade-treinamentos.md, apps/painel/docs/15-plano-tecnico-recrutamento.md, apps/painel/docs/10-plano-tecnico-colaboradores.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| full_name | varchar(180) | Nao | IDX | - | Nome de full utilizado para exibicao, filtro ou agrupamento. |
| employment_regime | varchar(20) | Nao | - | - | Campo do dominio `employees` referente a employment regime. |
| status | varchar(20) | Nao | IDX | - | Status operacional/negocial atual do registro. |
| rg | varchar(40) | Sim | - | - | Campo do dominio `employees` referente a rg. |
| cpf | varchar(14) | Nao | - | - | Campo do dominio `employees` referente a cpf. |
| email | varchar(180) | Sim | - | - | Endereco de e-mail associado ao registro. |
| phone | varchar(40) | Sim | - | - | Campo do dominio `employees` referente a phone. |
| birth_date | date | Sim | - | - | Data de birth. |
| street | varchar(180) | Sim | - | - | Campo do dominio `employees` referente a street. |
| street_number | varchar(40) | Sim | - | - | Campo do dominio `employees` referente a street number. |
| address_complement | varchar(180) | Sim | - | - | Campo do dominio `employees` referente a address complement. |
| district | varchar(120) | Sim | - | - | Campo do dominio `employees` referente a district. |
| city | varchar(120) | Sim | - | - | Campo do dominio `employees` referente a city. |
| state_uf | varchar(2) | Sim | - | - | Campo do dominio `employees` referente a state uf. |
| zip_code | varchar(20) | Sim | - | - | Codigo de zip na origem ou em regra de negocio. |
| education_institution | varchar(180) | Sim | - | - | Campo do dominio `employees` referente a education institution. |
| education_level | varchar(20) | Sim | - | - | Campo do dominio `employees` referente a education level. |
| course_name | varchar(180) | Sim | - | - | Nome de course utilizado para exibicao, filtro ou agrupamento. |
| current_semester | varchar(40) | Sim | - | - | Campo do dominio `employees` referente a current semester. |
| work_schedule | text | Sim | - | - | Campo do dominio `employees` referente a work schedule. |
| salary_amount | decimal(12,2) | Sim | - | - | Valor monetario ou numerico referente a salary amount. |
| contract_duration_text | varchar(120) | Sim | - | - | Campo do dominio `employees` referente a contract duration text. |
| admission_date | date | Sim | - | - | Data de admission. |
| contract_end_date | date | Sim | - | - | Data de contract end. |
| termination_date | date | Sim | - | - | Data de termination. |
| termination_reason | text | Sim | - | - | Campo do dominio `employees` referente a termination reason. |
| termination_notes | text | Sim | - | - | Campo do dominio `employees` referente a termination notes. |
| units_json | longtext | Sim | - | - | Conteudo estruturado em JSON relacionado a units. |
| job_title | varchar(180) | Sim | - | - | Campo do dominio `employees` referente a job title. |
| department | varchar(180) | Sim | - | - | Campo do dominio `employees` referente a department. |
| supervisor_name | varchar(180) | Sim | - | - | Nome de supervisor utilizado para exibicao, filtro ou agrupamento. |
| cost_center | varchar(180) | Sim | - | - | Valor monetario ou numerico referente a cost center. |
| insalubrity_percent | decimal(8,2) | Sim | - | - | Percentual/taxa referente a insalubrity percent. |
| transport_voucher_per_day | decimal(12,2) | Sim | - | - | Campo do dominio `employees` referente a transport voucher per day. |
| meal_voucher_per_day | decimal(12,2) | Sim | - | - | Campo do dominio `employees` referente a meal voucher per day. |
| life_insurance_status | varchar(20) | Nao | - | INATIVO | Status/etapa de life insurance status. |
| marital_status | varchar(20) | Sim | - | - | Status/etapa de marital status. |
| has_children | int | Nao | - | 0 | Campo do dominio `employees` referente a has children. |
| children_count | int | Nao | - | 0 | Quantidade/contagem referente a children count. |
| bank_name | varchar(180) | Sim | - | - | Nome de bank utilizado para exibicao, filtro ou agrupamento. |
| bank_agency | varchar(80) | Sim | - | - | Campo do dominio `employees` referente a bank agency. |
| bank_account | varchar(80) | Sim | - | - | Quantidade/contagem referente a bank account. |
| pix_key | varchar(180) | Sim | - | - | Campo do dominio `employees` referente a pix key. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| transport_voucher_mode | varchar(20) | Nao | - | PER_DAY | Campo do dominio `employees` referente a transport voucher mode. |
| transport_voucher_monthly_fixed | decimal(12,2) | Sim | - | - | Campo do dominio `employees` referente a transport voucher monthly fixed. |
| totalpass_discount_fixed | decimal(12,2) | Sim | - | - | Quantidade/contagem referente a totalpass discount fixed. |
| other_fixed_discount_amount | decimal(12,2) | Sim | - | - | Quantidade/contagem referente a other fixed discount amount. |
| other_fixed_discount_description | text | Sim | - | - | Quantidade/contagem referente a other fixed discount description. |
| payroll_notes | text | Sim | - | - | Campo do dominio `employees` referente a payroll notes. |

---

### `payroll_import_files`

- Finalidade: Arquivos importados para processamento da folha.
- Origem da informacao: Cadastro/manual do painel de RH/DP e importacoes de folha.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/payroll/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `10`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_payroll_import_files_period (period_id, created_at)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/payroll/repository.ts`
- Evidencias documentais: `apps/painel/docs/14-plano-tecnico-folha-pagamento.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md, apps/painel/docs/database/07-mapa-api-rotas-tabelas.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| period_id | varchar(64) | Nao | IDX | - | Identificador de period usado para relacionar ou localizar o registro na origem/aplicacao. |
| file_type | varchar(30) | Nao | - | - | Campo do dominio `payroll_import_files` referente a file type. |
| file_name | varchar(255) | Nao | - | - | Nome original ou amigavel do arquivo. |
| mime_type | varchar(120) | Nao | - | - | Tipo MIME do arquivo armazenado. |
| size_bytes | bigint | Nao | - | - | Campo do dominio `payroll_import_files` referente a size bytes. |
| storage_provider | varchar(30) | Nao | - | - | Campo do dominio `payroll_import_files` referente a storage provider. |
| storage_bucket | varchar(120) | Sim | - | - | Campo do dominio `payroll_import_files` referente a storage bucket. |
| storage_key | varchar(255) | Nao | - | - | Campo do dominio `payroll_import_files` referente a storage key. |
| processing_status | varchar(20) | Nao | - | - | Status/etapa de processing status. |
| processing_log | longtext | Sim | - | - | Campo do dominio `payroll_import_files` referente a processing log. |
| uploaded_by | varchar(64) | Sim | - | - | Campo do dominio `payroll_import_files` referente a uploaded by. |
| created_at | varchar(32) | Nao | - | - | Data/hora de criacao do registro no painel. |
| processed_at | varchar(32) | Sim | - | - | Data/hora de processamento efetivo do registro. |

---

### `payroll_lines`

- Finalidade: Linhas calculadas/importadas de folha.
- Origem da informacao: Cadastro/manual do painel de RH/DP e importacoes de folha.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/payroll/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `46`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_payroll_lines_period (period_id, employee_name); period_id (period_id, comparison_key) [UNQ]
- Vinculos principais: employee_id -> employees.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/payroll/repository.ts`
- Evidencias documentais: `apps/painel/docs/14-plano-tecnico-folha-pagamento.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| period_id | varchar(64) | Nao | IDX | - | Identificador de period usado para relacionar ou localizar o registro na origem/aplicacao. |
| employee_id | varchar(64) | Sim | - | - | Identificador do colaborador relacionado ao registro. |
| comparison_key | varchar(255) | Nao | - | - | Campo do dominio `payroll_lines` referente a comparison key. |
| employee_name | varchar(180) | Nao | - | - | Nome de employee utilizado para exibicao, filtro ou agrupamento. |
| employee_cpf | varchar(14) | Sim | - | - | Campo do dominio `payroll_lines` referente a employee cpf. |
| center_cost | varchar(180) | Sim | - | - | Valor monetario ou numerico referente a center cost. |
| unit_name | varchar(180) | Sim | - | - | Nome da unidade exibido/normalizado para consumo no painel. |
| contract_type | varchar(60) | Sim | - | - | Campo do dominio `payroll_lines` referente a contract type. |
| salary_base | decimal(12,2) | Nao | - | 0.00 | Valor monetario ou numerico referente a salary base. |
| insalubrity_percent | decimal(8,2) | Nao | - | 0.00 | Percentual/taxa referente a insalubrity percent. |
| insalubrity_amount | decimal(12,2) | Nao | - | 0.00 | Valor monetario ou numerico referente a insalubrity amount. |
| days_worked | int | Nao | - | 0 | Campo do dominio `payroll_lines` referente a days worked. |
| absences_count | int | Nao | - | 0 | Quantidade/contagem referente a absences count. |
| absence_discount | decimal(12,2) | Nao | - | 0.00 | Quantidade/contagem referente a absence discount. |
| late_minutes | int | Nao | - | 0 | Campo do dominio `payroll_lines` referente a late minutes. |
| late_discount | decimal(12,2) | Nao | - | 0.00 | Quantidade/contagem referente a late discount. |
| vt_provisioned | decimal(12,2) | Nao | - | 0.00 | Campo do dominio `payroll_lines` referente a vt provisioned. |
| vt_discount | decimal(12,2) | Nao | - | 0.00 | Quantidade/contagem referente a vt discount. |
| totalpass_discount | decimal(12,2) | Nao | - | 0.00 | Quantidade/contagem referente a totalpass discount. |
| other_fixed_discount | decimal(12,2) | Nao | - | 0.00 | Quantidade/contagem referente a other fixed discount. |
| other_fixed_discount_description | longtext | Sim | - | - | Quantidade/contagem referente a other fixed discount description. |
| adjustments_amount | decimal(12,2) | Nao | - | 0.00 | Valor monetario ou numerico referente a adjustments amount. |
| adjustments_notes | longtext | Sim | - | - | Campo do dominio `payroll_lines` referente a adjustments notes. |
| total_provents | decimal(12,2) | Nao | - | 0.00 | Quantidade/contagem referente a total provents. |
| total_discounts | decimal(12,2) | Nao | - | 0.00 | Quantidade/contagem referente a total discounts. |
| net_operational | decimal(12,2) | Nao | - | 0.00 | Campo do dominio `payroll_lines` referente a net operational. |
| line_status | varchar(20) | Nao | - | RASCUNHO | Status/etapa de line status. |
| payroll_notes | longtext | Sim | - | - | Campo do dominio `payroll_lines` referente a payroll notes. |
| employee_snapshot_json | longtext | Sim | - | - | Conteudo estruturado em JSON relacionado a employee snapshot. |
| calculation_memory_json | longtext | Sim | - | - | Conteudo estruturado em JSON relacionado a calculation memory. |
| comparison_status | varchar(20) | Nao | - | SEM_BASE | Status/etapa de comparison status. |
| created_at | varchar(32) | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `payroll_occurrences`

- Finalidade: Ocorrencias/apontamentos da folha.
- Origem da informacao: Cadastro/manual do painel de RH/DP e importacoes de folha.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/payroll/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_payroll_occurrences_period (period_id, employee_id, date_start)
- Vinculos principais: employee_id -> employees.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/payroll/repository.ts`
- Evidencias documentais: `apps/painel/docs/14-plano-tecnico-folha-pagamento.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| period_id | varchar(64) | Nao | IDX | - | Identificador de period usado para relacionar ou localizar o registro na origem/aplicacao. |
| employee_id | varchar(64) | Nao | - | - | Identificador do colaborador relacionado ao registro. |
| occurrence_type | varchar(30) | Nao | - | - | Campo do dominio `payroll_occurrences` referente a occurrence type. |
| date_start | date | Nao | - | - | Campo do dominio `payroll_occurrences` referente a date start. |
| date_end | date | Sim | - | - | Campo do dominio `payroll_occurrences` referente a date end. |
| effect_code | varchar(60) | Sim | - | - | Codigo de effect na origem ou em regra de negocio. |
| notes | longtext | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| storage_provider | varchar(30) | Sim | - | - | Campo do dominio `payroll_occurrences` referente a storage provider. |
| storage_bucket | varchar(120) | Sim | - | - | Campo do dominio `payroll_occurrences` referente a storage bucket. |
| storage_key | varchar(255) | Sim | - | - | Campo do dominio `payroll_occurrences` referente a storage key. |
| original_name | varchar(255) | Sim | - | - | Nome de original utilizado para exibicao, filtro ou agrupamento. |
| mime_type | varchar(120) | Sim | - | - | Tipo MIME do arquivo armazenado. |
| size_bytes | bigint | Sim | - | - | Campo do dominio `payroll_occurrences` referente a size bytes. |
| created_by | varchar(64) | Sim | - | - | Campo do dominio `payroll_occurrences` referente a created by. |
| updated_by | varchar(64) | Sim | - | - | Campo do dominio `payroll_occurrences` referente a updated by. |
| created_at | varchar(32) | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `payroll_periods`

- Finalidade: Competencias/peridos de fechamento da folha.
- Origem da informacao: Cadastro/manual do painel de RH/DP e importacoes de folha.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/payroll/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `2`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_payroll_periods_month_ref (month_ref); month_ref (month_ref) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/payroll/repository.ts`
- Evidencias documentais: `apps/painel/docs/14-plano-tecnico-folha-pagamento.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md, apps/painel/docs/database/07-mapa-api-rotas-tabelas.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| month_ref | varchar(7) | Nao | UNQ | - | Mes/competencia de referencia. |
| period_start | date | Nao | - | - | Campo do dominio `payroll_periods` referente a period start. |
| period_end | date | Nao | - | - | Campo do dominio `payroll_periods` referente a period end. |
| status | varchar(20) | Nao | - | - | Status operacional/negocial atual do registro. |
| rule_id | varchar(64) | Sim | - | - | Identificador de rule usado para relacionar ou localizar o registro na origem/aplicacao. |
| created_by | varchar(64) | Sim | - | - | Campo do dominio `payroll_periods` referente a created by. |
| approved_by | varchar(64) | Sim | - | - | Campo do dominio `payroll_periods` referente a approved by. |
| approved_at | varchar(32) | Sim | - | - | Data/hora referente a approved. |
| sent_at | varchar(32) | Sim | - | - | Data/hora referente a sent. |
| reopened_at | varchar(32) | Sim | - | - | Data/hora referente a reopened. |
| created_at | varchar(32) | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `payroll_point_daily`

- Finalidade: Apontamento diario de ponto consolidado.
- Origem da informacao: Cadastro/manual do painel de RH/DP e importacoes de folha.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/payroll/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `1890`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_payroll_point_daily_employee (period_id, employee_id); idx_payroll_point_daily_period (period_id, point_date)
- Vinculos principais: employee_id -> employees.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/payroll/repository.ts`
- Evidencias documentais: `apps/painel/docs/14-plano-tecnico-folha-pagamento.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| period_id | varchar(64) | Nao | IDX | - | Identificador de period usado para relacionar ou localizar o registro na origem/aplicacao. |
| employee_id | varchar(64) | Sim | - | - | Identificador do colaborador relacionado ao registro. |
| employee_code | varchar(60) | Sim | - | - | Codigo de employee na origem ou em regra de negocio. |
| employee_name | varchar(180) | Nao | - | - | Nome de employee utilizado para exibicao, filtro ou agrupamento. |
| employee_cpf | varchar(14) | Sim | - | - | Campo do dominio `payroll_point_daily` referente a employee cpf. |
| point_date | date | Nao | - | - | Data de point. |
| department | varchar(180) | Sim | - | - | Campo do dominio `payroll_point_daily` referente a department. |
| schedule_label | varchar(180) | Sim | - | - | Campo do dominio `payroll_point_daily` referente a schedule label. |
| schedule_start | varchar(10) | Sim | - | - | Campo do dominio `payroll_point_daily` referente a schedule start. |
| schedule_end | varchar(10) | Sim | - | - | Campo do dominio `payroll_point_daily` referente a schedule end. |
| marks_json | longtext | Sim | - | - | Conteudo estruturado em JSON relacionado a marks. |
| raw_day_text | longtext | Sim | - | - | Campo do dominio `payroll_point_daily` referente a raw day text. |
| worked_minutes | int | Nao | - | 0 | Campo do dominio `payroll_point_daily` referente a worked minutes. |
| late_minutes | int | Nao | - | 0 | Campo do dominio `payroll_point_daily` referente a late minutes. |
| absence_flag | int | Nao | - | 0 | Indicador logico relacionado a absence. |
| inconsistency_flag | int | Nao | - | 0 | Indicador logico relacionado a inconsistency. |
| justification_text | longtext | Sim | - | - | Campo do dominio `payroll_point_daily` referente a justification text. |
| source_file_id | varchar(64) | Sim | - | - | Identificador de source file usado para relacionar ou localizar o registro na origem/aplicacao. |
| created_at | varchar(32) | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `payroll_point_import_jobs`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Cadastro/manual do painel de RH/DP e importacoes de folha.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_payroll_point_import.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `7`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_payroll_point_import_jobs_import_file (import_file_id); idx_payroll_point_import_jobs_period (period_id, created_at); idx_payroll_point_import_jobs_status (status, created_at)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_payroll_point_import.py`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| period_id | varchar(64) | Nao | IDX | - | Identificador de period usado para relacionar ou localizar o registro na origem/aplicacao. |
| import_file_id | varchar(64) | Nao | IDX | - | Identificador de import file usado para relacionar ou localizar o registro na origem/aplicacao. |
| status | varchar(20) | Nao | IDX | - | Status operacional/negocial atual do registro. |
| requested_by | varchar(64) | Sim | - | - | Campo do dominio `payroll_point_import_jobs` referente a requested by. |
| error_message | longtext | Sim | - | - | Mensagem de erro registrada durante processamento. |
| created_at | varchar(32) | Nao | - | - | Data/hora de criacao do registro no painel. |
| started_at | varchar(32) | Sim | - | - | Data/hora referente a started. |
| finished_at | varchar(32) | Sim | - | - | Data/hora referente a finished. |

---

### `payroll_reference_rows`

- Finalidade: Linhas de referencia para conciliacao.
- Origem da informacao: Cadastro/manual do painel de RH/DP e importacoes de folha.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/payroll/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_payroll_reference_rows_period (period_id, comparison_key)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/payroll/repository.ts`
- Evidencias documentais: `apps/painel/docs/14-plano-tecnico-folha-pagamento.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md, apps/painel/docs/database/07-mapa-api-rotas-tabelas.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| period_id | varchar(64) | Nao | IDX | - | Identificador de period usado para relacionar ou localizar o registro na origem/aplicacao. |
| employee_name | varchar(180) | Nao | - | - | Nome de employee utilizado para exibicao, filtro ou agrupamento. |
| employee_cpf | varchar(14) | Sim | - | - | Campo do dominio `payroll_reference_rows` referente a employee cpf. |
| center_cost | varchar(180) | Sim | - | - | Valor monetario ou numerico referente a center cost. |
| role_name | varchar(180) | Sim | - | - | Nome de role utilizado para exibicao, filtro ou agrupamento. |
| contract_type | varchar(60) | Sim | - | - | Campo do dominio `payroll_reference_rows` referente a contract type. |
| salary_base | decimal(12,2) | Sim | - | - | Valor monetario ou numerico referente a salary base. |
| insalubrity_percent | decimal(8,2) | Sim | - | - | Percentual/taxa referente a insalubrity percent. |
| vt_day | decimal(12,2) | Sim | - | - | Campo do dominio `payroll_reference_rows` referente a vt day. |
| vt_month | decimal(12,2) | Sim | - | - | Campo do dominio `payroll_reference_rows` referente a vt month. |
| vt_discount | decimal(12,2) | Sim | - | - | Quantidade/contagem referente a vt discount. |
| other_discounts | decimal(12,2) | Sim | - | - | Quantidade/contagem referente a other discounts. |
| totalpass_discount | decimal(12,2) | Sim | - | - | Quantidade/contagem referente a totalpass discount. |
| notes | longtext | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| raw_json | longtext | Sim | - | - | Conteudo estruturado em JSON relacionado a raw. |
| comparison_key | varchar(255) | Nao | - | - | Campo do dominio `payroll_reference_rows` referente a comparison key. |
| created_at | varchar(32) | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `payroll_rules`

- Finalidade: Regras parametrizadas da folha.
- Origem da informacao: Cadastro/manual do painel de RH/DP e importacoes de folha.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/payroll/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `2`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; month_ref (month_ref) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/payroll/repository.ts`
- Evidencias documentais: `apps/painel/docs/14-plano-tecnico-folha-pagamento.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md, apps/painel/docs/database/07-mapa-api-rotas-tabelas.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| month_ref | varchar(7) | Nao | UNQ | - | Mes/competencia de referencia. |
| min_wage_amount | decimal(12,2) | Nao | - | - | Valor monetario ou numerico referente a min wage amount. |
| late_tolerance_minutes | int | Nao | - | 15 | Campo do dominio `payroll_rules` referente a late tolerance minutes. |
| vt_discount_cap_percent | decimal(8,2) | Nao | - | 6.00 | Quantidade/contagem referente a vt discount cap percent. |
| created_at | varchar(32) | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | varchar(32) | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `professional_audit_log`

- Finalidade: Auditoria do cadastro de profissionais.
- Origem da informacao: Integracao Feegow.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_feegow_professionals_sync.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `207`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: professional_id -> professionals.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `workers/worker_feegow_professionals_sync.py`
- Evidencias documentais: `apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/05-runbook-operacional.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| professional_id | varchar(64) | Sim | - | - | Identificador do profissional relacionado ao registro. |
| action | varchar(60) | Nao | - | - | Campo do dominio `professional_audit_log` referente a action. |
| actor_user_id | varchar(64) | Nao | - | - | Identificador de actor user usado para relacionar ou localizar o registro na origem/aplicacao. |
| payload_json | longtext | Sim | - | - | Payload bruto ou quase bruto em JSON para auditoria/reprocessamento. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `professional_contracts`

- Finalidade: Historico e metadados de contratos de profissionais.
- Origem da informacao: Cadastro/manual do painel de profissionais e sincronizacoes auxiliares.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/profissionais/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `12`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: professional_id -> professionals.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/profissionais/repository.ts`
- Evidencias documentais: `apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/05-runbook-operacional.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| professional_id | varchar(64) | Nao | - | - | Identificador do profissional relacionado ao registro. |
| template_key | varchar(80) | Nao | - | - | Campo do dominio `professional_contracts` referente a template key. |
| template_version | varchar(20) | Nao | - | - | Campo do dominio `professional_contracts` referente a template version. |
| status | varchar(20) | Nao | - | - | Status operacional/negocial atual do registro. |
| storage_provider | varchar(30) | Sim | - | - | Campo do dominio `professional_contracts` referente a storage provider. |
| storage_bucket | varchar(120) | Sim | - | - | Campo do dominio `professional_contracts` referente a storage bucket. |
| storage_key | varchar(255) | Sim | - | - | Campo do dominio `professional_contracts` referente a storage key. |
| generated_by | varchar(64) | Nao | - | - | Percentual/taxa referente a generated by. |
| generated_at | text | Sim | - | - | Data/hora referente a generated. |
| error_message | text | Sim | - | - | Mensagem de erro registrada durante processamento. |
| meta_json | longtext | Sim | - | - | Conteudo estruturado em JSON relacionado a meta. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `professional_document_checklist`

- Finalidade: Checklist de documentos obrigatorios por profissional.
- Origem da informacao: Integracao Feegow.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_feegow_professionals_sync.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `90`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; professional_id (professional_id, doc_type) [UNQ]
- Vinculos principais: professional_id -> professionals.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `workers/worker_feegow_professionals_sync.py`
- Evidencias documentais: `apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/01-visao-funcional-e-indicadores.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| professional_id | varchar(64) | Nao | IDX | - | Identificador do profissional relacionado ao registro. |
| doc_type | varchar(40) | Nao | - | - | Campo do dominio `professional_document_checklist` referente a doc type. |
| has_physical_copy | int | Nao | - | 0 | Campo do dominio `professional_document_checklist` referente a has physical copy. |
| has_digital_copy | int | Nao | - | 0 | Campo do dominio `professional_document_checklist` referente a has digital copy. |
| expires_at | date | Sim | - | - | Data/hora referente a expires. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| verified_by | varchar(64) | Nao | - | - | Campo do dominio `professional_document_checklist` referente a verified by. |
| verified_at | text | Nao | - | - | Data/hora referente a verified. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `professional_documents`

- Finalidade: Documentos ativos dos profissionais.
- Origem da informacao: Cadastro/manual do painel de profissionais e sincronizacoes auxiliares.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/profissionais/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `53`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: professional_id -> professionals.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/profissionais/repository.ts`
- Evidencias documentais: `apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/05-runbook-operacional.md, apps/painel/docs/01-visao-funcional-e-indicadores.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| professional_id | varchar(64) | Nao | - | - | Identificador do profissional relacionado ao registro. |
| doc_type | varchar(40) | Nao | - | - | Campo do dominio `professional_documents` referente a doc type. |
| storage_provider | varchar(30) | Nao | - | - | Campo do dominio `professional_documents` referente a storage provider. |
| storage_bucket | varchar(120) | Sim | - | - | Campo do dominio `professional_documents` referente a storage bucket. |
| storage_key | varchar(255) | Nao | - | - | Campo do dominio `professional_documents` referente a storage key. |
| original_name | varchar(255) | Nao | - | - | Nome de original utilizado para exibicao, filtro ou agrupamento. |
| mime_type | varchar(120) | Nao | - | - | Tipo MIME do arquivo armazenado. |
| size_bytes | bigint | Nao | - | - | Campo do dominio `professional_documents` referente a size bytes. |
| expires_at | date | Sim | - | - | Data/hora referente a expires. |
| is_active | int | Nao | - | 1 | Indicador logico de atividade do registro. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| uploaded_by | varchar(64) | Nao | - | - | Campo do dominio `professional_documents` referente a uploaded by. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `professional_documents_inactive`

- Finalidade: Historico de documentos inativos de profissionais.
- Origem da informacao: Cadastro/manual do painel de profissionais e sincronizacoes auxiliares.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/profissionais/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_prof_documents_inactive_prof (professional_id); source_document_id (source_document_id) [UNQ]
- Vinculos principais: professional_id -> professionals.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/profissionais/repository.ts`
- Evidencias documentais: `apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/05-runbook-operacional.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| source_document_id | varchar(64) | Nao | UNQ | - | Identificador de source document usado para relacionar ou localizar o registro na origem/aplicacao. |
| professional_id | varchar(64) | Nao | IDX | - | Identificador do profissional relacionado ao registro. |
| doc_type | varchar(40) | Nao | - | - | Campo do dominio `professional_documents_inactive` referente a doc type. |
| storage_provider | varchar(30) | Nao | - | - | Campo do dominio `professional_documents_inactive` referente a storage provider. |
| storage_bucket | varchar(120) | Sim | - | - | Campo do dominio `professional_documents_inactive` referente a storage bucket. |
| storage_key | varchar(255) | Nao | - | - | Campo do dominio `professional_documents_inactive` referente a storage key. |
| original_name | varchar(255) | Nao | - | - | Nome de original utilizado para exibicao, filtro ou agrupamento. |
| mime_type | varchar(120) | Nao | - | - | Tipo MIME do arquivo armazenado. |
| size_bytes | bigint | Nao | - | - | Campo do dominio `professional_documents_inactive` referente a size bytes. |
| expires_at | date | Sim | - | - | Data/hora referente a expires. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| inactive_reason | varchar(30) | Nao | - | - | Campo do dominio `professional_documents_inactive` referente a inactive reason. |
| uploaded_by | varchar(64) | Nao | - | - | Campo do dominio `professional_documents_inactive` referente a uploaded by. |
| original_created_at | text | Nao | - | - | Data/hora referente a original created. |
| archived_by | varchar(64) | Nao | - | - | Campo do dominio `professional_documents_inactive` referente a archived by. |
| archived_at | text | Nao | - | - | Data/hora referente a archived. |

---

### `professional_procedure_rates`

- Finalidade: Valores/repasses por profissional x procedimento.
- Origem da informacao: Cadastro/manual do painel de profissionais e sincronizacoes auxiliares.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/profissionais/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `9`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_prof_proc_rates_prof (professional_id); professional_id (professional_id, procedimento_id) [UNQ]
- Vinculos principais: professional_id -> professionals.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/profissionais/repository.ts`
- Evidencias documentais: `apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/05-runbook-operacional.md, apps/painel/docs/01-visao-funcional-e-indicadores.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| professional_id | varchar(64) | Nao | IDX | - | Identificador do profissional relacionado ao registro. |
| procedimento_id | bigint | Nao | - | - | Identificador de procedimento usado para relacionar ou localizar o registro na origem/aplicacao. |
| procedimento_nome | varchar(255) | Nao | - | - | Campo do dominio `professional_procedure_rates` referente a procedimento nome. |
| valor_base | decimal(12,2) | Nao | - | 0.00 | Campo do dominio `professional_procedure_rates` referente a valor base. |
| valor_profissional | decimal(12,2) | Nao | - | 0.00 | Campo do dominio `professional_procedure_rates` referente a valor profissional. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `professional_registrations`

- Finalidade: Registros profissionais (CRM, conselho, UF etc.).
- Origem da informacao: Integracao Feegow.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_feegow_professionals_sync.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `109`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; council_type (council_type, council_number, council_uf) [UNQ]
- Vinculos principais: professional_id -> professionals.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `workers/worker_feegow_professionals_sync.py`
- Evidencias documentais: `apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/01-visao-funcional-e-indicadores.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| professional_id | varchar(64) | Nao | - | - | Identificador do profissional relacionado ao registro. |
| council_type | varchar(10) | Nao | IDX | - | Campo do dominio `professional_registrations` referente a council type. |
| council_number | varchar(40) | Nao | - | - | Campo do dominio `professional_registrations` referente a council number. |
| council_uf | varchar(2) | Nao | - | - | Campo do dominio `professional_registrations` referente a council uf. |
| is_primary | int | Nao | - | 0 | Indicador logico relacionado a primary. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |
| rqe | varchar(40) | Sim | - | - | Campo do dominio `professional_registrations` referente a rqe. |

---

### `professionals`

- Finalidade: Cadastro principal de profissionais/prestadores.
- Origem da informacao: Integracao Feegow.
- Escrita/manutencao tecnica: Escrita principal realizada por worker/rotina em `workers/worker_feegow_professionals_sync.py`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `141`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; cnpj (cnpj) [UNQ]; cpf (cpf) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `workers/worker_feegow_professionals_sync.py`
- Evidencias documentais: `apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/05-runbook-operacional.md, apps/painel/docs/07-plano-tecnico-repasses.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| name | varchar(180) | Nao | - | - | Nome principal do registro. |
| contract_party_type | varchar(2) | Nao | - | - | Campo do dominio `professionals` referente a contract party type. |
| contract_type | varchar(40) | Nao | - | - | Campo do dominio `professionals` referente a contract type. |
| cpf | varchar(14) | Sim | UNQ | - | Campo do dominio `professionals` referente a cpf. |
| cnpj | varchar(18) | Sim | UNQ | - | Campo do dominio `professionals` referente a cnpj. |
| legal_name | varchar(180) | Sim | - | - | Nome de legal utilizado para exibicao, filtro ou agrupamento. |
| specialty | varchar(120) | Nao | - | - | Campo do dominio `professionals` referente a specialty. |
| personal_doc_type | varchar(10) | Nao | - | - | Campo do dominio `professionals` referente a personal doc type. |
| personal_doc_number | varchar(40) | Nao | - | - | Campo do dominio `professionals` referente a personal doc number. |
| address_text | text | Nao | - | - | Campo do dominio `professionals` referente a address text. |
| is_active | int | Nao | - | 1 | Indicador logico de atividade do registro. |
| has_physical_folder | int | Nao | - | 0 | Campo do dominio `professionals` referente a has physical folder. |
| physical_folder_note | text | Sim | - | - | Campo do dominio `professionals` referente a physical folder note. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |
| contract_start_date | date | Sim | - | - | Data de contract start. |
| contract_end_date | date | Sim | - | - | Data de contract end. |
| phone | varchar(40) | Sim | - | - | Campo do dominio `professionals` referente a phone. |
| email | varchar(180) | Sim | - | - | Endereco de e-mail associado ao registro. |
| age_range | varchar(60) | Sim | - | - | Campo do dominio `professionals` referente a age range. |
| service_units_json | longtext | Sim | - | - | Conteudo estruturado em JSON relacionado a service units. |
| has_feegow_permissions | int | Nao | - | 0 | Campo do dominio `professionals` referente a has feegow permissions. |
| primary_specialty | varchar(120) | Sim | - | - | Campo do dominio `professionals` referente a primary specialty. |
| specialties_json | longtext | Sim | - | - | Conteudo estruturado em JSON relacionado a specialties. |
| contract_template_id | varchar(64) | Sim | - | - | Identificador de contract template usado para relacionar ou localizar o registro na origem/aplicacao. |
| payment_minimum_text | text | Sim | - | - | Campo do dominio `professionals` referente a payment minimum text. |
| attendance_modes_json | longtext | Sim | - | - | Conteudo estruturado em JSON relacionado a attendance modes. |
| service_locations_text_json | longtext | Sim | - | - | Conteudo estruturado em JSON relacionado a service locations text. |
| patient_age_text | text | Sim | - | - | Campo do dominio `professionals` referente a patient age text. |
| walk_in_policy_text | text | Sim | - | - | Campo do dominio `professionals` referente a walk in policy text. |
| ideal_room_text | text | Sim | - | - | Campo do dominio `professionals` referente a ideal room text. |
| intranet_notes_text | text | Sim | - | - | Campo do dominio `professionals` referente a intranet notes text. |

---

## Qualidade, documentos regulatorios e equipamentos

### `clinic_equipment`

- Finalidade: Cadastro mestre de equipamentos clinicos.
- Origem da informacao: Cadastro/manual do painel de equipamentos.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/equipamentos/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `57`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_clinic_equipment_next_calibration (next_calibration_date); idx_clinic_equipment_status (operational_status); idx_clinic_equipment_type (equipment_type); idx_clinic_equipment_unit (unit_name)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/equipamentos/repository.ts`
- Evidencias documentais: `apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/11-plano-tecnico-equipamentos.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| unit_name | varchar(180) | Nao | IDX | - | Nome da unidade exibido/normalizado para consumo no painel. |
| description | varchar(255) | Nao | - | - | Descricao textual do registro. |
| identification_number | varchar(120) | Nao | - | - | Campo do dominio `clinic_equipment` referente a identification number. |
| barcode_value | varchar(180) | Sim | - | - | Valor monetario ou numerico referente a barcode value. |
| category | varchar(120) | Sim | - | - | Campo do dominio `clinic_equipment` referente a category. |
| manufacturer | varchar(180) | Sim | - | - | Campo do dominio `clinic_equipment` referente a manufacturer. |
| model | varchar(180) | Sim | - | - | Campo do dominio `clinic_equipment` referente a model. |
| serial_number | varchar(180) | Sim | - | - | Campo do dominio `clinic_equipment` referente a serial number. |
| location_detail | varchar(180) | Sim | - | - | Campo do dominio `clinic_equipment` referente a location detail. |
| operational_status | varchar(30) | Nao | IDX | - | Status/etapa de operational status. |
| calibration_required | int | Nao | - | 1 | Campo do dominio `clinic_equipment` referente a calibration required. |
| calibration_frequency_days | int | Sim | - | - | Campo do dominio `clinic_equipment` referente a calibration frequency days. |
| last_calibration_date | date | Sim | - | - | Data de last calibration. |
| next_calibration_date | date | Sim | IDX | - | Data de next calibration. |
| calibration_responsible | varchar(180) | Sim | - | - | Campo do dominio `clinic_equipment` referente a calibration responsible. |
| calibration_notes | text | Sim | - | - | Campo do dominio `clinic_equipment` referente a calibration notes. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |
| equipment_type | varchar(30) | Nao | IDX | OPERACIONAL | Campo do dominio `clinic_equipment` referente a equipment type. |

---

### `clinic_equipment_events`

- Finalidade: Historico de eventos/manutencoes/calibracoes dos equipamentos.
- Origem da informacao: Cadastro/manual do painel de equipamentos.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/equipamentos/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `2`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_clinic_equipment_events_equipment (equipment_id)
- Vinculos principais: equipment_id -> clinic_equipment.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/equipamentos/repository.ts`
- Evidencias documentais: `apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/11-plano-tecnico-equipamentos.md, apps/painel/docs/01-visao-funcional-e-indicadores.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| equipment_id | varchar(64) | Nao | IDX | - | Identificador do equipamento relacionado ao registro. |
| event_date | date | Sim | - | - | Data de event. |
| event_type | varchar(40) | Nao | - | - | Campo do dominio `clinic_equipment_events` referente a event type. |
| description | text | Nao | - | - | Descricao textual do registro. |
| handled_by | varchar(180) | Sim | - | - | Campo do dominio `clinic_equipment_events` referente a handled by. |
| status | varchar(30) | Nao | - | - | Status operacional/negocial atual do registro. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `clinic_equipment_files`

- Finalidade: Arquivos vinculados aos equipamentos.
- Origem da informacao: Cadastro/manual do painel de equipamentos.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/equipamentos/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `20`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_clinic_equipment_files_equipment (equipment_id)
- Vinculos principais: equipment_id -> clinic_equipment.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/equipamentos/repository.ts`
- Evidencias documentais: `apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/11-plano-tecnico-equipamentos.md, apps/painel/docs/01-visao-funcional-e-indicadores.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| equipment_id | varchar(64) | Nao | IDX | - | Identificador do equipamento relacionado ao registro. |
| file_type | varchar(30) | Nao | - | - | Campo do dominio `clinic_equipment_files` referente a file type. |
| storage_provider | varchar(30) | Nao | - | - | Campo do dominio `clinic_equipment_files` referente a storage provider. |
| storage_bucket | varchar(120) | Sim | - | - | Campo do dominio `clinic_equipment_files` referente a storage bucket. |
| storage_key | varchar(255) | Nao | - | - | Campo do dominio `clinic_equipment_files` referente a storage key. |
| original_name | varchar(255) | Nao | - | - | Nome de original utilizado para exibicao, filtro ou agrupamento. |
| mime_type | varchar(120) | Nao | - | - | Tipo MIME do arquivo armazenado. |
| size_bytes | bigint | Nao | - | - | Campo do dominio `clinic_equipment_files` referente a size bytes. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| uploaded_by | varchar(64) | Nao | - | - | Campo do dominio `clinic_equipment_files` referente a uploaded by. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `health_surveillance_document_licenses`

- Finalidade: Relacionamento entre documentos e licencas regulatorias.
- Origem da informacao: Cadastro/manual do painel de vigilancia sanitaria.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/vigilancia_sanitaria/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `292`
- Chave primaria: `document_id, license_id`
- Indices: PRIMARY (document_id, license_id) [UNQ]; idx_hs_document_links_document (document_id); idx_hs_document_links_license (license_id)
- Vinculos principais: document_id -> health_surveillance_documents.id (vinculo logico); license_id -> health_surveillance_licenses.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/vigilancia_sanitaria/repository.ts`
- Evidencias documentais: `apps/painel/docs/13-plano-tecnico-vigilancia-sanitaria.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| document_id | varchar(64) | Nao | PK | - | Identificador do documento relacionado ao registro. |
| license_id | varchar(64) | Nao | PK | - | Identificador da licenca relacionada ao registro. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `health_surveillance_documents`

- Finalidade: Documentos regulatorios de vigilancia sanitaria.
- Origem da informacao: Cadastro/manual do painel de vigilancia sanitaria.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/vigilancia_sanitaria/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `94`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_hs_documents_license (license_id); idx_hs_documents_unit (unit_name); idx_hs_documents_valid (valid_until)
- Vinculos principais: license_id -> health_surveillance_licenses.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/vigilancia_sanitaria/repository.ts`
- Evidencias documentais: `apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/13-plano-tecnico-vigilancia-sanitaria.md, apps/painel/docs/01-visao-funcional-e-indicadores.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| unit_name | varchar(180) | Nao | IDX | - | Nome da unidade exibido/normalizado para consumo no painel. |
| document_name | varchar(255) | Nao | - | - | Nome de document utilizado para exibicao, filtro ou agrupamento. |
| document_type | varchar(40) | Sim | - | - | Campo do dominio `health_surveillance_documents` referente a document type. |
| license_id | varchar(64) | Sim | IDX | - | Identificador da licenca relacionada ao registro. |
| valid_until | date | Sim | IDX | - | Campo do dominio `health_surveillance_documents` referente a valid until. |
| responsible_name | varchar(180) | Sim | - | - | Nome de responsible utilizado para exibicao, filtro ou agrupamento. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| is_active | int | Nao | - | 1 | Indicador logico de atividade do registro. |
| created_by | varchar(64) | Sim | - | - | Campo do dominio `health_surveillance_documents` referente a created by. |
| updated_by | varchar(64) | Sim | - | - | Campo do dominio `health_surveillance_documents` referente a updated by. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `health_surveillance_files`

- Finalidade: Arquivos anexos de vigilancia sanitaria.
- Origem da informacao: Cadastro/manual do painel de vigilancia sanitaria.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/vigilancia_sanitaria/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `119`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_hs_files_entity (entity_type, entity_id)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/vigilancia_sanitaria/repository.ts`
- Evidencias documentais: `apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/13-plano-tecnico-vigilancia-sanitaria.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| entity_type | varchar(20) | Nao | IDX | - | Campo do dominio `health_surveillance_files` referente a entity type. |
| entity_id | varchar(64) | Nao | - | - | Identificador de entity usado para relacionar ou localizar o registro na origem/aplicacao. |
| storage_provider | varchar(30) | Nao | - | - | Campo do dominio `health_surveillance_files` referente a storage provider. |
| storage_bucket | varchar(120) | Sim | - | - | Campo do dominio `health_surveillance_files` referente a storage bucket. |
| storage_key | varchar(255) | Nao | - | - | Campo do dominio `health_surveillance_files` referente a storage key. |
| original_name | varchar(255) | Nao | - | - | Nome de original utilizado para exibicao, filtro ou agrupamento. |
| mime_type | varchar(120) | Nao | - | - | Tipo MIME do arquivo armazenado. |
| size_bytes | bigint | Nao | - | - | Campo do dominio `health_surveillance_files` referente a size bytes. |
| uploaded_by | varchar(64) | Nao | - | - | Campo do dominio `health_surveillance_files` referente a uploaded by. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `health_surveillance_licenses`

- Finalidade: Cadastro de licencas e alvaras regulatorios.
- Origem da informacao: Cadastro/manual do painel de vigilancia sanitaria.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/vigilancia_sanitaria/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `29`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_hs_licenses_unit (unit_name); idx_hs_licenses_valid (valid_until)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/vigilancia_sanitaria/repository.ts`
- Evidencias documentais: `apps/painel/docs/03-arquitetura-tecnica.md, apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/13-plano-tecnico-vigilancia-sanitaria.md, apps/painel/docs/01-visao-funcional-e-indicadores.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| unit_name | varchar(180) | Nao | IDX | - | Nome da unidade exibido/normalizado para consumo no painel. |
| license_name | varchar(255) | Nao | - | - | Nome de license utilizado para exibicao, filtro ou agrupamento. |
| cnae | varchar(80) | Nao | - | - | Campo do dominio `health_surveillance_licenses` referente a cnae. |
| license_number | varchar(120) | Sim | - | - | Campo do dominio `health_surveillance_licenses` referente a license number. |
| issuer | varchar(180) | Sim | - | - | Campo do dominio `health_surveillance_licenses` referente a issuer. |
| valid_until | date | Nao | IDX | - | Campo do dominio `health_surveillance_licenses` referente a valid until. |
| renewal_status | varchar(40) | Nao | - | - | Status/etapa de renewal status. |
| responsible_name | varchar(180) | Sim | - | - | Nome de responsible utilizado para exibicao, filtro ou agrupamento. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| is_active | int | Nao | - | 1 | Indicador logico de atividade do registro. |
| created_by | varchar(64) | Sim | - | - | Campo do dominio `health_surveillance_licenses` referente a created by. |
| updated_by | varchar(64) | Sim | - | - | Campo do dominio `health_surveillance_licenses` referente a updated by. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `qms_audit_actions`

- Finalidade: Plano de acoes vinculado a auditorias QMS.
- Origem da informacao: Cadastro/manual do modulo de qualidade e treinamentos.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/qms/audits_repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: audit_id -> qms_audits.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/qms/audits_repository.ts`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/05-runbook-operacional.md, apps/painel/docs/06-plano-tecnico-qualidade-treinamentos.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| audit_id | varchar(64) | Nao | - | - | Identificador da auditoria relacionada ao registro. |
| description | text | Nao | - | - | Descricao textual do registro. |
| owner | varchar(140) | Sim | - | - | Campo do dominio `qms_audit_actions` referente a owner. |
| deadline | text | Sim | - | - | Campo do dominio `qms_audit_actions` referente a deadline. |
| status | varchar(30) | Nao | - | aberta | Status operacional/negocial atual do registro. |
| completion_note | text | Sim | - | - | Campo do dominio `qms_audit_actions` referente a completion note. |
| created_by | varchar(64) | Nao | - | - | Campo do dominio `qms_audit_actions` referente a created by. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_by | varchar(64) | Nao | - | - | Campo do dominio `qms_audit_actions` referente a updated by. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `qms_audit_log`

- Finalidade: Auditoria tecnica das alteracoes no modulo QMS.
- Origem da informacao: Cadastro/manual do modulo de qualidade e treinamentos.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/qms/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `54`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/qms/repository.ts`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/06-plano-tecnico-qualidade-treinamentos.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| entity_type | varchar(60) | Nao | - | - | Campo do dominio `qms_audit_log` referente a entity type. |
| entity_id | varchar(64) | Nao | - | - | Identificador de entity usado para relacionar ou localizar o registro na origem/aplicacao. |
| action | varchar(60) | Nao | - | - | Campo do dominio `qms_audit_log` referente a action. |
| before_json | longtext | Sim | - | - | Conteudo estruturado em JSON relacionado a before. |
| after_json | longtext | Sim | - | - | Conteudo estruturado em JSON relacionado a after. |
| actor_user_id | varchar(64) | Nao | - | - | Identificador de actor user usado para relacionar ou localizar o registro na origem/aplicacao. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `qms_audits`

- Finalidade: Cadastro e acompanhamento de auditorias de qualidade.
- Origem da informacao: Cadastro/manual do modulo de qualidade e treinamentos.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/qms/audits_repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `1`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; code (code) [UNQ]
- Vinculos principais: document_id -> qms_documents.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/qms/audits_repository.ts`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/05-runbook-operacional.md, apps/painel/docs/06-plano-tecnico-qualidade-treinamentos.md, apps/painel/docs/01-visao-funcional-e-indicadores.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| code | varchar(40) | Nao | UNQ | - | Campo do dominio `qms_audits` referente a code. |
| document_id | varchar(64) | Nao | - | - | Identificador do documento relacionado ao registro. |
| document_version_id | varchar(64) | Nao | - | - | Identificador de document version usado para relacionar ou localizar o registro na origem/aplicacao. |
| responsible | varchar(140) | Sim | - | - | Campo do dominio `qms_audits` referente a responsible. |
| audit_date | text | Sim | - | - | Data de audit. |
| compliance_percent | decimal(10,2) | Sim | - | - | Percentual/taxa referente a compliance percent. |
| non_conformity | text | Sim | - | - | Campo do dominio `qms_audits` referente a non conformity. |
| action_plan | text | Sim | - | - | Campo do dominio `qms_audits` referente a action plan. |
| correction_deadline | text | Sim | - | - | Campo do dominio `qms_audits` referente a correction deadline. |
| reassessed | int | Nao | - | 0 | Campo do dominio `qms_audits` referente a reassessed. |
| effectiveness_check_date | text | Sim | - | - | Data de effectiveness check. |
| criticality | varchar(20) | Nao | - | media | Campo do dominio `qms_audits` referente a criticality. |
| status | varchar(30) | Nao | - | aberta | Status operacional/negocial atual do registro. |
| created_by | varchar(64) | Nao | - | - | Campo do dominio `qms_audits` referente a created by. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_by | varchar(64) | Nao | - | - | Campo do dominio `qms_audits` referente a updated by. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `qms_document_files`

- Finalidade: Arquivos/anexos das versoes de documentos QMS.
- Origem da informacao: Cadastro/manual do modulo de qualidade e treinamentos.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/qms/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `18`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/qms/repository.ts`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/06-plano-tecnico-qualidade-treinamentos.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md, apps/painel/docs/database/01-visao-geral-do-schema-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| document_version_id | varchar(64) | Nao | - | - | Identificador de document version usado para relacionar ou localizar o registro na origem/aplicacao. |
| storage_provider | varchar(30) | Nao | - | - | Campo do dominio `qms_document_files` referente a storage provider. |
| storage_bucket | varchar(120) | Sim | - | - | Campo do dominio `qms_document_files` referente a storage bucket. |
| storage_key | varchar(255) | Nao | - | - | Campo do dominio `qms_document_files` referente a storage key. |
| filename | varchar(255) | Nao | - | - | Campo do dominio `qms_document_files` referente a filename. |
| mime_type | varchar(120) | Nao | - | - | Tipo MIME do arquivo armazenado. |
| size_bytes | bigint | Nao | - | - | Campo do dominio `qms_document_files` referente a size bytes. |
| uploaded_by | varchar(64) | Nao | - | - | Campo do dominio `qms_document_files` referente a uploaded by. |
| uploaded_at | text | Nao | - | - | Data/hora referente a uploaded. |
| is_active | int | Nao | - | 1 | Indicador logico de atividade do registro. |

---

### `qms_document_training_links`

- Finalidade: Vinculo entre documentos QMS e treinamentos.
- Origem da informacao: Cadastro/manual do modulo de qualidade e treinamentos.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/qms/trainings_repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `1`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: document_id -> qms_documents.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/qms/trainings_repository.ts`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/06-plano-tecnico-qualidade-treinamentos.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| document_id | varchar(64) | Nao | - | - | Identificador do documento relacionado ao registro. |
| training_plan_id | varchar(64) | Nao | - | - | Identificador de training plan usado para relacionar ou localizar o registro na origem/aplicacao. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `qms_document_versions`

- Finalidade: Versionamento formal dos documentos do QMS.
- Origem da informacao: Cadastro/manual do modulo de qualidade e treinamentos.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/qms/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `19`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: document_id -> qms_documents.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/qms/repository.ts`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/06-plano-tecnico-qualidade-treinamentos.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| document_id | varchar(64) | Nao | - | - | Identificador do documento relacionado ao registro. |
| version_label | varchar(30) | Nao | - | - | Campo do dominio `qms_document_versions` referente a version label. |
| elaborated_by | varchar(140) | Sim | - | - | Percentual/taxa referente a elaborated by. |
| reviewed_by | varchar(140) | Sim | - | - | Campo do dominio `qms_document_versions` referente a reviewed by. |
| approved_by | varchar(140) | Sim | - | - | Campo do dominio `qms_document_versions` referente a approved by. |
| creation_date | text | Sim | - | - | Data de creation. |
| last_review_date | text | Sim | - | - | Data de last review. |
| next_review_date | text | Sim | - | - | Data de next review. |
| linked_training_ref | varchar(140) | Sim | - | - | Campo do dominio `qms_document_versions` referente a linked training referencia. |
| revision_reason | text | Sim | - | - | Campo do dominio `qms_document_versions` referente a revision reason. |
| scope | text | Sim | - | - | Campo do dominio `qms_document_versions` referente a scope. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| is_current | int | Nao | - | 0 | Indicador logico relacionado a current. |
| created_by | varchar(64) | Nao | - | - | Campo do dominio `qms_document_versions` referente a created by. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `qms_documents`

- Finalidade: Cadastro mestre de documentos do sistema de qualidade.
- Origem da informacao: Cadastro/manual do modulo de qualidade e treinamentos.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/qms/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `19`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; code (code) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/qms/repository.ts`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/06-plano-tecnico-qualidade-treinamentos.md, apps/painel/docs/01-visao-funcional-e-indicadores.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| code | varchar(40) | Nao | UNQ | - | Campo do dominio `qms_documents` referente a code. |
| sector | varchar(120) | Nao | - | - | Campo do dominio `qms_documents` referente a sector. |
| name | varchar(220) | Nao | - | - | Nome principal do registro. |
| objective | text | Sim | - | - | Campo do dominio `qms_documents` referente a objective. |
| periodicity_days | int | Sim | - | - | Campo do dominio `qms_documents` referente a periodicity days. |
| status | varchar(30) | Nao | - | rascunho | Status operacional/negocial atual do registro. |
| archived_at | text | Sim | - | - | Data/hora referente a archived. |
| created_by | varchar(64) | Nao | - | - | Campo do dominio `qms_documents` referente a created by. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_by | varchar(64) | Nao | - | - | Campo do dominio `qms_documents` referente a updated by. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `qms_training_assignments`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Cadastro/manual do modulo de qualidade e treinamentos.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/qms/trainings_repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; training_id (training_id, employee_id) [UNQ]
- Vinculos principais: employee_id -> employees.id (vinculo logico); training_id -> qms_trainings.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/qms/trainings_repository.ts`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/06-plano-tecnico-qualidade-treinamentos.md, apps/painel/docs/10-plano-tecnico-colaboradores.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| training_id | varchar(64) | Nao | IDX | - | Identificador do treinamento relacionado ao registro. |
| employee_id | varchar(64) | Nao | - | - | Identificador do colaborador relacionado ao registro. |
| status | varchar(30) | Nao | - | pendente | Status operacional/negocial atual do registro. |
| due_date | text | Sim | - | - | Data de due. |
| completed_at | text | Sim | - | - | Data/hora de conclusao do processamento. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `qms_training_files`

- Finalidade: Arquivos/anexos de treinamentos.
- Origem da informacao: Cadastro/manual do modulo de qualidade e treinamentos.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/qms/trainings_repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: training_id -> qms_trainings.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/qms/trainings_repository.ts`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/06-plano-tecnico-qualidade-treinamentos.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| training_id | varchar(64) | Nao | - | - | Identificador do treinamento relacionado ao registro. |
| file_type | varchar(40) | Nao | - | - | Campo do dominio `qms_training_files` referente a file type. |
| storage_provider | varchar(30) | Nao | - | - | Campo do dominio `qms_training_files` referente a storage provider. |
| storage_bucket | varchar(120) | Sim | - | - | Campo do dominio `qms_training_files` referente a storage bucket. |
| storage_key | varchar(255) | Nao | - | - | Campo do dominio `qms_training_files` referente a storage key. |
| filename | varchar(255) | Nao | - | - | Campo do dominio `qms_training_files` referente a filename. |
| mime_type | varchar(120) | Nao | - | - | Tipo MIME do arquivo armazenado. |
| size_bytes | bigint | Nao | - | - | Campo do dominio `qms_training_files` referente a size bytes. |
| uploaded_by | varchar(64) | Nao | - | - | Campo do dominio `qms_training_files` referente a uploaded by. |
| uploaded_at | text | Nao | - | - | Data/hora referente a uploaded. |
| is_active | int | Nao | - | 1 | Indicador logico de atividade do registro. |

---

### `qms_training_plans`

- Finalidade: Planos/programacoes de treinamento.
- Origem da informacao: Cadastro/manual do modulo de qualidade e treinamentos.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/qms/trainings_repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `1`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; code (code) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/qms/trainings_repository.ts`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/06-plano-tecnico-qualidade-treinamentos.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| code | varchar(40) | Nao | UNQ | - | Campo do dominio `qms_training_plans` referente a code. |
| theme | varchar(220) | Nao | - | - | Campo do dominio `qms_training_plans` referente a theme. |
| sector | varchar(120) | Nao | - | - | Campo do dominio `qms_training_plans` referente a sector. |
| training_type | varchar(30) | Nao | - | - | Campo do dominio `qms_training_plans` referente a training type. |
| objective | text | Sim | - | - | Campo do dominio `qms_training_plans` referente a objective. |
| instructor | varchar(140) | Sim | - | - | Campo do dominio `qms_training_plans` referente a instructor. |
| target_audience | varchar(220) | Sim | - | - | Campo do dominio `qms_training_plans` referente a target audience. |
| workload_hours | decimal(10,2) | Sim | - | - | Campo do dominio `qms_training_plans` referente a workload hours. |
| planned_date | text | Sim | - | - | Data de planned. |
| expiration_date | text | Sim | - | - | Data de expiration. |
| evaluation_applied | int | Nao | - | 0 | Campo do dominio `qms_training_plans` referente a evaluation applied. |
| evaluation_type | varchar(140) | Sim | - | - | Campo do dominio `qms_training_plans` referente a evaluation type. |
| target_indicator | varchar(180) | Sim | - | - | Campo do dominio `qms_training_plans` referente a target indicator. |
| expected_goal | text | Sim | - | - | Campo do dominio `qms_training_plans` referente a expected goal. |
| status | varchar(30) | Nao | - | planejado | Status operacional/negocial atual do registro. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| created_by | varchar(64) | Nao | - | - | Campo do dominio `qms_training_plans` referente a created by. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_by | varchar(64) | Nao | - | - | Campo do dominio `qms_training_plans` referente a updated by. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `qms_trainings`

- Finalidade: Execucao/registro de treinamentos.
- Origem da informacao: Cadastro/manual do modulo de qualidade e treinamentos.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/qms/trainings_repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; code (code) [UNQ]
- Vinculos principais: plan_id -> qms_training_plans.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/qms/trainings_repository.ts`
- Evidencias documentais: `apps/painel/docs/04-dicionario-de-dados.md, apps/painel/docs/06-plano-tecnico-qualidade-treinamentos.md, apps/painel/docs/database/02-relacionamentos-logicos-mysql.md, apps/painel/docs/database/03-dicionario-de-dados-mysql.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| code | varchar(40) | Nao | UNQ | - | Campo do dominio `qms_trainings` referente a code. |
| plan_id | varchar(64) | Sim | - | - | Identificador do plano relacionado ao registro. |
| name | varchar(220) | Nao | - | - | Nome principal do registro. |
| sector | varchar(120) | Nao | - | - | Campo do dominio `qms_trainings` referente a sector. |
| training_type | varchar(30) | Nao | - | - | Campo do dominio `qms_trainings` referente a training type. |
| instructor | varchar(140) | Sim | - | - | Campo do dominio `qms_trainings` referente a instructor. |
| target_audience | varchar(220) | Sim | - | - | Campo do dominio `qms_trainings` referente a target audience. |
| performed_at | text | Sim | - | - | Data/hora referente a performed. |
| workload_hours | decimal(10,2) | Sim | - | - | Campo do dominio `qms_trainings` referente a workload hours. |
| evaluation_applied | int | Nao | - | 0 | Campo do dominio `qms_trainings` referente a evaluation applied. |
| average_score | decimal(10,2) | Sim | - | - | Campo do dominio `qms_trainings` referente a average score. |
| next_training_date | text | Sim | - | - | Data de next training. |
| status | varchar(30) | Nao | - | planejado | Status operacional/negocial atual do registro. |
| participants_planned | int | Sim | - | - | Campo do dominio `qms_trainings` referente a participants planned. |
| participants_actual | int | Sim | - | - | Campo do dominio `qms_trainings` referente a participants actual. |
| result_post_training | text | Sim | - | - | Campo do dominio `qms_trainings` referente a result post training. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| created_by | varchar(64) | Nao | - | - | Campo do dominio `qms_trainings` referente a created by. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_by | varchar(64) | Nao | - | - | Campo do dominio `qms_trainings` referente a updated by. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

## Outros / legado

### `intranet_assets`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `apps/intranet/src/lib/intranet/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `3`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/intranet/src/lib/intranet/repository.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| entity_type | varchar(80) | Sim | - | - | Campo do dominio `intranet_assets` referente a entity type. |
| entity_id | varchar(64) | Sim | - | - | Identificador de entity usado para relacionar ou localizar o registro na origem/aplicacao. |
| storage_provider | varchar(30) | Nao | - | - | Campo do dominio `intranet_assets` referente a storage provider. |
| storage_bucket | varchar(160) | Sim | - | - | Campo do dominio `intranet_assets` referente a storage bucket. |
| storage_key | varchar(500) | Nao | - | - | Campo do dominio `intranet_assets` referente a storage key. |
| original_name | varchar(255) | Nao | - | - | Nome de original utilizado para exibicao, filtro ou agrupamento. |
| mime_type | varchar(160) | Nao | - | - | Tipo MIME do arquivo armazenado. |
| size_bytes | bigint | Nao | - | - | Campo do dominio `intranet_assets` referente a size bytes. |
| uploaded_by | varchar(64) | Sim | - | - | Campo do dominio `intranet_assets` referente a uploaded by. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `intranet_audience_group_rules`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `apps/intranet/src/lib/intranet/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/intranet/src/lib/intranet/repository.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| audience_group_id | varchar(64) | Nao | - | - | Identificador de audience group usado para relacionar ou localizar o registro na origem/aplicacao. |
| rule_type | varchar(40) | Nao | - | - | Campo do dominio `intranet_audience_group_rules` referente a rule type. |
| rule_value | varchar(180) | Nao | - | - | Valor monetario ou numerico referente a rule value. |
| is_active | int | Nao | - | 1 | Indicador logico de atividade do registro. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `intranet_audience_groups`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `apps/intranet/src/lib/intranet/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/intranet/src/lib/intranet/repository.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| name | varchar(180) | Nao | - | - | Nome principal do registro. |
| description | text | Sim | - | - | Descricao textual do registro. |
| is_active | int | Nao | - | 1 | Indicador logico de atividade do registro. |
| created_by | varchar(64) | Sim | - | - | Campo do dominio `intranet_audience_groups` referente a created by. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_by | varchar(64) | Sim | - | - | Campo do dominio `intranet_audience_groups` referente a updated by. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `intranet_catalog_items`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `packages/core/src/intranet/catalog.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `packages/core/src/intranet/catalog.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| slug | varchar(180) | Nao | - | - | Campo do dominio `intranet_catalog_items` referente a slug. |
| display_name | varchar(220) | Nao | - | - | Nome de display utilizado para exibicao, filtro ou agrupamento. |
| catalog_type | varchar(40) | Nao | - | procedure | Campo do dominio `intranet_catalog_items` referente a catalog type. |
| category | varchar(140) | Sim | - | - | Campo do dominio `intranet_catalog_items` referente a category. |
| subcategory | varchar(140) | Sim | - | - | Campo do dominio `intranet_catalog_items` referente a subcategory. |
| summary | text | Sim | - | - | Campo do dominio `intranet_catalog_items` referente a summary. |
| description | longtext | Sim | - | - | Descricao textual do registro. |
| requires_preparation | int | Nao | - | 0 | Campo do dominio `intranet_catalog_items` referente a requires preparation. |
| who_performs | text | Sim | - | - | Campo do dominio `intranet_catalog_items` referente a who performs. |
| how_it_works | longtext | Sim | - | - | Campo do dominio `intranet_catalog_items` referente a how it works. |
| patient_instructions | longtext | Sim | - | - | Campo do dominio `intranet_catalog_items` referente a patient instructions. |
| preparation_instructions | longtext | Sim | - | - | Campo do dominio `intranet_catalog_items` referente a preparation instructions. |
| contraindications | longtext | Sim | - | - | Campo do dominio `intranet_catalog_items` referente a contraindications. |
| estimated_duration_text | varchar(120) | Sim | - | - | Campo do dominio `intranet_catalog_items` referente a estimated duration text. |
| recovery_notes | longtext | Sim | - | - | Campo do dominio `intranet_catalog_items` referente a recovery notes. |
| show_price | int | Nao | - | 1 | Valor monetario ou numerico referente a show price. |
| published_price | decimal(12,2) | Sim | - | - | Valor monetario ou numerico referente a published price. |
| is_featured | int | Nao | - | 0 | Indicador logico relacionado a featured. |
| is_published | int | Nao | - | 0 | Indicador logico relacionado a published. |
| display_order | int | Nao | - | 0 | Campo do dominio `intranet_catalog_items` referente a display order. |
| updated_by | varchar(64) | Sim | - | - | Campo do dominio `intranet_catalog_items` referente a updated by. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `intranet_chat_conversation_members`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `apps/intranet/src/lib/intranet/chat.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `17`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: user_id -> users.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/intranet/src/lib/intranet/chat.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| conversation_id | varchar(64) | Nao | - | - | Identificador de conversation usado para relacionar ou localizar o registro na origem/aplicacao. |
| user_id | varchar(64) | Nao | - | - | Identificador do usuario relacionado ao registro. |
| member_role | varchar(40) | Nao | - | member | Campo do dominio `intranet_chat_conversation_members` referente a member role. |
| last_read_message_id | varchar(64) | Sim | - | - | Identificador de last read message usado para relacionar ou localizar o registro na origem/aplicacao. |
| last_read_at | text | Sim | - | - | Data/hora referente a last read. |
| is_muted | int | Nao | - | 0 | Indicador logico relacionado a muted. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `intranet_chat_conversations`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `apps/intranet/src/lib/intranet/chat.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `7`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/intranet/src/lib/intranet/chat.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| conversation_type | varchar(40) | Nao | - | - | Campo do dominio `intranet_chat_conversations` referente a conversation type. |
| name | varchar(180) | Sim | - | - | Nome principal do registro. |
| slug | varchar(180) | Sim | - | - | Campo do dominio `intranet_chat_conversations` referente a slug. |
| description | text | Sim | - | - | Descricao textual do registro. |
| is_active | int | Nao | - | 1 | Indicador logico de atividade do registro. |
| is_announcement_only | int | Nao | - | 0 | Indicador logico relacionado a announcement only. |
| created_by | varchar(64) | Sim | - | - | Campo do dominio `intranet_chat_conversations` referente a created by. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `intranet_chat_message_attachments`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `apps/intranet/src/lib/intranet/chat.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `1`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/intranet/src/lib/intranet/chat.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| message_id | varchar(64) | Nao | - | - | Identificador de message usado para relacionar ou localizar o registro na origem/aplicacao. |
| asset_id | varchar(64) | Nao | - | - | Identificador de asset usado para relacionar ou localizar o registro na origem/aplicacao. |
| uploaded_by | varchar(64) | Sim | - | - | Campo do dominio `intranet_chat_message_attachments` referente a uploaded by. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `intranet_chat_messages`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `apps/intranet/src/lib/intranet/chat.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `5`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/intranet/src/lib/intranet/chat.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| conversation_id | varchar(64) | Nao | - | - | Identificador de conversation usado para relacionar ou localizar o registro na origem/aplicacao. |
| sender_user_id | varchar(64) | Nao | - | - | Identificador de sender user usado para relacionar ou localizar o registro na origem/aplicacao. |
| body | longtext | Sim | - | - | Campo do dominio `intranet_chat_messages` referente a body. |
| message_type | varchar(40) | Nao | - | text | Campo do dominio `intranet_chat_messages` referente a message type. |
| is_edited | int | Nao | - | 0 | Indicador logico relacionado a edited. |
| edited_at | text | Sim | - | - | Data/hora referente a edited. |
| is_deleted | int | Nao | - | 0 | Indicador logico relacionado a deleted. |
| deleted_at | text | Sim | - | - | Data/hora de exclusao logica. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `intranet_chat_moderation_log`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `apps/intranet/src/lib/intranet/chat.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_unicode_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/intranet/src/lib/intranet/chat.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| conversation_id | varchar(64) | Sim | - | - | Identificador de conversation usado para relacionar ou localizar o registro na origem/aplicacao. |
| message_id | varchar(64) | Sim | - | - | Identificador de message usado para relacionar ou localizar o registro na origem/aplicacao. |
| action | varchar(80) | Nao | - | - | Campo do dominio `intranet_chat_moderation_log` referente a action. |
| actor_user_id | varchar(64) | Nao | - | - | Identificador de actor user usado para relacionar ou localizar o registro na origem/aplicacao. |
| payload_json | longtext | Sim | - | - | Payload bruto ou quase bruto em JSON para auditoria/reprocessamento. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `intranet_editorial_scope_assignments`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `apps/intranet/src/lib/intranet/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: user_id -> users.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/intranet/src/lib/intranet/repository.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| user_id | varchar(64) | Nao | - | - | Identificador do usuario relacionado ao registro. |
| editorial_scope_id | varchar(64) | Nao | - | - | Identificador de editorial scope usado para relacionar ou localizar o registro na origem/aplicacao. |
| assigned_by | varchar(64) | Sim | - | - | Campo do dominio `intranet_editorial_scope_assignments` referente a assigned by. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `intranet_editorial_scopes`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `apps/intranet/src/lib/intranet/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/intranet/src/lib/intranet/repository.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| name | varchar(180) | Nao | - | - | Nome principal do registro. |
| description | text | Sim | - | - | Descricao textual do registro. |
| scope_type | varchar(40) | Nao | - | - | Campo do dominio `intranet_editorial_scopes` referente a scope type. |
| scope_ref | varchar(180) | Sim | - | - | Campo do dominio `intranet_editorial_scopes` referente a scope referencia. |
| is_active | int | Nao | - | 1 | Indicador logico de atividade do registro. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `intranet_faq_categories`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `apps/intranet/src/lib/intranet/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `1`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/intranet/src/lib/intranet/repository.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| name | varchar(180) | Nao | - | - | Nome principal do registro. |
| slug | varchar(180) | Nao | - | - | Campo do dominio `intranet_faq_categories` referente a slug. |
| description | text | Sim | - | - | Descricao textual do registro. |
| sort_order | int | Nao | - | 0 | Ordem relativa de exibicao/processamento. |
| is_active | int | Nao | - | 1 | Indicador logico de atividade do registro. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `intranet_faq_item_audiences`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `apps/intranet/src/lib/intranet/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/intranet/src/lib/intranet/repository.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| faq_item_id | varchar(64) | Nao | - | - | Identificador de faq item usado para relacionar ou localizar o registro na origem/aplicacao. |
| audience_group_id | varchar(64) | Nao | - | - | Identificador de audience group usado para relacionar ou localizar o registro na origem/aplicacao. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `intranet_faq_items`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `apps/intranet/src/lib/intranet/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `1`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/intranet/src/lib/intranet/repository.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| category_id | varchar(64) | Sim | - | - | Identificador de category usado para relacionar ou localizar o registro na origem/aplicacao. |
| question | text | Nao | - | - | Campo do dominio `intranet_faq_items` referente a question. |
| answer_json | longtext | Nao | - | - | Conteudo estruturado em JSON relacionado a answer. |
| sort_order | int | Nao | - | 0 | Ordem relativa de exibicao/processamento. |
| is_active | int | Nao | - | 1 | Indicador logico de atividade do registro. |
| created_by | varchar(64) | Sim | - | - | Campo do dominio `intranet_faq_items` referente a created by. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_by | varchar(64) | Sim | - | - | Campo do dominio `intranet_faq_items` referente a updated by. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |
| source_type | varchar(40) | Sim | - | manual | Campo do dominio `intranet_faq_items` referente a source type. |
| source_question_id | varchar(64) | Sim | - | - | Identificador de source question usado para relacionar ou localizar o registro na origem/aplicacao. |
| knowledge_status | varchar(40) | Sim | - | pending_index | Status/etapa de knowledge status. |
| approved_at | text | Sim | - | - | Data/hora referente a approved. |

---

### `intranet_navigation_node_audiences`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `apps/intranet/src/lib/intranet/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/intranet/src/lib/intranet/repository.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| navigation_node_id | varchar(64) | Nao | - | - | Identificador de navigation node usado para relacionar ou localizar o registro na origem/aplicacao. |
| audience_group_id | varchar(64) | Nao | - | - | Identificador de audience group usado para relacionar ou localizar o registro na origem/aplicacao. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `intranet_navigation_nodes`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `apps/intranet/src/lib/intranet/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `2`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/intranet/src/lib/intranet/repository.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| parent_node_id | varchar(64) | Sim | - | - | Identificador de parent node usado para relacionar ou localizar o registro na origem/aplicacao. |
| node_type | varchar(40) | Nao | - | - | Campo do dominio `intranet_navigation_nodes` referente a node type. |
| page_id | varchar(64) | Sim | - | - | Identificador de page usado para relacionar ou localizar o registro na origem/aplicacao. |
| label | varchar(180) | Nao | - | - | Campo do dominio `intranet_navigation_nodes` referente a label. |
| url | varchar(500) | Sim | - | - | Campo do dominio `intranet_navigation_nodes` referente a URL. |
| icon_name | varchar(80) | Sim | - | - | Nome de icon utilizado para exibicao, filtro ou agrupamento. |
| sort_order | int | Nao | - | 0 | Ordem relativa de exibicao/processamento. |
| is_visible | int | Nao | - | 1 | Indicador logico relacionado a visible. |
| audience_mode | varchar(20) | Nao | - | inherit | Campo do dominio `intranet_navigation_nodes` referente a audience mode. |
| created_by | varchar(64) | Sim | - | - | Campo do dominio `intranet_navigation_nodes` referente a created by. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_by | varchar(64) | Sim | - | - | Campo do dominio `intranet_navigation_nodes` referente a updated by. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `intranet_news_post_audiences`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `apps/intranet/src/lib/intranet/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/intranet/src/lib/intranet/repository.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| post_id | varchar(64) | Nao | - | - | Identificador de post usado para relacionar ou localizar o registro na origem/aplicacao. |
| audience_group_id | varchar(64) | Nao | - | - | Identificador de audience group usado para relacionar ou localizar o registro na origem/aplicacao. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `intranet_news_posts`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `apps/intranet/src/lib/intranet/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `1`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/intranet/src/lib/intranet/repository.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| post_type | varchar(30) | Nao | - | - | Campo do dominio `intranet_news_posts` referente a post type. |
| title | varchar(220) | Nao | - | - | Campo do dominio `intranet_news_posts` referente a title. |
| slug | varchar(180) | Nao | - | - | Campo do dominio `intranet_news_posts` referente a slug. |
| summary | text | Sim | - | - | Campo do dominio `intranet_news_posts` referente a summary. |
| body_json | longtext | Nao | - | - | Conteudo estruturado em JSON relacionado a body. |
| cover_asset_id | varchar(64) | Sim | - | - | Identificador de cover asset usado para relacionar ou localizar o registro na origem/aplicacao. |
| is_featured | int | Nao | - | 0 | Indicador logico relacionado a featured. |
| status | varchar(30) | Nao | - | - | Status operacional/negocial atual do registro. |
| publish_start_at | text | Sim | - | - | Data/hora referente a publish start. |
| publish_end_at | text | Sim | - | - | Data/hora referente a publish end. |
| created_by | varchar(64) | Sim | - | - | Campo do dominio `intranet_news_posts` referente a created by. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_by | varchar(64) | Sim | - | - | Campo do dominio `intranet_news_posts` referente a updated by. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |
| published_at | text | Sim | - | - | Data/hora referente a published. |
| category | varchar(40) | Sim | - | geral | Campo do dominio `intranet_news_posts` referente a category. |
| highlight_level | varchar(40) | Sim | - | info | Campo do dominio `intranet_news_posts` referente a highlight level. |

---

### `intranet_page_audiences`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `apps/intranet/src/lib/intranet/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/intranet/src/lib/intranet/repository.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| page_id | varchar(64) | Nao | - | - | Identificador de page usado para relacionar ou localizar o registro na origem/aplicacao. |
| audience_group_id | varchar(64) | Nao | - | - | Identificador de audience group usado para relacionar ou localizar o registro na origem/aplicacao. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `intranet_page_revisions`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `apps/intranet/src/lib/intranet/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `9`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/intranet/src/lib/intranet/repository.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| page_id | varchar(64) | Nao | - | - | Identificador de page usado para relacionar ou localizar o registro na origem/aplicacao. |
| revision_number | int | Nao | - | - | Campo do dominio `intranet_page_revisions` referente a revision number. |
| content_json | longtext | Nao | - | - | Conteudo estruturado em JSON relacionado a content. |
| change_summary | text | Sim | - | - | Campo do dominio `intranet_page_revisions` referente a change summary. |
| is_published | int | Nao | - | 0 | Indicador logico relacionado a published. |
| created_by | varchar(64) | Sim | - | - | Campo do dominio `intranet_page_revisions` referente a created by. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `intranet_pages`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `apps/intranet/src/lib/intranet/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `1`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/intranet/src/lib/intranet/repository.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| title | varchar(180) | Nao | - | - | Campo do dominio `intranet_pages` referente a title. |
| slug | varchar(180) | Nao | - | - | Campo do dominio `intranet_pages` referente a slug. |
| full_path | varchar(500) | Nao | - | - | Campo do dominio `intranet_pages` referente a full path. |
| page_type | varchar(40) | Nao | - | - | Campo do dominio `intranet_pages` referente a page type. |
| status | varchar(30) | Nao | - | - | Status operacional/negocial atual do registro. |
| parent_page_id | varchar(64) | Sim | - | - | Identificador de parent page usado para relacionar ou localizar o registro na origem/aplicacao. |
| current_revision_id | varchar(64) | Sim | - | - | Identificador de current revision usado para relacionar ou localizar o registro na origem/aplicacao. |
| meta_title | varchar(180) | Sim | - | - | Campo do dominio `intranet_pages` referente a meta title. |
| meta_description | text | Sim | - | - | Campo do dominio `intranet_pages` referente a meta description. |
| icon_name | varchar(80) | Sim | - | - | Nome de icon utilizado para exibicao, filtro ou agrupamento. |
| sort_order | int | Nao | - | 0 | Ordem relativa de exibicao/processamento. |
| created_by | varchar(64) | Sim | - | - | Campo do dominio `intranet_pages` referente a created by. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_by | varchar(64) | Sim | - | - | Campo do dominio `intranet_pages` referente a updated by. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |
| published_at | text | Sim | - | - | Data/hora referente a published. |
| published_by | varchar(64) | Sim | - | - | Campo do dominio `intranet_pages` referente a published by. |
| archived_at | text | Sim | - | - | Data/hora referente a archived. |

---

### `intranet_procedure_profiles`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `packages/core/src/intranet/catalog.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `procedimento_id`
- Indices: PRIMARY (procedimento_id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `packages/core/src/intranet/catalog.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| procedimento_id | bigint | Nao | PK | - | Identificador de procedimento usado para relacionar ou localizar o registro na origem/aplicacao. |
| slug | varchar(180) | Nao | - | - | Campo do dominio `intranet_procedure_profiles` referente a slug. |
| display_name | varchar(220) | Nao | - | - | Nome de display utilizado para exibicao, filtro ou agrupamento. |
| catalog_type | varchar(40) | Nao | - | procedure | Campo do dominio `intranet_procedure_profiles` referente a catalog type. |
| category | varchar(140) | Sim | - | - | Campo do dominio `intranet_procedure_profiles` referente a category. |
| subcategory | varchar(140) | Sim | - | - | Campo do dominio `intranet_procedure_profiles` referente a subcategory. |
| summary | text | Sim | - | - | Campo do dominio `intranet_procedure_profiles` referente a summary. |
| description | longtext | Sim | - | - | Descricao textual do registro. |
| requires_preparation | int | Nao | - | 0 | Campo do dominio `intranet_procedure_profiles` referente a requires preparation. |
| who_performs | text | Sim | - | - | Campo do dominio `intranet_procedure_profiles` referente a who performs. |
| how_it_works | longtext | Sim | - | - | Campo do dominio `intranet_procedure_profiles` referente a how it works. |
| patient_instructions | longtext | Sim | - | - | Campo do dominio `intranet_procedure_profiles` referente a patient instructions. |
| preparation_instructions | longtext | Sim | - | - | Campo do dominio `intranet_procedure_profiles` referente a preparation instructions. |
| contraindications | longtext | Sim | - | - | Campo do dominio `intranet_procedure_profiles` referente a contraindications. |
| estimated_duration_text | varchar(120) | Sim | - | - | Campo do dominio `intranet_procedure_profiles` referente a estimated duration text. |
| recovery_notes | longtext | Sim | - | - | Campo do dominio `intranet_procedure_profiles` referente a recovery notes. |
| show_price | int | Nao | - | 1 | Valor monetario ou numerico referente a show price. |
| published_price | decimal(12,2) | Sim | - | - | Valor monetario ou numerico referente a published price. |
| is_featured | int | Nao | - | 0 | Indicador logico relacionado a featured. |
| is_published | int | Nao | - | 0 | Indicador logico relacionado a published. |
| display_order | int | Nao | - | 0 | Campo do dominio `intranet_procedure_profiles` referente a display order. |
| updated_by | varchar(64) | Sim | - | - | Campo do dominio `intranet_procedure_profiles` referente a updated by. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `intranet_professional_catalog_items`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `packages/core/src/intranet/catalog.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: professional_id -> professionals.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `packages/core/src/intranet/catalog.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| professional_id | varchar(64) | Nao | - | - | Identificador do profissional relacionado ao registro. |
| catalog_item_id | varchar(64) | Nao | - | - | Identificador de catalog item usado para relacionar ou localizar o registro na origem/aplicacao. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| display_order | int | Nao | - | 0 | Campo do dominio `intranet_professional_catalog_items` referente a display order. |
| is_published | int | Nao | - | 1 | Indicador logico relacionado a published. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `intranet_professional_notes`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `packages/core/src/intranet/catalog.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `professional_id`
- Indices: PRIMARY (professional_id) [UNQ]
- Vinculos principais: professional_id -> professionals.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `packages/core/src/intranet/catalog.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| professional_id | varchar(64) | Nao | PK | - | Identificador do profissional relacionado ao registro. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| updated_by | varchar(64) | Sim | - | - | Campo do dominio `intranet_professional_notes` referente a updated by. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `intranet_professional_procedures`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `packages/core/src/intranet/catalog.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: professional_id -> professionals.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `packages/core/src/intranet/catalog.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| professional_id | varchar(64) | Nao | - | - | Identificador do profissional relacionado ao registro. |
| procedimento_id | bigint | Nao | - | - | Identificador de procedimento usado para relacionar ou localizar o registro na origem/aplicacao. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| display_order | int | Nao | - | 0 | Campo do dominio `intranet_professional_procedures` referente a display order. |
| is_published | int | Nao | - | 1 | Indicador logico relacionado a published. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `intranet_professional_profiles`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `packages/core/src/intranet/catalog.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `professional_id`
- Indices: PRIMARY (professional_id) [UNQ]
- Vinculos principais: professional_id -> professionals.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `packages/core/src/intranet/catalog.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| professional_id | varchar(64) | Nao | PK | - | Identificador do profissional relacionado ao registro. |
| slug | varchar(180) | Nao | - | - | Campo do dominio `intranet_professional_profiles` referente a slug. |
| display_name | varchar(180) | Nao | - | - | Nome de display utilizado para exibicao, filtro ou agrupamento. |
| short_bio | text | Sim | - | - | Campo do dominio `intranet_professional_profiles` referente a short bio. |
| long_bio | longtext | Sim | - | - | Campo do dominio `intranet_professional_profiles` referente a long bio. |
| photo_asset_id | varchar(64) | Sim | - | - | Identificador de photo asset usado para relacionar ou localizar o registro na origem/aplicacao. |
| card_highlight | varchar(220) | Sim | - | - | Campo do dominio `intranet_professional_profiles` referente a card highlight. |
| service_units_override_json | longtext | Sim | - | - | Conteudo estruturado em JSON relacionado a service units override. |
| specialties_override_json | longtext | Sim | - | - | Conteudo estruturado em JSON relacionado a specialties override. |
| contact_notes | text | Sim | - | - | Campo do dominio `intranet_professional_profiles` referente a contact notes. |
| display_order | int | Nao | - | 0 | Campo do dominio `intranet_professional_profiles` referente a display order. |
| is_featured | int | Nao | - | 0 | Indicador logico relacionado a featured. |
| is_published | int | Nao | - | 0 | Indicador logico relacionado a published. |
| published_at | text | Sim | - | - | Data/hora referente a published. |
| updated_by | varchar(64) | Sim | - | - | Campo do dominio `intranet_professional_profiles` referente a updated by. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `intranet_professional_specialties`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `packages/core/src/intranet/catalog.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: professional_id -> professionals.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `packages/core/src/intranet/catalog.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| professional_id | varchar(64) | Nao | - | - | Identificador do profissional relacionado ao registro. |
| specialty_id | varchar(64) | Nao | - | - | Identificador de specialty usado para relacionar ou localizar o registro na origem/aplicacao. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| display_order | int | Nao | - | 0 | Campo do dominio `intranet_professional_specialties` referente a display order. |
| is_published | int | Nao | - | 1 | Indicador logico relacionado a published. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `intranet_qms_document_settings`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `packages/core/src/intranet/catalog.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `document_id`
- Indices: PRIMARY (document_id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `packages/core/src/intranet/catalog.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| document_id | varchar(64) | Nao | PK | - | Identificador do documento relacionado ao registro. |
| is_visible | int | Nao | - | 0 | Indicador logico relacionado a visible. |
| is_featured | int | Nao | - | 0 | Indicador logico relacionado a featured. |
| default_page_id | varchar(64) | Sim | - | - | Identificador de default page usado para relacionar ou localizar o registro na origem/aplicacao. |
| display_order | int | Nao | - | 0 | Campo do dominio `intranet_qms_document_settings` referente a display order. |
| updated_by | varchar(64) | Sim | - | - | Campo do dominio `intranet_qms_document_settings` referente a updated by. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `intranet_specialty_notes`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `packages/core/src/intranet/catalog.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `specialty_slug`
- Indices: PRIMARY (specialty_slug) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `packages/core/src/intranet/catalog.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| specialty_slug | varchar(180) | Nao | PK | - | Campo do dominio `intranet_specialty_notes` referente a specialty slug. |
| specialty_name | varchar(180) | Nao | - | - | Nome de specialty utilizado para exibicao, filtro ou agrupamento. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| updated_by | varchar(64) | Sim | - | - | Campo do dominio `intranet_specialty_notes` referente a updated by. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `intranet_specialty_pages`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `packages/core/src/intranet/catalog.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `1`
- Chave primaria: `specialty_slug`
- Indices: PRIMARY (specialty_slug) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `packages/core/src/intranet/catalog.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| specialty_slug | varchar(180) | Nao | PK | - | Campo do dominio `intranet_specialty_pages` referente a specialty slug. |
| specialty_name | varchar(180) | Nao | - | - | Nome de specialty utilizado para exibicao, filtro ou agrupamento. |
| content_json | longtext | Sim | - | - | Conteudo estruturado em JSON relacionado a content. |
| updated_by | varchar(64) | Sim | - | - | Campo do dominio `intranet_specialty_pages` referente a updated by. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `intranet_specialty_profiles`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `packages/core/src/intranet/catalog.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `packages/core/src/intranet/catalog.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| slug | varchar(180) | Nao | - | - | Campo do dominio `intranet_specialty_profiles` referente a slug. |
| display_name | varchar(180) | Nao | - | - | Nome de display utilizado para exibicao, filtro ou agrupamento. |
| short_description | text | Sim | - | - | Campo do dominio `intranet_specialty_profiles` referente a short description. |
| description | longtext | Sim | - | - | Descricao textual do registro. |
| service_guidance | longtext | Sim | - | - | Campo do dominio `intranet_specialty_profiles` referente a service guidance. |
| display_order | int | Nao | - | 0 | Campo do dominio `intranet_specialty_profiles` referente a display order. |
| is_featured | int | Nao | - | 0 | Indicador logico relacionado a featured. |
| is_published | int | Nao | - | 0 | Indicador logico relacionado a published. |
| published_at | text | Sim | - | - | Data/hora referente a published. |
| updated_by | varchar(64) | Sim | - | - | Campo do dominio `intranet_specialty_profiles` referente a updated by. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `intranet_user_audience_assignments`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Evidencia principal localizada em `apps/intranet/src/lib/intranet/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]
- Vinculos principais: user_id -> users.id (vinculo logico)
- Evidencia de criacao/garantia de schema: `apps/intranet/src/lib/intranet/repository.ts`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| user_id | varchar(64) | Nao | - | - | Identificador do usuario relacionado ao registro. |
| audience_group_id | varchar(64) | Nao | - | - | Identificador de audience group usado para relacionar ou localizar o registro na origem/aplicacao. |
| assigned_by | varchar(64) | Sim | - | - | Campo do dominio `intranet_user_audience_assignments` referente a assigned by. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `recruitment_candidate_files`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/recrutamento/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_recruitment_files_candidate (candidate_id)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/recrutamento/repository.ts`
- Evidencias documentais: `apps/painel/docs/15-plano-tecnico-recrutamento.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| candidate_id | varchar(64) | Nao | IDX | - | Identificador de candidate usado para relacionar ou localizar o registro na origem/aplicacao. |
| storage_provider | varchar(30) | Nao | - | - | Campo do dominio `recruitment_candidate_files` referente a storage provider. |
| storage_bucket | varchar(255) | Sim | - | - | Campo do dominio `recruitment_candidate_files` referente a storage bucket. |
| storage_key | text | Nao | - | - | Campo do dominio `recruitment_candidate_files` referente a storage key. |
| original_name | varchar(255) | Nao | - | - | Nome de original utilizado para exibicao, filtro ou agrupamento. |
| mime_type | varchar(120) | Nao | - | - | Tipo MIME do arquivo armazenado. |
| size_bytes | int | Nao | - | - | Campo do dominio `recruitment_candidate_files` referente a size bytes. |
| uploaded_by | varchar(64) | Nao | - | - | Campo do dominio `recruitment_candidate_files` referente a uploaded by. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `recruitment_candidate_history`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/recrutamento/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_recruitment_history_candidate (candidate_id)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/recrutamento/repository.ts`
- Evidencias documentais: `apps/painel/docs/15-plano-tecnico-recrutamento.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| candidate_id | varchar(64) | Nao | IDX | - | Identificador de candidate usado para relacionar ou localizar o registro na origem/aplicacao. |
| action | varchar(60) | Nao | - | - | Campo do dominio `recruitment_candidate_history` referente a action. |
| from_stage | varchar(30) | Sim | - | - | Status/etapa de from stage. |
| to_stage | varchar(30) | Sim | - | - | Status/etapa de to stage. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| actor_user_id | varchar(64) | Nao | - | - | Identificador de actor user usado para relacionar ou localizar o registro na origem/aplicacao. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |

---

### `recruitment_candidates`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/recrutamento/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_recruitment_candidates_job (job_id); idx_recruitment_candidates_stage (stage)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/recrutamento/repository.ts`
- Evidencias documentais: `apps/painel/docs/15-plano-tecnico-recrutamento.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| job_id | varchar(64) | Nao | IDX | - | Identificador do job/processamento ao qual a linha pertence. |
| full_name | varchar(220) | Nao | - | - | Nome de full utilizado para exibicao, filtro ou agrupamento. |
| cpf | varchar(20) | Sim | - | - | Campo do dominio `recruitment_candidates` referente a cpf. |
| email | varchar(220) | Sim | - | - | Endereco de e-mail associado ao registro. |
| phone | varchar(40) | Sim | - | - | Campo do dominio `recruitment_candidates` referente a phone. |
| stage | varchar(30) | Nao | IDX | - | Status/etapa de stage. |
| source | varchar(120) | Sim | - | - | Origem declarada do dado ou do evento. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| converted_employee_id | varchar(64) | Sim | - | - | Identificador de converted employee usado para relacionar ou localizar o registro na origem/aplicacao. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

### `recruitment_jobs`

- Finalidade: Tabela operacional/tecnica identificada no schema MySQL.
- Origem da informacao: Origem mista no painel/aplicacao; validar modulo escritor principal.
- Escrita/manutencao tecnica: Escrita principal realizada por repository/servico server-side em `apps/painel/src/lib/recrutamento/repository.ts`.
- Tabela/engine: `InnoDB`
- Colacao: `utf8mb4_0900_ai_ci`
- Linhas estimadas pelo MySQL: `0`
- Chave primaria: `id`
- Indices: PRIMARY (id) [UNQ]; idx_recruitment_jobs_status (status)
- Vinculos principais: nenhum vinculo explicito identificado; validar consumo do modulo.
- Evidencia de criacao/garantia de schema: `apps/painel/src/lib/recrutamento/repository.ts`
- Evidencias documentais: `apps/painel/docs/15-plano-tecnico-recrutamento.md`

| Coluna | Tipo | Nulo | Chave | Default | Descricao |
| --- | --- | --- | --- | --- | --- |
| id | varchar(64) | Nao | PK | - | Identificador primario do registro. |
| title | varchar(180) | Nao | - | - | Campo do dominio `recruitment_jobs` referente a title. |
| department | varchar(180) | Sim | - | - | Campo do dominio `recruitment_jobs` referente a department. |
| unit_name | varchar(180) | Sim | - | - | Nome da unidade exibido/normalizado para consumo no painel. |
| employment_regime | varchar(20) | Nao | - | - | Campo do dominio `recruitment_jobs` referente a employment regime. |
| status | varchar(20) | Nao | IDX | - | Status operacional/negocial atual do registro. |
| owner_name | varchar(180) | Sim | - | - | Nome de owner utilizado para exibicao, filtro ou agrupamento. |
| opened_at | date | Sim | - | - | Data/hora referente a opened. |
| closed_at | date | Sim | - | - | Data/hora referente a closed. |
| notes | text | Sim | - | - | Observacoes livres registradas pelo processo ou pelo usuario. |
| created_at | text | Nao | - | - | Data/hora de criacao do registro no painel. |
| updated_at | text | Nao | - | - | Data/hora da ultima atualizacao local do registro. |

---

