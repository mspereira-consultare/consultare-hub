# Plano Tecnico - Marketing / Controle

## Objetivo

O modulo `/marketing/controle` entrega um cockpit executivo mensal por marca, inspirado na planilha operacional de marketing, mas sustentado apenas por fontes ja integradas no projeto.

No MVP atual, o modulo e read-only e consolida:

- Google Ads + GA4 via `fact_marketing_funnel_daily`
- Clinia Ads (origem Google) via `fact_clinia_ads_daily`
- heartbeat operacional via `system_status`

## Escopo do MVP

- rota: `/marketing/controle`
- page key: `marketing_controle`
- filtros:
  - `Marca`
  - `Mes`
- marcas suportadas:
  - `Consultare`
  - `Resolve`
- exportacao:
  - `XLSX`
- atualizacao manual:
  - aciona apenas a camada Google, reaproveitando o fluxo de `marketing_funnel`

## Leitura semanal e mensal

Buckets fixos do mes:

- `Semana 1`: dias `1-7`
- `Semana 2`: dias `8-14`
- `Semana 3`: dias `15-21`
- `Semana 4`: dias `22-fim do mes`
- `Mensal`: consolidado completo do mes

## Blocos com dados reais

### KPIs principais

- `Visitantes do site` = `SUM(total_users)`
- `Cliques em WhatsApp` = `SUM(leads)`
- `Novos contatos Clinia (Google)` = `SUM(new_contacts_received)` com `origin='google'`
- `Agendamentos Clinia (Google)` = `SUM(appointments_converted)` com `origin='google'`
- `Investimento Google Ads` = `SUM(spend)`
- `Custo por novo contato` = `spend / new_contacts_received`
- `Custo por agendamento` = `spend / appointments_converted`

### Google Ads

- `Impressoes` = `SUM(impressions)`
- `Cliques` = `SUM(clicks)`
- `CTR` = `SUM(clicks) / SUM(impressions)`
- `CPC medio` = `SUM(spend) / SUM(clicks)`
- `Conversoes` = `SUM(conversions)`
- `Valor de conversao` = `SUM(conversions_value)`
- `Valor conv. / custo` = `SUM(conversions_value) / SUM(spend)`

### Site / GA4

- `Usuarios` = `SUM(total_users)`
- `Novos usuarios` = `SUM(new_users)`
- `Sessoes` = `SUM(sessions)`
- `Sessoes engajadas` = `SUM(engaged_sessions)`
- `Taxa de engajamento` = `SUM(engaged_sessions) / SUM(sessions)`
- `Duracao media` = media ponderada por `sessions`
- `Page views` = `SUM(page_views)`

## Blocos em planejamento

No MVP, os blocos abaixo aparecem apenas como placeholder visual, sem dados inventados:

- `Facebook organico`
- `Instagram organico`
- `LinkedIn organico`
- `E-mail marketing`
- `Google Meu Negocio`
- `SEO tecnico / SEMrush`

## APIs do modulo

- `GET /api/admin/marketing/controle/summary`
- `GET /api/admin/marketing/controle/grid`
- `GET /api/admin/marketing/controle/source-status`
- `POST /api/admin/marketing/controle/refresh`
- `GET /api/admin/marketing/controle/export`

## Permissoes

- `ADMIN`: `view` + `refresh`
- `GESTOR`: `view` + `refresh`
- `OPERADOR`: sem acesso

## Observacoes tecnicas

- o modulo nao cria worker novo;
- o refresh manual reaproveita `marketing_funnel_jobs`;
- Clinia Ads continua sincronizado por schedule;
- `Resolve` pode aparecer sem dados e deve manter estado vazio consistente;
- o MVP nao replica `Meta / Realizado / %` da planilha original.
