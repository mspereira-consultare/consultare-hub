# Progresso — Marketing/Funil — 2026-03-20

## Contexto
Esta anotação salva o estado atual da implementação do plano:

- filtros guiados com opções reais do banco
- integração de agendamentos no `summary`
- integração de faturamento no `summary`
- troca de placeholders do frontend por dados reais agregados

## Estado atual
Implementação **em andamento**, ainda **não validada com `tsc`** e ainda **não testada no navegador**.

### Backend já alterado
- `frontend/src/lib/marketing_funil/repository.ts`
  - adicionados tipos/constantes para filtros e status válidos de agendamento
  - novo helper `quoteIdentifier(...)`
  - novo builder `buildFactWhere(...)`
  - `buildMainWhere(...)` agora delega para `buildFactWhere(...)`
  - novo `listDistinctFactOptions(...)`
  - novo `getMarketingFunilAppointmentsSummary(...)`
  - novo `getMarketingFunilRevenueSummary(...)`
  - `getMarketingFunnelSummary(...)` começou a retornar:
    - `appointments`
    - `revenue`
  - `listMarketingFunnelChannels(...)` foi mudado para ler de `fact_marketing_funnel_daily` e respeitar filtros principais
  - novo `listMarketingFunnelFilterOptions(...)`
- `frontend/src/app/api/admin/marketing/funil/channels/route.ts`
  - agora parseia também `source` e `medium`
- `frontend/src/app/api/admin/marketing/funil/filter-options/route.ts`
  - nova rota criada

### Frontend já alterado
- `frontend/src/app/(admin)/marketing/funil/components/types.ts`
  - `MarketingFunilSummary` expandido com:
    - `appointments`
    - `revenue`
  - novo tipo `MarketingFunilFilterOptions`
- `frontend/src/app/(admin)/marketing/funil/components/MarketingFunilSearchableSelect.tsx`
  - novo componente criado
- `frontend/src/app/(admin)/marketing/funil/components/MarketingFunilKpis.tsx`
  - começou a incluir cards reais de:
    - `Agendamentos`
    - `Faturamento`
- `frontend/src/app/(admin)/marketing/funil/components/MarketingFunilFunnelVisual.tsx`
  - placeholders de `Agendamentos` e `Faturamento` começaram a ser substituídos por dados reais
- `frontend/src/app/(admin)/marketing/funil/components/MarketingFunilCampaignTable.tsx`
  - header `Source / Medium` trocado para `Origem / Mídia`
- `frontend/src/app/(admin)/marketing/funil/components/MarketingFunilCampaignDrawer.tsx`
  - header `Source / Medium` trocado para `Origem / Mídia`
- `frontend/src/app/(admin)/marketing/funil/page.tsx`
  - estado novo para `filterOptions`
  - novo `loadFilterOptions()`
  - novo `applyAdvancedFilter(...)`
  - filtros avançados começaram a ser trocados para `MarketingFunilSearchableSelect`
  - descrição do topo e bloco final começaram a ser atualizados

## Arquivos com mudanças locais neste momento
- `frontend/src/app/(admin)/marketing/funil/components/MarketingFunilCampaignDrawer.tsx`
- `frontend/src/app/(admin)/marketing/funil/components/MarketingFunilCampaignTable.tsx`
- `frontend/src/app/(admin)/marketing/funil/components/MarketingFunilFunnelVisual.tsx`
- `frontend/src/app/(admin)/marketing/funil/components/MarketingFunilKpis.tsx`
- `frontend/src/app/(admin)/marketing/funil/components/types.ts`
- `frontend/src/app/(admin)/marketing/funil/page.tsx`
- `frontend/src/app/api/admin/marketing/funil/channels/route.ts`
- `frontend/src/lib/marketing_funil/repository.ts`
- `frontend/src/app/(admin)/marketing/funil/components/MarketingFunilSearchableSelect.tsx`
- `frontend/src/app/api/admin/marketing/funil/filter-options/route.ts`

## Próximos passos ao retomar
1. Revisar `frontend/src/app/(admin)/marketing/funil/page.tsx` para concluir a substituição completa dos filtros avançados e conferir textos/acentuação.
2. Revisar `frontend/src/lib/marketing_funil/repository.ts` para confirmar:
   - `appointments` com `scheduled_at`
   - status válidos `1,2,3,4,7`
   - `revenue` com `data_de_referência`
3. Confirmar o contrato final de `GET /api/admin/marketing/funil/summary`.
4. Confirmar o contrato final de `GET /api/admin/marketing/funil/filter-options`.
5. Rodar:
   - `.\frontend\node_modules\.bin\tsc -p .\frontend\tsconfig.json --noEmit`
6. Se o `tsc` passar, subir o app e validar no navegador:
   - filtros pesquisáveis
   - cards de agendamento/faturamento
   - funil visual
   - tabela de campanhas
   - rota `filter-options`

## Observações importantes
- A ideia adotada para `agendamentos` é usar **agregado do período**, sem atribuição por campanha nesta etapa.
- A ideia adotada para `faturamento` é usar **`data_de_referência`**, não `data_do_pagamento`.
- `CRM` continua restrito ao board `CRC`.
- Esta anotação foi criada para facilitar a retomada depois do desligamento do computador.
