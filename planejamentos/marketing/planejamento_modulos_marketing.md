# Planejamento refinado — Módulos de Marketing do Hub Gerencial Consultare

## Base usada para este refinamento

Este planejamento foi ajustado com base no arquivo **`planejamentos/marketing/relatorio semanal mkt.xlsx`**, que trouxe um detalhe importante: o módulo de marketing não é apenas um painel de SEO/performance, e sim um **cockpit semanal e mensal por marca**.

### O que o arquivo mostrou

A planilha possui três abas com a mesma estrutura:
- **Consultare**
- **Resolve**
- **Franquia**

Em todas, o layout segue a lógica:
- colunas: **semana 1, semana 2, semana 3, semana 4, mensal**
- blocos de indicadores:
  1. KPIs gerais de aquisição
  2. Facebook orgânico
  3. Instagram orgânico
  4. LinkedIn orgânico
  5. E-mail marketing
  6. Google Meu Negócio
  7. Site / SEO / Verbas

## Ajuste estratégico principal

O **Módulo 1** precisa ser renomeado e reposicionado para refletir a planilha real:

> de: **Relatórios de Controle**
>
> para: **Relatórios de Controle de Marketing**

Isso evita um erro de escopo: pela planilha, este módulo não é só SEO nem só analytics. Ele é um consolidado semanal/mensal de marketing com múltiplas fontes.

## Princípios para manter valor sem explodir o escopo

1. **Preservar a estrutura da planilha como visão executiva**
   - o usuário final precisa enxergar o resultado em formato parecido com o relatório semanal já conhecido;
   - no painel, isso pode virar grade semanal + visão mensal consolidada.

2. **Separar MVP obrigatório de blocos condicionados por API/acesso**
   - especialmente em orgânico social e Reclame Aqui.

3. **Trabalhar com normalização de dimensões desde o início**
   - marca
   - unidade
   - especialidade
   - origem / mídia
   - campanha
   - período

4. **Adotar fallback operacional**
   - quando uma API oficial não estiver disponível no começo, permitir ingestão manual/CSV em bloco específico, sem travar o projeto inteiro.

---

# 1. Módulo — Relatórios de Controle de Marketing

## Objetivo refinado

Entregar um **cockpit executivo semanal/mensal** para acompanhamento de marketing por marca, reunindo:

- aquisição
- leads
- custo por lead
- orgânico social
- e-mail marketing
- Google Meu Negócio
- site / SEO
- verbas

## O que entra no escopo

### Bloco A — KPIs principais

Com base na planilha:
- Visitantes do site
- Leads via e-mail
- Custo por lead
- Meta
- Realizado
- %
- visão por semana e consolidado mensal

### Bloco B — Facebook orgânico
- Fãs / seguidores
- Interações
- Curtidas
- Nº de posts
- Cliques
- Comentários
- Compartilhamentos

### Bloco C — Instagram orgânico
- Seguidores
- Nº de stories
- Interações nos stories
- Melhor story
- Alcance dos stories
- Nº de posts
- Interações nos posts
- Melhor post
- Alcance dos posts
- Likes nos posts

### Bloco D — LinkedIn orgânico
- Conexões / seguidores da página
- Interações
- Nº de posts
- Impressões

### Bloco E — E-mail marketing
- Campanhas enviadas
- Enviados
- E-mails entregues
- Taxa de abertura
- Taxa de cliques
- Cancelamentos

### Bloco F — Google Meu Negócio
- Respostas dadas
- Avaliações
- Pesquisa por Google Maps
- Pesquisa no Google
- Visualizações
- Ligaram
- Acessaram o site
- Pediram rota

### Bloco G — Site / SEO / Verbas
- Integridade do site
- Pontuação de autoridade
- Erros
- Total de visitas
- Novos visitantes
- Retorno do visitante
- Tempo médio de visita
- Idade
- Sexo
- Desempenho do site
- Taxa de rejeição
- Melhor horário por dia da semana
- Top 3 páginas mais acessadas
- Verba Google
- Verba Facebook

## Refinamento de fontes de dados

### Fontes principais recomendadas

- **GA4**: sessões, usuários, páginas, engajamento, horários, demografia, comportamento
- **Google Search Console**: queries, páginas, impressões, cliques, CTR e posição média
- **Google Business Profile**: avaliações, respostas e métricas do perfil
- **Google Ads** e **Meta Ads**: verba, cliques, conversões e custo
- **SEMrush**: integridade do site, autoridade e erros técnicos
- **Plataforma de e-mail**: abertura, clique, entregabilidade, cancelamento
- **Meta Graph / Instagram / LinkedIn**: métricas orgânicas sociais
- **CRM / Clinia / captura de leads**: necessário para fechar “Leads via e-mail” e CPL real

## Ajustes de escopo importantes

### Ajuste 1 — SEO não deve depender só de GA4
O bloco “Site / SEO” precisa combinar:
- **GA4**
- **Search Console**
- **SEMrush**

### Ajuste 2 — CPL real exige fonte de lead
A planilha pede **Leads via e-mail** e **Custo por lead**.  
Então, para não gerar número “meia-boca”, esse bloco precisa de uma fonte de lead confiável:
- CRM
- Clinia
- formulário integrado
- ou uma tabela normalizada de conversões/lead capture

### Ajuste 3 — Social orgânico deve ser tratado como subfrente condicionada
O módulo continua comportando Facebook / Instagram / LinkedIn, mas isso deve entrar com a regra:

- **MVP obrigatório**: estrutura pronta no painel + bloco habilitável por fonte
- **Entrega efetiva dos números**: depende de acesso/escopo real das APIs e permissões aprovadas

## O que recomendo como MVP obrigatório

### MVP obrigatório do módulo 1
- estrutura semanal + mensal
- filtro por marca
- filtro por período
- KPIs principais
- verba Google / Meta
- e-mail marketing
- Google Meu Negócio
- site / SEO base
- exportação XLSX / PDF

### MVP condicionado por acesso
- Facebook orgânico
- Instagram orgânico
- LinkedIn orgânico

### MVP condicionado por licenciamento
- integridade do site
- pontuação de autoridade
- erros técnicos via SEMrush

## Interface recomendada

### Visão principal
- filtro por **marca**: Consultare / Resolve / Franquia
- filtro por período
- toggle:
  - **semanal**
  - **mensal**
- grade principal em layout semelhante à planilha
- cards executivos no topo
- exportar em XLSX / PDF

### Visão secundária
- gráficos de tendência por bloco
- comparação com período anterior
- alertas simples:
  - queda de tráfego
  - aumento de CPL
  - queda de abertura de e-mail
  - queda de avaliação / aumento de pendências
  - piora de site health / erros

## Fora do escopo no MVP
- automação de conteúdo
- benchmark competitivo avançado
- BI social avançado por post com biblioteca completa de mídias
- automação de social publishing
- SEO técnico profundo com crawler próprio

## Dependências
- acesso ao GA4
- acesso ao Search Console
- aprovação e acesso do Business Profile API
- acesso ao Google Ads
- acesso ao Meta Ads
- acesso ao provedor de e-mail
- acesso à ferramenta social orgânica, se houver
- acesso/licença do SEMrush, se a intenção for manter “integridade”, “autoridade” e “erros” de forma oficial
- fonte confiável para leads

## Prazo estimado com Codex

### Versão base obrigatória
**10 a 14 dias úteis**

### Complemento social orgânico
**+ 6 a 10 dias úteis**

### Complemento SEO técnico / SEMrush
**+ 3 a 5 dias úteis**

### Prazo total do módulo 1 completo
**16 a 29 dias úteis**

> Recomendação prática: entregar em **2 ondas**  
> **Onda 1:** base obrigatória  
> **Onda 2:** social orgânico + SEMrush

---

# 4. Módulo — Fluxo [Faturamento x CRM x Marketing x Campanhas ADS x Agendas]

## Objetivo refinado

Cruzar marketing, leads, agenda e faturamento para responder:

- quais campanhas geram leads;
- quais leads viram agendamento;
- quais agendamentos viram receita;
- em quais especialidades/unidades o gargalo é marketing;
- em quais o gargalo é capacidade de agenda.

## Escopo refinado

### O que deve entrar no MVP
- investimento por canal / campanha
- impressões
- cliques
- CPC
- conversões / leads
- CPL
- agendamentos gerados
- taxa lead -> agendamento
- comparecimento, se disponível
- receita bruta associada
- leitura de ocupação da agenda vinculada ao resultado

## Fontes recomendadas
- **Google Ads**
- **Meta Ads**
- **Clinia / CRM**
- **Feegow**
- **GA4** como apoio de atribuição e consistência de origem

## Ajustes necessários

### Ajuste 1 — este módulo não deve depender só de Analytics
Para custo e mídia, as fontes primárias devem ser:
- Google Ads
- Meta Ads

### Ajuste 2 — precisa existir chave de ligação entre as pontas
É necessário definir como o lead será ligado a:
- campanha
- origem / mídia
- unidade
- especialidade
- agendamento
- faturamento

### Ajuste 3 — atribuição deve ser simples no MVP
Para não explodir o escopo, usar:
- UTM
- origem / mídia
- campanha
- ou regra de última origem válida

## Interface do painel
- cards executivos
- gráfico funil
- tabela por campanha
- tabela por unidade
- tabela por especialidade
- filtros:
  - período
  - unidade
  - especialidade
  - canal
  - campanha
- exportar XLSX / PDF

## Indicadores recomendados
- investimento
- impressões
- cliques
- CTR
- CPC
- leads
- CPL
- agendamentos
- taxa lead -> agendamento
- receita bruta
- ROAS simples
- taxa de ocupação impactada
- custo por agendamento

## Fora do escopo no MVP
- multi-touch attribution
- atribuição probabilística
- análise avançada por criativo
- análise profunda por keyword
- otimização automática de verba
- bidding automático dentro do Hub

## Dependências
- UTMs minimamente padronizadas
- acesso às contas de Ads
- acesso ao CRM / Clinia
- acesso ao Feegow
- definição de qual evento conta como lead, agendamento e receita

## Prazo estimado com Codex
**12 a 16 dias úteis**

> Se a base de leads estiver desorganizada, considere uma folga de **+ 3 a 5 dias úteis** para saneamento e conciliação.

---

# 5. Módulo — Reputação [Google + Reclame Aqui]

## Objetivo refinado

Criar uma central de reputação e resposta com visão operacional, sem cair no erro de prometer automação total logo de cara.

## Escopo refinado

### O que entra no MVP
- consolidado de reputação
- fila visual de itens
- status do atendimento
- sugestão de resposta por IA
- histórico da resposta
- resposta direta apenas onde a integração permitir com segurança

## Fontes
- **Google Business Profile**
- **Reclame Aqui** (condicionado à existência de plano/API)

## Estratégia recomendada
Começar com:
- **Google primeiro**
- **Reclame Aqui como extensão plugável**

Assim você não trava a entrega caso a API do Reclame Aqui ainda não esteja contratada/liberada.

## Interface recomendada
- cards executivos
- tabela/inbox de avaliações/reclamações
- filtros por status, origem, unidade, período
- painel lateral com detalhe do item
- botão para:
  - gerar resposta com IA
  - copiar resposta
  - responder direto, quando suportado
- exportar XLSX / PDF

## Indicadores recomendados
- nota média
- volume de avaliações
- volume de reclamações
- pendentes sem resposta
- SLA médio
- respostas concluídas
- tendência da reputação no período

## Fora do escopo no MVP
- resposta 100% automática sem aprovação
- automações complexas de escalonamento
- orquestração multicanal completa

## Dependências
- aprovação de acesso ao Business Profile API
- confirmação de plano/API do Reclame Aqui
- política de tom de voz
- política interna de revisão humana

## Prazo estimado com Codex

### Google primeiro
**6 a 8 dias úteis**

### Google + Reclame Aqui com API ativa
**8 a 12 dias úteis**

---

# 6. Módulo — Ocupação das agendas

## Status
**Finalizado — aguardando validação**

## Ajuste recomendado
Transformar este módulo em insumo explícito dos módulos 1 e 4.

### Pequenas melhorias recomendadas
- semáforo por especialidade/unidade
- indicação:
  - ociosa
  - saudável
  - saturada
- insight textual:
  - precisa de mais lead
  - precisa de mais médico
  - precisa redistribuir agenda

## Prazo estimado com Codex
**1 a 3 dias úteis**  
(apenas validação, ajustes finos e hardening)

---

# Ordem recomendada de execução

## Ordem ideal
1. **Módulo 1 — Relatórios de Controle de Marketing**
2. **Módulo 6 — validação final da Ocupação das agendas**
3. **Módulo 4 — Fluxo Faturamento x CRM x Marketing x ADS x Agendas**
4. **Módulo 5 — Reputação**

## Motivo
- o módulo 1 organiza fontes, nomenclaturas e visão executiva;
- o módulo 6 precisa estar confiável antes de cruzar agenda com marketing;
- o módulo 4 depende da camada de dados mais madura;
- o módulo 5 depende mais de acesso externo e política operacional.

---

# Estimativa consolidada

## Cenário recomendado por ondas

### Onda 1
- módulo 1 base obrigatória
- validação módulo 6

**11 a 17 dias úteis**

### Onda 2
- módulo 4

**12 a 16 dias úteis**

### Onda 3
- módulo 5

**6 a 12 dias úteis**

### Extras condicionados
- social orgânico do módulo 1
- SEMrush técnico

**9 a 15 dias úteis**

## Total consolidado do roadmap
**29 a 60 dias úteis**, dependendo de:
- acessos
- qualidade das bases
- necessidade real de social orgânico no MVP
- ativação de SEMrush
- ativação do Reclame Aqui

---

# Recomendação executiva final

A melhor estratégia é:

1. **não tentar entregar tudo do Excel em uma única tacada;**
2. entregar primeiro o **núcleo executivo confiável**;
3. deixar os blocos mais sujeitos a API/permissão como **subfrentes plugáveis**;
4. usar o Excel como **contrato visual do produto**, mas não como obrigação de implantar todas as integrações de uma vez.

Assim você preserva:
- aderência ao que o cliente já conhece;
- velocidade de entrega;
- confiabilidade dos números;
- flexibilidade para crescer depois sem retrabalho estrutural.

---

# Referências externas de viabilidade técnica

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
