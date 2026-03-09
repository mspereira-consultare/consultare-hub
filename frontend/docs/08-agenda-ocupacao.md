# Módulo Agenda Ocupação

## Visão geral

A página `/agenda-ocupacao` mostra ocupação de agenda por:

- período;
- unidade;
- especialidade.

O objetivo é permitir análise operacional e cruzamento com campanhas de marketing usando granularidade diária no banco.

## Métrica oficial

`Tx. de Confirmação (%) = Agendamentos / (Horários Disponíveis + Agendamentos - Horários Bloqueados) * 100`

Regras:

- Status de agendamento considerados no numerador: `1, 2, 3, 4, 7`.
- `capacidade_líquida = disponíveis + agendamentos - bloqueados`.
- Se `capacidade_líquida <= 0`, a taxa é `0`.

## Fontes de dados (Feegow API)

- `GET /appoints/search`  
  Base de agendamentos no período.
- `GET /appoints/available-schedule`  
  Base de horários disponíveis por profissional/especialidade.
- `GET /lock/list`  
  Base de bloqueios de agenda.
- `GET /specialties/list` e `GET /professional/list`  
  Catálogo de especialidades e vínculo profissional-especialidade.

## Persistência (MySQL)

### `agenda_occupancy_daily`

Snapshot diário por `data_ref + unidade_id + especialidade_id`:

- `agendamentos_count`
- `horarios_disponiveis_count`
- `horarios_bloqueados_count`
- `capacidade_liquida_count`
- `taxa_confirmacao_pct`
- `updated_at`

Índices:

- `idx_agenda_occ_daily_unit_date`
- `idx_agenda_occ_daily_spec_date`

### `agenda_occupancy_jobs`

Fila de processamento manual:

- `status`: `PENDING | RUNNING | COMPLETED | FAILED`
- `start_date`, `end_date`
- `unit_scope_json`
- `requested_by`
- timestamps de execução

## Worker

Arquivo: `workers/worker_agenda_ocupacao.py`

Comportamento:

1. Lê job pendente em `agenda_occupancy_jobs`.
2. Busca dados da API para o período/unidades solicitados.
3. Recalcula o snapshot do período (replace por faixa + UPSERT).
4. Atualiza heartbeat em `system_status` com `service_name = agenda_occupancy`.

Integração com orquestrador:

- `workers/main.py` mapeia aliases:
  - `agenda_occupancy`
  - `agenda_ocupacao`
  - `ocupacao_agenda`
- Quando a API solicita refresh, o orquestrador processa o job pendente.

## APIs do módulo

- `GET /api/admin/agenda-ocupacao`
  - Retorna tabela agregada por especialidade + totais + heartbeat + último job.
- `POST /api/admin/agenda-ocupacao/refresh`
  - Cria job e marca `system_status` como `PENDING`.
- `GET /api/admin/agenda-ocupacao/jobs/latest`
  - Retorna último job para o filtro aplicado.
- `GET /api/admin/agenda-ocupacao/export?format=xlsx|pdf`
  - Exporta dados do snapshot (não consulta Feegow em tempo real).

## Permissões

Novo `PageKey`: `agenda_ocupacao`

Ações suportadas:

- `view`
- `edit`
- `refresh`

Observação importante:

- Usuários que já possuem matriz persistida recebem o novo `PageKey` desabilitado por padrão até concessão explícita.

## Uso para marketing

A chave analítica recomendada para cruzamento com campanhas é:

- `data_ref + unidade_id + especialidade_id`

Isso permite comparar, no mesmo dia e unidade, variações de taxa de confirmação com investimentos/canais de aquisição.
