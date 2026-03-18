# Blueprint operacional para o Codex — Marketing do Hub Gerencial Consultare

## Objetivo deste blueprint

Servir como contexto operacional para implementar a frente de marketing do Hub com o menor risco possível, respeitando:

- a estrutura real do arquivo `relatorio semanal mkt.xlsx`;
- a necessidade de crescer por etapas;
- a necessidade de manter números auditáveis;
- a realidade de integrações que podem depender de permissão, licenciamento ou saneamento de base.

---

## 1. Decisão de produto

### O produto não deve nascer como “um dashboard único de métricas soltas”

Ele deve nascer como um **domínio de marketing com camadas claras**:

1. **Ingestão**
   - coleta dados brutos dos provedores
2. **Normalização**
   - padroniza nomes, dimensões, datas e chaves de ligação
3. **Marts / fatos**
   - grava tabelas analíticas consolidadas por dia, marca, unidade, especialidade, canal e campanha
4. **Serviço de leitura**
   - alimenta cards, tabelas, gráficos e exportações
5. **Interface**
   - exibe visão executiva, drill-down e exportação

---

## 2. Escopo funcional final

### Páginas / áreas sugeridas

#### 2.1 `/marketing/controle`

Cockpit executivo baseado no Excel:

- semanal
- mensal
- por marca
- por bloco

#### 2.2 `/marketing/funil`

Fluxo:

- investimento
- lead
- agendamento
- receita
- agenda

#### 2.3 `/marketing/reputacao`

Fila e painel de reputação:

- Google
- Reclame Aqui, quando disponível

#### 2.4 `/marketing/configuracoes`

Tela técnica/admin para:

- conectar fontes
- mapear contas
- testar integrações
- configurar marcas
- definir regras de atribuição
- ver logs de sincronização

---

## 3. Arquitetura recomendada

### Stack lógica sugerida

Considerando um projeto web moderno com TypeScript:

- **frontend**: Next.js / React
- **backend**: rotas server-side / handlers / services
- **banco**: Postgres
- **jobs**: cron / worker
- **exportação**: geração server-side de XLSX e PDF
- **IA**: apenas para rascunho de respostas no módulo de reputação

### Princípio arquitetural

Cada provedor deve entrar por um **adapter** separado.

### Estrutura sugerida

```text
src/
  server/
    integrations/
      ga4/
      gsc/
      gbp/
      google-ads/
      meta-ads/
      meta-organic/
      linkedin/
      email/
      semrush/
      clinia/
      feegow/
    services/
      marketing/
        control/
        funnel/
        reputation/
      exports/
      ai/
    repositories/
    db/
  app/
    (dashboard)/
      marketing/
        controle/
        funil/
        reputacao/
        configuracoes/
  components/
    marketing/
      filters/
      cards/
      grids/
      charts/
      tables/
      export/
```

## 4. Modelo de dados recomendado

### 4.1 Dimensões

#### `dim_brand`

Campos sugeridos:

- `id`
- `slug`
- `name`
- `is_active`

Exemplos:

- `consultare`
- `resolve`
- `franquia`

#### `dim_unit`

- `id`
- `brand_id`
- `name`
- `external_code`

#### `dim_specialty`

- `id`
- `name`
- `normalized_name`

#### `dim_channel`

- `id`
- `source`
- `medium`
- `channel_group`
- `platform`

Exemplos:

- `google / cpc`
- `meta / paid_social`
- `instagram / organic`
- `email / email`
- `google_business_profile / local`

#### `dim_campaign`

- `id`
- `platform`
- `external_id`
- `campaign_name`
- `normalized_campaign_name`
- `brand_id`
- `unit_id`
- `specialty_id`

### 4.2 Tabelas de sincronização

#### `integration_connections`

- `id`
- `provider`
- `status`
- `account_name`
- `external_account_id`
- `scopes_json`
- `last_tested_at`
- `last_success_at`

#### `sync_runs`

- `id`
- `provider`
- `scope_key`
- `started_at`
- `finished_at`
- `status`
- `records_read`
- `records_written`
- `error_message`

### 4.3 Tabelas brutas

Criar uma tabela por integração, por exemplo:

- `raw_ga4_reports`
- `raw_gsc_reports`
- `raw_gbp_daily_metrics`
- `raw_gbp_reviews`
- `raw_google_ads_campaigns`
- `raw_meta_ads_campaigns`
- `raw_meta_organic_metrics`
- `raw_linkedin_organic_metrics`
- `raw_email_campaign_metrics`
- `raw_semrush_site_audit`
- `raw_clinia_leads`
- `raw_feegow_appointments`
- `raw_feegow_revenue`

Regra:

Guardar:

- payload bruto
- hash do payload
- período consultado
- chave externa
- data de coleta

Isso facilita:

- auditoria
- reprocessamento
- troubleshooting

### 4.4 Tabelas analíticas principais

#### `fact_marketing_control_daily`

Grão:

- 1 linha por dia + marca + bloco + métrica + segmentações aplicáveis

Campos sugeridos:

- `date`
- `brand_id`
- `unit_id`
- `specialty_id`
- `metric_group`
- `metric_name`
- `metric_value_num`
- `metric_value_text`
- `source_provider`
- `period_tag`

Uso:

- montar o painel do módulo 1

#### `fact_ads_campaign_daily`

Grão:

- 1 linha por dia + campanha + canal

Campos:

- `date`
- `brand_id`
- `unit_id`
- `specialty_id`
- `campaign_id`
- `platform`
- `impressions`
- `clicks`
- `ctr`
- `spend`
- `cpc`
- `conversions`
- `conversion_value`

#### `fact_email_campaign_daily`

Campos:

- `date`
- `brand_id`
- `campaign_name`
- `campaigns_sent`
- `emails_sent`
- `emails_delivered`
- `open_rate`
- `click_rate`
- `unsubscribe_count`

#### `fact_local_presence_daily`

Campos:

- `date`
- `brand_id`
- `unit_id`
- `search_views`
- `maps_views`
- `website_clicks`
- `call_clicks`
- `direction_requests`
- `review_count`
- `avg_rating`
- `review_replies_count`

#### `fact_site_seo_daily`

Campos:

- `date`
- `brand_id`
- `sessions`
- `new_users`
- `returning_users`
- `avg_session_duration`
- `bounce_rate`
- `site_health`
- `authority_score`
- `error_count`
- `site_performance_score`

#### `fact_social_organic_daily`

Campos:

- `date`
- `brand_id`
- `platform`
- `followers`
- `posts_count`
- `stories_count`
- `impressions`
- `reach`
- `interactions`
- `likes`
- `comments`
- `shares`
- `clicks`
- `best_post_ref`
- `best_story_ref`

#### `fact_marketing_to_revenue_daily`

Campos:

- `date`
- `brand_id`
- `unit_id`
- `specialty_id`
- `platform`
- `campaign_id`
- `spend`
- `leads`
- `appointments`
- `show_rate`
- `gross_revenue`
- `cpl`
- `cost_per_appointment`
- `roas`

#### `fact_reputation_items`

Campos:

- `id`
- `provider`
- `external_id`
- `brand_id`
- `unit_id`
- `published_at`
- `author_name`
- `rating`
- `title`
- `body`
- `status`
- `sentiment`
- `ai_draft`
- `final_reply`
- `reply_status`
- `replied_at`
- `raw_url`

## 5. Mapeamento do Excel para fontes e status de implementação

### Legenda

- **MVP** = entra já
- **CONDICIONAL** = depende de acesso / API / conta
- **FASE 2** = melhor colocar depois

### Mapeamento

| Bloco / métrica | Fonte principal sugerida | Status |
|---|---|---|
| Visitantes do site | GA4 | MVP |
| Leads via e-mail | CRM / Clinia / conversões normalizadas | MVP |
| Custo por lead | Ads + leads normalizados | MVP |
| Facebook orgânico | Meta Pages API / Insights | CONDICIONAL |
| Instagram orgânico | Instagram Insights API | CONDICIONAL |
| LinkedIn orgânico | LinkedIn organization analytics | CONDICIONAL |
| Campanhas enviadas / entregues / abertura / clique / cancelamento | provedor de e-mail | MVP |
| Google Meu Negócio / reviews / chamadas / rota / site | Google Business Profile | MVP |
| Integridade do site | SEMrush Site Audit | CONDICIONAL |
| Pontuação de autoridade | SEMrush Authority Score | CONDICIONAL |
| Erros do site | SEMrush Site Audit | CONDICIONAL |
| Total de visitas / novos / retorno / duração / idade / sexo / horários / top páginas / rejeição | GA4 | MVP |
| Desempenho do site | PageSpeed / CWV / SEMrush / score interno | FASE 2 |
| Verba Google | Google Ads | MVP |
| Verba Facebook | Meta Ads | MVP |

### Observações importantes

- Leads via e-mail não deve ser calculado só com evento de Analytics se existir CRM confiável.
- CPL precisa usar a mesma definição de lead em todo o produto.
- Melhor post e melhor story precisam de uma regra clara:
  - maior alcance
  - maior interação
  - maior taxa de interação
- Desempenho do site é um campo ambíguo no Excel; congelar a definição no kickoff.
- Integridade do site e pontuação de autoridade sugerem fortemente o uso de SEMrush.

## 6. Regras de normalização

### 6.1 Datas

- Sempre gravar em grão diário.
- As visões semanal e mensal devem ser agregadas em query ou materialização.

### 6.2 Marca

Toda linha precisa estar vinculada a:

- Consultare
- Resolve
- Franquia

### 6.3 Unidade e especialidade

Se a origem não trouxer isso nativamente, criar regra de mapeamento:

- por campanha
- por naming convention
- por tabela manual de correspondência

### 6.4 Campanhas

Criar função de normalização:

- remove variações de caixa
- remove duplicidades triviais
- separa nome técnico de nome amigável

### 6.5 Leads

Definir um único contrato:

- o que é lead?
- qual data vale?
- qual origem vale?
- como deduplicar?

### 6.6 Receita

Definir:

- usar receita bruta
- usar competência do agendamento ou do faturamento
- como lidar com cancelamento / no-show / remarcação

## 7. Jobs e sincronização

### Frequência recomendada

#### Diário (madrugada)

- GA4
- Search Console
- Google Ads
- Meta Ads
- Feegow
- Clinia
- e-mail marketing
- Google Business Profile métricas

#### Diário ou quase diário

- reviews do Google
- reputação

#### Diário / sob demanda

- Meta orgânico
- LinkedIn orgânico

#### Semanal

- SEMrush Site Audit
- métricas técnicas de SEO

### Jobs sugeridos

- `syncGa4Daily()`
- `syncSearchConsoleDaily()`
- `syncGoogleAdsDaily()`
- `syncMetaAdsDaily()`
- `syncEmailDaily()`
- `syncGbpMetricsDaily()`
- `syncGbpReviewsDaily()`
- `syncSemrushWeekly()`
- `syncCliniaLeadsDaily()`
- `syncFeegowAgendaDaily()`
- `syncFeegowRevenueDaily()`
- `buildMarketingControlMart()`
- `buildMarketingFunnelMart()`
- `buildReputationQueue()`

### Regras de job

- cada job grava em `sync_runs`
- cada job deve ser idempotente
- usar upsert por chave natural + data
- suportar backfill por intervalo
- expor botão de reprocessamento por período no admin

## 8. Serviços de backend

### 8.1 Control service

Responsável por:

- consolidar o painel do módulo 1
- calcular semanal / mensal
- preencher meta, realizado, `%`
- entregar grid no formato parecido com o Excel

Métodos sugeridos:

- `getMarketingControlSummary(filters)`
- `getMarketingControlGrid(filters)`
- `getMarketingControlTrends(filters)`
- `exportMarketingControlXlsx(filters)`
- `exportMarketingControlPdf(filters)`

### 8.2 Funnel service

Responsável por:

- cruzar mídia -> lead -> agenda -> receita
- calcular CPL, custo por agendamento, ROAS
- sinalizar gargalos

Métodos sugeridos:

- `getFunnelSummary(filters)`
- `getCampaignPerformance(filters)`
- `getSpecialtyPerformance(filters)`
- `getCapacityVsDemand(filters)`
- `exportFunnelXlsx(filters)`
- `exportFunnelPdf(filters)`

### 8.3 Reputation service

Responsável por:

- listar avaliações/reclamações
- classificar
- gerar rascunho IA
- publicar ou copiar resposta

Métodos sugeridos:

- `listReputationItems(filters)`
- `getReputationSummary(filters)`
- `generateReplyDraft(itemId)`
- `publishReply(itemId)`
- `markAsResolved(itemId)`

## 9. Endpoints sugeridos

### Controle

- `GET /api/marketing/control/summary`
- `GET /api/marketing/control/grid`
- `GET /api/marketing/control/trends`
- `GET /api/marketing/control/export/xlsx`
- `GET /api/marketing/control/export/pdf`

### Funil

- `GET /api/marketing/funnel/summary`
- `GET /api/marketing/funnel/campaigns`
- `GET /api/marketing/funnel/specialties`
- `GET /api/marketing/funnel/capacity`
- `GET /api/marketing/funnel/export/xlsx`
- `GET /api/marketing/funnel/export/pdf`

### Reputação

- `GET /api/marketing/reputation/summary`
- `GET /api/marketing/reputation/items`
- `POST /api/marketing/reputation/:id/draft-reply`
- `POST /api/marketing/reputation/:id/publish-reply`
- `POST /api/marketing/reputation/:id/copy-reply`
- `POST /api/marketing/reputation/:id/classify`

### Admin / integrações

- `GET /api/marketing/integrations`
- `POST /api/marketing/integrations/test`
- `POST /api/marketing/integrations/sync`
- `GET /api/marketing/sync-runs`

## 10. Frontend — composição sugerida

### Componentes-base

- `MarketingFilters`
- `WeeklyMonthlyToggle`
- `BrandTabs`
- `KpiCard`
- `MetricGrid`
- `TrendChart`
- `StatusBadge`
- `ExportButton`
- `SyncStatusChip`
- `ReputationInboxTable`
- `ReplyDraftPanel`

### Página `/marketing/controle`

Seções:

- cabeçalho + filtros
- cards do topo
- grade semanal/mensal no formato do relatório
- gráficos complementares
- alertas
- exportação

### Página `/marketing/funil`

Seções:

- cards executivos
- funil visual
- campanhas
- especialidades
- ocupação x demanda
- exportação

### Página `/marketing/reputacao`

Seções:

- cards executivos
- inbox de itens
- painel lateral com detalhe
- rascunho IA
- ações

## 11. Cálculos e contratos de métricas

### 11.1 `%` da planilha

Sempre documentar a fórmula.

Exemplos:

- quando for atingimento de meta: `% = realizado / meta`
- quando for taxa: usar métrica nativa da fonte
- quando não houver meta: não inventar

### 11.2 CPL

`CPL = investimento / leads válidos`

### 11.3 Melhor post / story

Definir uma única regra.

Sugestão:

- primeiro por interações
- desempate por alcance

### 11.4 Retorno do visitante

Definir se será:

- usuários recorrentes absolutos
- percentual de usuários recorrentes

### 11.5 Desempenho do site

Congelar uma definição.

Sugestão de prioridade:

- score técnico via PageSpeed / CWV
- score interno calculado
- remover do MVP se a definição seguir ambígua

## 12. Estratégia de exportação

### Exportação XLSX

Gerar:

- uma aba resumo
- uma aba grade semanal/mensal
- uma aba de detalhamento por bloco
- uma aba metadados / filtros aplicados

### Exportação PDF

Gerar:

- resumo executivo
- cards principais
- tabela principal
- observações de data e filtros

### Regra

A exportação deve respeitar:

- marca
- período
- filtros ativos

## 13. Fases de implementação para o Codex

### Fase 0 — fundação

Tarefas:

- criar domínio marketing
- criar tabelas de integração e sync
- criar dimensões básicas
- criar estrutura de páginas
- criar camada de filtros globais

Prazo:

- 1 dia útil

### Fase 1 — módulo 1 base obrigatória

Tarefas:

- integrar GA4
- integrar Search Console
- integrar Google Business Profile
- integrar Google Ads / Meta Ads para verba
- integrar e-mail provider
- integrar fonte de leads
- montar `fact_marketing_control_daily`
- montar tela `/marketing/controle`
- montar exportação

Prazo:

- 3 a 4 dias úteis

### Fase 2 — validação do módulo de agenda

Tarefas:

- revisar outputs do módulo 6
- garantir leitura por unidade / especialidade
- expor serviço de ocupação para o módulo 4

Prazo:

- 1 dia útil

### Fase 3 — módulo 4 funil marketing -> agenda -> receita

Tarefas:

- integrar Clinia
- integrar Feegow
- criar regra de atribuição
- montar mart de funil
- montar página `/marketing/funil`
- montar exportação

Prazo:

- 4 a 6 dias úteis

### Fase 4 — reputação

Tarefas:

- integrar reviews do Google
- criar inbox
- criar classificação
- gerar rascunho IA
- publicar resposta, quando suportado
- preparar slot de Reclame Aqui

Prazo:

- 2 a 3 dias úteis para Google
- + 1 a 2 dias úteis para Reclame Aqui com API ativa

### Fase 5 — complementos condicionados

Tarefas:

- Meta orgânico
- Instagram orgânico
- LinkedIn orgânico
- SEMrush técnico
- score de desempenho do site

Prazo:

- 3 a 5 dias úteis

## 14. Critérios de pronto por módulo

### Módulo 1 pronto quando

- painel semanal/mensal estiver funcional
- filtros por marca e período estiverem corretos
- exportações funcionarem
- números de tráfego, verba, e-mail e GBP estiverem auditáveis
- lead e CPL estiverem coerentes com a fonte definida

### Módulo 4 pronto quando

- investimento, leads, agenda e receita estiverem ligados por regra clara
- filtro por unidade/especialidade estiver correto
- funil e tabela por campanha estiverem consistentes
- ocupação entrar como sinal operacional

### Módulo 5 pronto quando

- reviews estiverem listados
- status estiver operacional
- IA gerar rascunho útil
- existir trilha de auditoria da resposta

## 15. Riscos que o Codex não resolve sozinho

- credenciais e permissões
- nomenclatura ruim de campanha
- base de leads sem chave de ligação
- ausência de contrato claro para métricas
- dependência comercial do Reclame Aqui
- dependência de licença do SEMrush
- métricas orgânicas sociais sujeitas a acesso e mudanças da plataforma

## 16. Decisões que devem ser congeladas antes de codar forte

### Congelar agora

- definição oficial de lead
- definição oficial de receita no funil
- regra oficial de “melhor post” e “melhor story”
- definição oficial de “desempenho do site”
- quais blocos do módulo 1 entram na onda 1
- qual é o provedor de e-mail marketing
- se SEMrush será parte oficial do projeto ou não
- se Reclame Aqui já possui plano/API ativa

## 17. Prompt operacional resumido para usar no Codex

Implemente a frente de marketing do Hub Gerencial como um domínio próprio, com adapters por provedor, tabelas raw + marts analíticos, páginas `/marketing/controle`, `/marketing/funil` e `/marketing/reputacao`, mantendo aderência visual ao arquivo “relatorio semanal mkt.xlsx”.

Regras:

1. O módulo `/marketing/controle` deve reproduzir a lógica semanal e mensal do relatório, com filtros por marca e período.
2. O MVP obrigatório inclui GA4, Search Console, Google Business Profile, Ads (verba/custo), e-mail marketing e fonte de leads.
3. Métricas sociais orgânicas e SEMrush devem ser plugáveis e não podem travar a entrega base.
4. O módulo `/marketing/funil` deve cruzar spend -> lead -> agendamento -> receita -> ocupação.
5. O módulo `/marketing/reputacao` deve começar com Google e preparar slot para Reclame Aqui.
6. Toda integração precisa gravar raw payload, `sync_runs` e tabelas normalizadas.
7. Toda exportação deve respeitar filtros ativos.
8. Todo cálculo precisa estar documentado em código e centralizado em services.

## 18. Referências externas de viabilidade técnica

- https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- https://developers.google.com/search/docs/monitor-debug/google-analytics-search-console
- https://developers.google.com/my-business/reference/performance/rest
- https://developers.google.com/my-business/content/review-data
- https://developers.google.com/my-business/content/basic-setup
- https://developers.google.com/google-ads/api/docs/conversions/reporting
- https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference
- https://developers.facebook.com/docs/graph-api/reference/insights/
- https://developers.facebook.com/docs/instagram-platform/insights/
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/share-statistics
- https://developer.semrush.com/api/v3/projects/site-audit/

## 19. Decisões congeladas — `/marketing/funil` V1 (Google-first)

Decisões fechadas para execução imediata:

- escopo V1: `Google Ads + GA4` com entrega de pipeline + página `/marketing/funil`;
- autenticação Google: `OAuth + refresh token`;
- escopo de contas: multi-conta por marca;
- regra de atribuição V1: última origem válida por campanha;
- etapas de agendamento e receita: placeholder explícito no V1 (`Em integração`), sem estimativa artificial;
- execução operacional: atualização manual por botão + sincronização agendada diária.

## 20. Arquitetura operacional V1 do funil

Fluxo definido para o V1:

1. ingestão (`workers`)  
   coleta diária em `Google Ads` e `GA4` por conta/período.
2. normalização  
   padroniza campanha, origem, data e mapeamento de marca/unidade/especialidade.
3. persistência  
   grava tabelas `raw_*` para auditoria e `fact_marketing_funnel_daily` para consumo.
4. serviço de leitura (`/api/admin/marketing/funil/*`)  
   monta cards e tabelas do painel.
5. interface (`/marketing/funil`)  
   renderiza indicadores, ranking de campanhas, filtros e exportações.

Princípios obrigatórios:

- idempotência por chave natural + data;
- upsert no fato diário;
- rastreabilidade por `sync_runs/jobs`;
- heartbeat no `system_status`.

## 21. Pré-requisitos de credenciais (checklist)

Checklist mínimo antes do primeiro sync:

- projeto no Google Cloud com OAuth habilitado;
- `client_id` e `client_secret` válidos;
- `refresh_token` com escopos de Ads e Analytics;
- IDs de conta/property mapeados por marca:
  - Google Ads `customer_id`;
  - GA4 `property_id`;
- permissão de leitura confirmada nas contas;
- validação de conectividade por endpoint de teste.

Sem esses itens, o worker deve:

- registrar erro explícito em `sync_runs/jobs`;
- atualizar heartbeat para `ERROR`;
- não gravar dados parciais silenciosamente.

## 22. Roadmap de execução do módulo `/marketing/funil` (V1)

### Sprint S0 — Setup e conexão (1 dia)

- criar estrutura de configuração de contas por marca;
- registrar contrato de variáveis de ambiente;
- implementar teste de conectividade para Ads e GA4.

### Sprint S1 — Ingestão e mart (2 a 3 dias)

- criar tabelas `raw` de Ads e GA4;
- criar tabela fato `fact_marketing_funnel_daily`;
- implementar worker Google-first com `--once`, `--period`, `--start/--end`;
- incluir idempotência, retry curto e heartbeat.

### Sprint S2 — APIs e UI `/marketing/funil` (2 dias)

- endpoints `summary`, `campaigns`, `jobs/latest`, `refresh`, `export`;
- página com cards de mídia/leads + tabela por campanha + filtros;
- exibir agendamento/receita como `Em integração`.

### Sprint S3 — Hardening operacional (1 dia)

- melhorar observabilidade e mensagens de erro;
- validar backfill por período;
- revisar performance de queries e índices.

## 23. Critérios de aceite do V1 (`/marketing/funil`)

O V1 será considerado pronto quando:

- sincronização diária executar sem duplicação;
- dados de Ads e GA4 estiverem auditáveis em `raw` e no fato diário;
- filtros por período, marca, unidade, canal e campanha funcionarem corretamente;
- tela `/marketing/funil` exibir cards e tabela com dados consistentes;
- placeholders de agendamento/receita estiverem explícitos e sem cálculos fictícios;
- refresh manual + agendado diário funcionarem com heartbeat claro.
