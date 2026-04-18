# Status dos modulos de Marketing - 2026-03-30

## Documentos analisados
- `planejamentos/marketing/blueprint_operacional_modulos_marketing.md`
- `planejamentos/marketing/planejamento_modulos_marketing.md`
- `planejamentos/marketing/PROGRESS_MARKETING_FUNIL_2026-03-20.md`

## Resumo executivo
Hoje o dominio de Marketing do painel nao foi implementado por completo conforme o blueprint original. O que existe em producao e o modulo **`/marketing/funil`**, ja bem mais evoluido do que o V1 Google-first inicial, com integracao de **Google Ads + GA4 + Clinia Ads + Feegow + faturamento**, abas de navegacao, diagnosticos do Google Ads e tooltips explicativos.

Os demais modulos previstos no planejamento macro ainda **nao foram iniciados como paginas proprias**:
- `/marketing/controle`
- `/marketing/reputacao`
- `/marketing/configuracoes`

## Status por modulo
| Modulo planejado | Status atual | Observacao |
|---|---|---|
| `/marketing/funil` | Implementado e em operacao | Escopo atual acima do V1 original, com Clinia Ads, funil recalibrado, aba de saude do Google Ads e diagnostico por origem/campanha |
| `/marketing/controle` | Nao iniciado | Nao existe pagina, API nem worker dedicados para o cockpit semanal/mensal multi-fonte baseado na planilha |
| `/marketing/reputacao` | Nao iniciado | Nao existe pagina, fila operacional nem integracao ativa com Google/Reclame Aqui |
| `/marketing/configuracoes` | Nao iniciado como modulo proprio | Existe a pagina geral `/settings`, mas nao uma area especifica de integracoes/regras de marketing |

## O que esta implementado hoje em `/marketing/funil`
### Pagina e UX
- rota ativa: `/marketing/funil`
- abas:
  - `Visao geral`
  - `Campanhas`
  - `Saude Google Ads`
- filtros globais por:
  - marca
  - periodo ou intervalo customizado
  - campanha
  - origem
  - midia
  - grupo de canal
- drawer de campanha com tabs de:
  - dispositivos
  - landing pages
  - diagnostico

### Fontes e workers em uso
- `workers/worker_marketing_funnel_google.py`
- `workers/worker_clinia_ads.py`
- `workers/main.py` com agendas para `marketing_funnel` e `clinia_ads`

### Camadas de dados ja presentes
- `raw_google_ads_campaign_daily`
- `raw_ga4_campaign_daily`
- `fact_marketing_funnel_daily`
- `fact_marketing_funnel_daily_device`
- `fact_marketing_funnel_daily_landing_page`
- `fact_marketing_funnel_daily_channel`
- `raw_clinia_ads_contacts`
- `fact_clinia_ads_daily`

### APIs ja implementadas
- `GET /api/admin/marketing/funil/summary`
- `GET /api/admin/marketing/funil/campaigns`
- `GET /api/admin/marketing/funil/campaigns/[campaignKey]/devices`
- `GET /api/admin/marketing/funil/campaigns/[campaignKey]/landing-pages`
- `GET /api/admin/marketing/funil/channels`
- `GET /api/admin/marketing/funil/filter-options`
- `GET /api/admin/marketing/funil/google-ads/health`
- `GET /api/admin/marketing/funil/clinia-ads/ads`
- `GET /api/admin/marketing/funil/clinia-ads/origins`
- `GET /api/admin/marketing/funil/jobs/latest`
- `GET /api/admin/marketing/funil/source-status`
- `POST /api/admin/marketing/funil/refresh`

## Regra operacional atual do funil
### Diagnostico de intencao
- `Cliques em WhatsApp` continuam existindo como indicador de intencao no site.

### Leitura principal do funil
A leitura principal foi recalibrada e hoje prioriza a camada atribuida ao Google:
1. `Investimento Google Ads`
2. `Novos contatos Clinia (Google)`
3. `Agendamentos Clinia (Google)`

### Contexto complementar
Continuam visiveis como contexto e diagnostico:
- `Cliques em WhatsApp`
- `Google nao mapeado`
- `Agendamentos validos`
- `Faturamento`

## O que do planejamento original ainda nao foi implementado
### Dentro do dominio Marketing como um todo
- cockpit semanal/mensal de `Relatorios de Controle de Marketing`
- consolidacao multi-fonte de:
  - Facebook organico
  - Instagram organico
  - LinkedIn organico
  - e-mail marketing
  - Google Meu Negocio
  - SEO/Search Console/SEMrush em uma visao executiva unica
- modulo de `Reputacao`
- modulo de `Configuracoes` especifico de marketing

### Dentro do proprio `/marketing/funil`
Itens previstos em versoes anteriores do plano que ainda nao estao entregues:
- exportacao XLSX/PDF do modulo
- endpoints de especialidades e capacidade (`specialties`, `capacity`)
- cruzamento mais robusto entre campanha -> agendamento valido -> receita atribuida
- visualizacao explicita de cobertura historica/indisponibilidade em todos os blocos
- limpeza definitiva dos vestigios antigos de CRM/CRC no namespace `marketing/funil`

## Observacoes importantes para retomada
- `planejamentos/marketing/PROGRESS_MARKETING_FUNIL_2026-03-20.md` esta desatualizado e representa um estado intermediario anterior as entregas de Clinia Ads, recalibracao do funil e aba `Saude Google Ads`.
- O documento principal mais confiavel do modulo ativo hoje e `frontend/docs/09-plano-tecnico-marketing-funil.md`.
- O namespace `frontend/src/app/api/admin/marketing/funil/crm/` ainda existe como sobra estrutural, mas nao representa a frente ativa atual do modulo.

## Proximos passos recomendados
### Se a proxima frente continuar em Marketing/Funil
1. Implementar exportacao do modulo (`XLSX` e, se necessario, `PDF`).
2. Decidir se a proxima etapa sera `specialties/capacity` ou atribuicao de receita/agendamento por campanha.
3. Remover ou arquivar de vez os residuos antigos de CRM no namespace do funil.

### Se a proxima frente retomar o roadmap macro de Marketing
1. Priorizar `/marketing/controle` como proximo modulo, porque ele concentra a maior lacuna entre o plano e o produto real.
2. Deixar `/marketing/reputacao` para a sequencia.
3. So depois abrir uma `/marketing/configuracoes` dedicada, se as integracoes exigirem autonomia operacional maior no painel.


## Backlog priorizado
### P0 - Fechar o que ja existe em `/marketing/funil`
1. Exportacao do modulo (`XLSX` e, se fizer sentido, `PDF`).
2. Remocao ou arquivamento dos residuos antigos de CRM no namespace `marketing/funil`.
3. Sinalizacao explicita de cobertura historica/indisponibilidade na UI.

### P1 - Evolucao analitica do funil
1. Endpoints e visoes de `specialties/capacity`.
2. Melhor atribuicao de campanha -> agendamento valido -> receita.
3. Melhor tratamento de campanhas Google nao mapeadas no Clinia Ads.

### P2 - Proximo modulo do roadmap macro
1. `/marketing/controle`
2. `/marketing/reputacao`
3. `/marketing/configuracoes`

## Recomendacao objetiva de proxima implementacao
### Recomendacao principal
A proxima frente mais inteligente e **terminar o `/marketing/funil` antes de abrir `/marketing/controle`**.

### Motivo
- o funil ja esta em producao e qualquer ganho nele vira valor imediato para a gestao;
- ainda existem lacunas importantes que afetam confianca e usabilidade, principalmente exportacao, limpeza tecnica e atribuicao melhor de resultado;
- abrir `/marketing/controle` agora criaria mais uma frente grande antes de estabilizar o unico modulo de Marketing ja ativo.

### Ordem sugerida
1. Fechar P0 do `/marketing/funil`.
2. Escolher um item de P1 do `/marketing/funil`.
3. So depois iniciar `/marketing/controle` como novo modulo.

### Quando faria sentido inverter e ir direto para `/marketing/controle`
Eu so inverteria a ordem se a necessidade mais urgente da gestora for o cockpit semanal/mensal da planilha para acompanhamento executivo, acima da profundidade do funil.
Nesse cenario, a ordem seria:
1. `/marketing/controle` em MVP enxuto
2. depois voltar para finalizar o `/marketing/funil`

## Atualizacao complementar - 30/03/2026 - modulo /marketing/controle

Desde a consolidacao inicial deste documento, o modulo `/marketing/controle` foi implementado em MVP.

Estado atual do modulo:

- rota: `/marketing/controle`
- page key: `marketing_controle`
- filtros por `Marca` e `Mes`
- cards executivos no topo
- grade semanal/mensal com `Semana 1..4` e `Mensal`
- exportacao `XLSX`
- refresh manual reutilizando a camada Google ja existente
- blocos nao integrados exibidos como `Em planejamento`

Com isso, a recomendacao de proxima frente de Marketing passa a ser:

1. `/marketing/reputacao`
2. evolucao do `/marketing/controle` com metas e canais organicos
3. `/marketing/configuracoes`
