# Plano Técnico — Módulo `/marketing/funil` (V1 Google-first)

## Objetivo
Implementar o módulo `/marketing/funil` com fonte inicial em Google Ads + GA4, com dados auditáveis, atualização por job e consumo por APIs/painel.

## Escopo V1
- Pipeline completo: ingestão, normalização, persistência `raw`, fato diário, jobs e heartbeat.
- Execução manual (CLI/job) e agendada pelo orquestrador.
- Placeholders explícitos para etapas ainda não integradas:
  - `appointments`
  - `revenue`
  - `show_rate`

## Decisões congeladas
- Estratégia: Google-first.
- Autenticação: OAuth + refresh token.
- Multi-conta por marca via tabela de configuração.
- Regra de atribuição V1: `LAST_VALID_SOURCE_CAMPAIGN`.
- Granularidade analítica: diária.
- Timezone operacional: `America/Sao_Paulo`.

## Credenciais e variáveis
### Obrigatórias
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REFRESH_TOKEN`
- `GOOGLE_ADS_DEVELOPER_TOKEN`

### Opcionais
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID`
- `MARKETING_FUNNEL_API_TIMEOUT_SEC` (default `60`)
- `MARKETING_FUNNEL_RETRY_TOTAL` (default `3`)
- `MARKETING_FUNNEL_RETRY_BACKOFF_SEC` (default `0.5`)
- `MARKETING_FUNNEL_SYNC_POLL_SEC` (default `60`)
- `MARKETING_FUNNEL_DEFAULT_PERIOD` (default `previous_month`)

## Modelo de dados V1
### Configuração
- `marketing_google_accounts`
  - `id`, `brand_slug`, `ads_customer_id`, `ga4_property_id`, `is_active`, `notes`, `updated_at`
- `marketing_campaign_mapping`
  - `id`, `brand_slug`, `campaign_match_type`, `campaign_match_value`, `unit_key`, `specialty_key`, `channel_key`, `priority`, `is_active`, `updated_at`

### Jobs
- `marketing_funnel_jobs`
  - `id`, `status`, `period_ref`, `start_date`, `end_date`, `scope_json`, `requested_by`, `error_message`, `created_at`, `started_at`, `finished_at`, `updated_at`
- `marketing_funnel_job_items`
  - `id`, `job_id`, `brand_slug`, `ads_customer_id`, `ga4_property_id`, `status`, `records_read`, `records_written`, `error_message`, `duration_ms`, `created_at`, `updated_at`

### Raw
- `raw_google_ads_campaign_daily`
- `raw_ga4_campaign_daily`

### Fato
- `fact_marketing_funnel_daily`
  - chave natural única:
    - `date_ref, brand_slug, unit_key, specialty_key, channel_key, campaign_key`
  - métricas:
    - `spend`, `impressions`, `clicks`, `ctr`, `cpc`, `leads`, `cpl`
  - placeholders:
    - `appointments`, `revenue`, `show_rate`

## Worker
Arquivo: `workers/worker_marketing_funnel_google.py`

### Modos de execução
- Loop contínuo: `python workers/worker_marketing_funnel_google.py`
- Ciclo único: `python workers/worker_marketing_funnel_google.py --once`
- Enfileirar e sair: `python workers/worker_marketing_funnel_google.py --enqueue --period 2026-02`
- Intervalo explícito:
  - `python workers/worker_marketing_funnel_google.py --once --start 2026-02-01 --end 2026-02-29`
- Escopo:
  - `--brand consultare`
  - `--account 1234567890`
- Teste de conexão:
  - `python workers/worker_marketing_funnel_google.py --test-connections`
- Somente schema:
  - `python workers/worker_marketing_funnel_google.py --ensure-only`

### Fluxo resumido
1. Garantir tabelas.
2. Ler job `PENDING` (ou criar ad-hoc em `--once` com auto-enqueue).
3. Carregar contas ativas de `marketing_google_accounts`.
4. Obter token OAuth Google.
5. Coletar:
   - Google Ads (`googleAds:searchStream`)
   - GA4 (`runReport`)
6. Persistir em `raw_*`.
7. Mesclar Ads + GA4 por `data + campanha normalizada`.
8. Aplicar mapeamento de campanha.
9. Upsert em `fact_marketing_funnel_daily`.
10. Atualizar `marketing_funnel_jobs`, `marketing_funnel_job_items` e heartbeat `system_status.marketing_funnel`.

## Orquestrador
Arquivo: `workers/main.py`

Implementado:
- import do worker;
- novo serviço canônico `marketing_funnel`;
- aliases:
  - `marketing_funil`
  - `funil_marketing`
  - `worker_marketing_funnel_google`
- execução por `run_service`:
  - drena jobs pendentes chamando `process_pending_marketing_funnel_jobs_once(auto_enqueue_if_empty=False)`;
- agendamento diário:
  - `05:40` e `18:10`.

## Refresh API
Arquivo: `frontend/src/app/api/admin/refresh/route.ts`

Implementado:
- aliases adicionados para resolver o serviço `marketing_funnel`.

## APIs do módulo (próxima etapa)
Namespace planejado:
- `GET /api/admin/marketing/funil/summary`
- `GET /api/admin/marketing/funil/campaigns`
- `GET /api/admin/marketing/funil/jobs/latest`
- `POST /api/admin/marketing/funil/refresh`
- `GET /api/admin/marketing/funil/export?format=xlsx|pdf`

## Permissões (próxima etapa)
- Novo page key: `marketing_funil`.
- Ações: `view`, `edit`, `refresh`.

## Testes de aceite V1
1. Worker cria/consome job sem duplicar fato no mesmo período.
2. Reprocessamento do mesmo período mantém idempotência (upsert).
3. Falha de uma conta não derruba execução total (`PARTIAL`).
4. Heartbeat reflete status real (`RUNNING`, `COMPLETED`, `FAILED`, `WARNING`).
5. Dados `raw` e `fact` conciliam por período/campanha.

## Troubleshooting rápido
- Erro OAuth:
  - validar `CLIENT_ID`, `CLIENT_SECRET`, `REFRESH_TOKEN`.
- Erro Ads:
  - validar `GOOGLE_ADS_DEVELOPER_TOKEN` e acesso à conta.
- Erro GA4:
  - validar `ga4_property_id` e permissão de leitura.
- Sem dados:
  - verificar `marketing_google_accounts.is_active=1` e intervalo de datas.

