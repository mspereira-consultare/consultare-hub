# Módulo Agenda Ocupação

## Visão geral

A página `/agenda-ocupacao` mostra ocupação de agenda por:

- período;
- unidade;
- especialidade.

O objetivo é permitir análise operacional e cruzamento com campanhas de marketing usando granularidade diária no banco.

Comportamento padrão da tela:

- abre com filtro do primeiro dia do mês atual até o último dia do mês + 2 meses futuros;
- esse recorte acompanha o horizonte abastecido automaticamente pelo worker.

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
- O scheduler também enfileira refresh automático para o mês atual + horizonte futuro configurável por `AGENDA_OCCUPANCY_FUTURE_MONTHS` (padrão `2`), cobrindo todas as unidades (`2`, `3`, `12`) às `06:15`, `12:45` e `18:45`.

## APIs do módulo

- `GET /api/admin/agenda-ocupacao`
  - Retorna tabela agregada por especialidade + totais + heartbeat + último job.
- `POST /api/admin/agenda-ocupacao/refresh`
  - Cria job e marca `system_status` como `PENDING`.
- `GET /api/admin/agenda-ocupacao/jobs/latest`
  - Retorna último job para o filtro aplicado.
- `GET /api/admin/agenda-ocupacao/export?format=xlsx|pdf`
  - Exporta dados do snapshot (não consulta Feegow em tempo real).

## Report semanal por e-mail

O módulo também suporta um envio automático semanal com base no mesmo snapshot da página `/agenda-ocupacao`.

Comportamento:

- configuração via modal dentro da própria página;
- destinatários vindos da base de colaboradores;
- apenas colaboradores ativos com `corporate_email` entram como aptos;
- envio toda quinta às `08:00` no fuso `America/Sao_Paulo`;
- janela enviada: semana seguinte, de segunda a sábado;
- antes de enviar, o processo atualiza o snapshot da ocupação para a mesma janela do e-mail.

Endpoints administrativos:

- `GET /api/admin/agenda-ocupacao/report/settings`
- `PUT /api/admin/agenda-ocupacao/report/settings`
- `GET /api/admin/agenda-ocupacao/report/eligibility`
- `GET /api/admin/agenda-ocupacao/report/preview`
- `GET /api/admin/agenda-ocupacao/report/runs`
- `POST /api/admin/agenda-ocupacao/report/process`

Persistência:

- `agenda_occupancy_report_settings`
- `agenda_occupancy_report_runs`
- `agenda_occupancy_report_recipients`

Heartbeat:

- `system_status.service_name = agenda_occupancy_weekly_report`

Worker dedicado para cron externo:

- arquivo: `workers/worker_agenda_occupancy_weekly_report.py`
- ele atualiza primeiro o snapshot semanal da ocupação e, na sequência, chama o endpoint interno do painel para processar o envio.

Exemplo de comando para um cron no Railway:

```bash
python worker_agenda_occupancy_weekly_report.py
```

Agendamento sugerido no Railway:

```text
0 11 * * 4
```

Observação:

- o Railway avalia cron em UTC; `11:00 UTC` corresponde a `08:00` em `America/Sao_Paulo`.

Variáveis mínimas:

- `AGENDA_OCCUPANCY_REPORT_CRON_SECRET`
- `PAINEL_BASE_URL` ou `NEXTAUTH_URL`
- credenciais já existentes do SendPulse
- credenciais já existentes do Feegow

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
