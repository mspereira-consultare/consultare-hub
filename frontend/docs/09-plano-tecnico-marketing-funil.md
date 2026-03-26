# Plano Técnico — Módulo `/marketing/funil`

## Objetivo
Consolidar a leitura de performance de marketing da Consultare em um único módulo, cruzando:

- Google Ads
- GA4
- Clinia Ads
- Feegow (agendamentos)
- Faturamento Bruto Analítico

O foco atual do módulo é sair de uma leitura puramente de mídia para uma leitura de intenção, contato, conversão em agendamento e resultado financeiro.

## Regra de negócio vigente

### Lead
No contexto atual da Consultare, `lead` no painel significa:

- clique que leva o usuário para o WhatsApp da clínica

Essa regra é aplicada no worker do marketing/GA4 e no painel. O lead não é mais derivado de `keyEvents` genéricos do GA4.

### Clinia Ads
O Clinia Ads entra como etapa posterior ao lead:

1. `Leads (WhatsApp)`
2. `Contatos recebidos no Clinia`
3. `Agendamentos convertidos no Clinia`
4. `Agendamentos válidos no Feegow`
5. `Faturamento`

O dado do Clinia Ads não substitui lead. Ele mede o que aconteceu depois do clique de intenção.

## Fontes de dados

### Google Ads + GA4
- Worker: `workers/worker_marketing_funnel_google.py`
- Tabelas principais:
  - `raw_google_ads_campaign_daily`
  - `raw_ga4_campaign_daily`
  - `fact_marketing_funnel_daily`
  - `fact_marketing_funnel_daily_device`
  - `fact_marketing_funnel_daily_landing_page`
  - `fact_marketing_funnel_daily_channel`

### Clinia Ads
- Worker: `workers/worker_clinia_ads.py`
- Endpoint de origem:
  - `https://dashboard.clinia.io/api/statistics/ads?type=this-month&startDate=...&endDate=...`
- Tabelas:
  - `clinia_ads_jobs`
  - `clinia_ads_job_items`
  - `raw_clinia_ads_contacts`
  - `fact_clinia_ads_daily`

### Agendamentos
- Fonte: `feegow_appointments`
- Regra atual do painel:
  - considerar `scheduled_at`
  - usar status válidos `1, 2, 3, 4, 7`

### Faturamento
- Fonte: `faturamento_analitico`
- Regra atual do painel:
  - usar `data_de_referência`
  - somar `total_pago`
- Label no card:
  - `Base: Faturamento Bruto Analítico`

## Modelo analítico atual

### Fato principal
Tabela: `fact_marketing_funnel_daily`

Grão:
- `date_ref + brand_slug + unit_key + specialty_key + channel_key + campaign_key`

Métricas principais:
- `spend`
- `impressions`
- `clicks`
- `ctr`
- `cpc`
- `sessions`
- `total_users`
- `new_users`
- `engaged_sessions`
- `engagement_rate`
- `avg_session_duration_sec`
- `page_views`
- `event_count`
- `session_default_channel_group`
- `interactions`
- `conversions`
- `all_conversions`
- `conversions_value`
- `cost_per_conversion`
- `leads`
- `cpl`
- `appointments`
- `revenue`

### Fato diário do Clinia Ads
Tabela: `fact_clinia_ads_daily`

Grão:
- `date_ref + brand_slug + origin + source_id + source_url_hash + title`

Métricas:
- `contacts_received`
- `new_contacts_received`
- `appointments_converted`
- `conversion_rate`
- `avg_conversion_time_sec`

Regras:
- `contacts_received`: contagem de registros com `stage='INTERESTED'`
- `new_contacts_received`: `COUNT(DISTINCT jid)` entre os `INTERESTED`
- `appointments_converted`: contagem de registros com `stage='APPOINTMENT'`
- `conversion_rate`: `appointments_converted / contacts_received`
- `avg_conversion_time_sec`: média de `conversion_time` quando disponível

## Worker `clinia_ads`

Arquivo:
- `workers/worker_clinia_ads.py`

### Motivo da separação
O endpoint de anúncios da Clinia é analítico e não deve rodar no mesmo ciclo curto do worker Clinia operacional.

### O que o worker faz
1. Reaproveita o cookie atual salvo em `integrations_config`
2. Renova sessão com `CliniaCookieRenewer` quando necessário
3. Consulta o endpoint de anúncios com `type=this-month`
4. Processa os blocos `current` e `last`
5. Persiste o raw por contato/evento
6. Reconstrói a fact diária derivada
7. Atualiza jobs, job items e heartbeat próprio

### Execução
- teste de conexão:
  - `python workers/worker_clinia_ads.py --test-connections`
- garantir schema:
  - `python workers/worker_clinia_ads.py --ensure-only`
- ciclo único:
  - `python workers/worker_clinia_ads.py --once`
- enfileirar e sair:
  - `python workers/worker_clinia_ads.py --enqueue`

### Heartbeat
Serviço:
- `clinia_ads`

Etapas reportadas em `system_status.details`:
- `fetch`
- `persist_raw`
- `rebuild_fact`

### Schedule no orquestrador
Arquivo:
- `workers/main.py`

Horários:
- `05:35`
- `12:35`
- `18:35`

Aliases:
- `clinia_ads`
- `ads_clinia`
- `worker_clinia_ads`

## Limitações conhecidas da origem Clinia Ads

- O endpoint não oferece backfill histórico arbitrário
- `type=this-month` é a forma estável validada
- O histórico confiável passa a existir da implantação em diante
- O payload expõe o período atual e o anterior, mas não substitui um histórico completo de longo prazo

Por isso:
- o painel não deve prometer histórico completo anterior à implantação do worker
- períodos antes da cobertura devem aparecer como indisponibilidade histórica, e não como zero silencioso

## Regra de mapeamento com campanhas Google

Na primeira fase, o enriquecimento da tabela principal de campanhas usa apenas:

- `origin = 'google'`
- `source_id = campaign_name` com correspondência exata

Sem fuzzy matching.

Se não houver match:
- o registro continua visível no bloco `Anúncios Clinia`
- mas não é forçado para dentro da tabela de campanhas do Google

## APIs do módulo

### Existentes/expandidas
- `GET /api/admin/marketing/funil/summary`
- `GET /api/admin/marketing/funil/campaigns`
- `GET /api/admin/marketing/funil/channels`
- `GET /api/admin/marketing/funil/filter-options`
- `GET /api/admin/marketing/funil/jobs/latest`
- `GET /api/admin/marketing/funil/source-status`
- `POST /api/admin/marketing/funil/refresh`

### Novas rotas de Clinia Ads
- `GET /api/admin/marketing/funil/clinia-ads/ads`
- `GET /api/admin/marketing/funil/clinia-ads/origins`

### Regra do refresh
- `POST /api/admin/marketing/funil/refresh` continua disparando somente o refresh Google
- Clinia Ads é atualizado por schedule
- a UI mostra `lastSyncAt` separado para evitar expectativa errada de refresh manual conjunto

## Frontend do módulo

Página:
- `frontend/src/app/(admin)/marketing/funil/page.tsx`

Blocos atuais:
- filtros e status de sincronização
- KPIs de mídia
- KPIs de Clinia Ads
- funil visual completo
- tabela de campanhas do Google enriquecida com métricas Clinia
- seção `Anúncios Clinia`
- tabela de canais

Leituras visuais importantes:
- `Leads` = clique para WhatsApp
- `Contatos Clinia` = contatos recebidos pelos anúncios no Clinia
- `Agendamentos Clinia` = contatos que chegaram ao estágio `APPOINTMENT`

## Evolução de 25/03/2026 — Abas e Saúde Google Ads

Para evitar excesso de informação em uma única tela, a rota `/marketing/funil` passou a manter os filtros globais no topo e separar o conteúdo em abas:

- `Visão geral`
- `Campanhas`
- `Saúde Google Ads`

### Visão geral

Mantém a leitura executiva:

- KPIs principais
- funil visual
- bloco Clinia Ads
- canais

### Campanhas

Foco em performance consolidada do período por campanha, com:

- investimento
- cliques
- leads via WhatsApp
- contatos e agendamentos Clinia
- conversões do Google Ads
- valor de conversão
- ROAS Ads

### Saúde Google Ads

Nova aba diagnóstica para leitura do snapshot mais recente das campanhas até `endDate`, com:

- status da campanha
- status primário
- motivos do status
- orçamento diário
- tipo de orçamento
- estratégia de lances
- pontuação de otimização
- tipo de campanha
- datas de início e fim

### Novos campos coletados do Google Ads

Os campos abaixo passaram a ser persistidos em `raw_google_ads_campaign_daily`:

- `campaign_status`
- `campaign_primary_status`
- `campaign_primary_status_reasons_json`
- `bidding_strategy_type`
- `optimization_score`
- `advertising_channel_type`
- `campaign_start_date`
- `campaign_end_date`
- `budget_name`
- `budget_period`
- `budget_amount`
- `currency_code`

Esses campos são tratados como snapshot de campanha e não são somados na fact principal do período.

### Novas métricas derivadas no painel

Na aba de campanhas e no drawer, o painel passou a calcular e exibir:

- `interactionRate`
- `averageCost`
- `conversionRate`
- `conversionsValuePerCost`

### Nova API

- `GET /api/admin/marketing/funil/google-ads/health`

Essa rota retorna a lista paginada de campanhas com snapshot atual do Google Ads, respeitando os filtros globais do módulo.

## Validações recomendadas

### Worker
```bash
python -m py_compile workers/worker_clinia_ads.py workers/main.py
python workers/worker_clinia_ads.py --test-connections
python workers/worker_clinia_ads.py --once
```

### Frontend
```bash
cd frontend
npm run build
```

## Smoke técnico validado nesta entrega

- `py_compile` do worker e do orquestrador
- `--test-connections` do `worker_clinia_ads`
- execução real de `python workers/worker_clinia_ads.py --once`
- `tsc --noEmit`
- `next build`

Exemplo de persistência validada após o smoke:
- `raw_clinia_ads_contacts`: `4846` linhas
- `fact_clinia_ads_daily`: `2536` linhas

Exemplo de agregados validados:
- março/2026:
  - `contacts_received`: `2403`
  - `appointments_converted`: `50`
  - `conversion_rate`: `2,08%`
- fevereiro/2026:
  - `contacts_received`: `2173`
  - `appointments_converted`: `109`
  - `conversion_rate`: `5,02%`

## Arquivos principais desta etapa

- `workers/worker_clinia_ads.py`
- `workers/main.py`
- `frontend/src/lib/marketing_funil/repository.ts`
- `frontend/src/app/api/admin/marketing/funil/summary/route.ts`
- `frontend/src/app/api/admin/marketing/funil/campaigns/route.ts`
- `frontend/src/app/api/admin/marketing/funil/clinia-ads/ads/route.ts`
- `frontend/src/app/api/admin/marketing/funil/clinia-ads/origins/route.ts`
- `frontend/src/app/api/admin/marketing/funil/source-status/route.ts`
- `frontend/src/app/(admin)/marketing/funil/page.tsx`
- `frontend/src/app/(admin)/marketing/funil/components/MarketingFunilKpis.tsx`
- `frontend/src/app/(admin)/marketing/funil/components/MarketingFunilFunnelVisual.tsx`
- `frontend/src/app/(admin)/marketing/funil/components/MarketingFunilCampaignTable.tsx`
- `frontend/src/app/(admin)/marketing/funil/components/MarketingFunilCampaignDrawer.tsx`
- `frontend/src/app/(admin)/marketing/funil/components/MarketingFunilSyncStatus.tsx`
- `frontend/src/app/(admin)/marketing/funil/components/MarketingFunilCliniaAdsSection.tsx`

## Próximos passos naturais

1. Criar o novo endpoint/submódulo adicional da Clinia definido com a gestora
2. Expandir atribuição entre campanhas, agendamentos e faturamento
3. Criar alertas explícitos de cobertura histórica na UI quando o período selecionado estiver fora da janela capturada
