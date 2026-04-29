# Plano de Refatoracao - Painel Executivo com IA

## 1. Objetivo deste documento

Este documento consolida o plano de refatoracao da pagina de **Visao Geral** do painel para transforma-la em um novo **Painel Executivo** da Consultare.

A proposta e sair de uma tela predominantemente operacional e evoluir para uma visao consolidada de negocio, capaz de:

- mostrar os principais indicadores da operacao em um unico lugar;
- destacar automaticamente os pontos mais criticos;
- comparar desempenho do dia, da semana e do mes;
- apoiar diretor, gestora e lideres de area na priorizacao;
- gerar leitura executiva com IA;
- permitir exportacao em PDF da mesma visao.

Este plano deve servir como referencia para produto, design, backend, frontend, dados, permissoes, IA e exportacao.

---

## 2. Contexto atual

Hoje o dashboard principal do painel em `apps/painel/src/app/(admin)/dashboard/page.tsx` funciona como um agregado operacional em tempo real.

Ele ja consolida partes importantes como:

- fila medica;
- fila de recepcao;
- demanda de WhatsApp;
- faturamento do dia e do mes;
- metas de faturamento;
- status de sincronizacao e refresh manual.

Ao mesmo tempo, o repositorio ja possui outras pecas relevantes para uma evolucao executiva:

- painel de metas com visao executiva em `apps/painel/src/app/(admin)/metas/dashboard`;
- exportacao em PDF e XLSX do painel de metas;
- endpoints-resumo em modulos como propostas, colaboradores, recrutamento, QMS, vigilancia sanitaria, produtividade e marketing;
- modelo de permissoes por pagina e refresh;
- dados de usuarios com `role`, `department` e matriz de permissao;
- estrutura de `system_status` para heartbeat e status de processos.

O pedido do dono da Consultare muda a natureza da tela principal:

- ela deve continuar mostrando os indicadores-chave;
- mas precisa virar uma visao de gestao consolidada;
- com leitura priorizada por criticidade;
- com recomendacoes de acao;
- e com diagnostico operacional gerado por IA.

---

## 3. Visao de produto

O novo dashboard deve ser o **Painel Executivo** da Consultare.

Ele deve funcionar como um "gerente de negocios" digital para a lideranca, organizando a informacao de forma objetiva e priorizada.

Na pratica, a tela deve responder perguntas como:

- o que esta mais critico agora;
- quais metas estao com pior projecao;
- quais areas exigem acao imediata;
- onde a operacao esta melhorando ou piorando;
- quais planos de acao fazem mais sentido no curto prazo.

O foco principal e atender:

- diretor;
- gestora;
- lideres de area.

Os lideres nao devem ver tudo. Eles devem ver apenas:

- as areas pelas quais respondem;
- as unidades que lhes competem;
- os times ou recortes de sua responsabilidade.

---

## 4. Decisoes travadas para a V1

As decisoes abaixo ficam definidas como base da primeira versao:

- a pagina principal sera a nova visao executiva em `/dashboard`;
- a V1 cobrira 5 areas-chave:
  - Financeiro
  - Comercial
  - Operacao e Atendimento
  - Pessoas
  - Qualidade
- a camada de IA usara a **API da OpenAI**;
- a geracao da IA sera baseada em **snapshot persistido + refresh manual**;
- o PDF deve exportar exatamente o mesmo snapshot exibido ao usuario;
- a IA nao vai consultar banco nem APIs diretamente;
- a IA recebera apenas um payload consolidado e normalizado pelo backend;
- o escopo dos lideres sera controlado por **mapa explicito por usuario**, e nao apenas por permissao de pagina.

---

## 5. Principios da refatoracao

## 5.1 Consolidacao antes de volume

O novo painel nao deve tentar mostrar tudo que existe no sistema.

Ele deve:

- consolidar;
- sintetizar;
- ordenar por relevancia;
- esconder ruido;
- destacar o que pede decisao.

## 5.2 IA em cima de dado estruturado

A IA nao sera responsavel por descobrir os dados da operacao.

Ela sera responsavel por:

- interpretar os indicadores consolidados;
- apontar criticidade;
- sugerir prioridades;
- propor planos de acao;
- redigir o diagnostico executivo.

## 5.3 Escopo e confidencialidade primeiro

Como a tela sera executiva, ela precisa respeitar com rigor:

- area;
- unidade;
- time;
- permissao;
- nivel de acesso.

Nenhum usuario deve receber diagnostico, resumo ou PDF com dados fora do seu escopo.

## 5.4 Snapshot como fonte oficial

Para evitar inconsistencias entre tela, PDF e IA:

- a visao executiva deve nascer de um snapshot consolidado;
- o PDF deve ser gerado a partir do snapshot;
- o resumo da IA deve ser persistido junto do snapshot;
- o refresh manual gera um novo snapshot.

---

## 6. Estrutura funcional do novo painel

O novo `/dashboard` deve ser reorganizado em 3 camadas principais.

## 6.1 Camada 1 - Resumo executivo com IA

Bloco superior com leitura pronta para decisao.

Esse bloco deve trazer:

- status geral da operacao;
- diagnostico executivo resumido;
- principais prioridades do momento;
- riscos mais relevantes;
- oportunidades percebidas;
- planos de acao recomendados;
- observacoes sobre lacunas de dados, quando existirem.

## 6.2 Camada 2 - Blocos executivos por area

Abaixo do resumo, a tela deve exibir os 5 blocos principais:

- Financeiro;
- Comercial;
- Operacao e Atendimento;
- Pessoas;
- Qualidade.

Cada bloco deve mostrar:

- indicadores essenciais;
- comparativo dia / semana / mes;
- meta atual;
- projecao;
- status consolidado;
- tendencia;
- ultimo dado disponivel.

## 6.3 Camada 3 - Operacao ao vivo

O dashboard atual possui leitura operacional importante e ela nao deve se perder.

Por isso, a V1 deve manter uma secao secundaria, ou aba especifica, com a operacao ao vivo:

- fila medica;
- fila recepcao;
- WhatsApp;
- sinais de espera critica;
- heartbeat de servicos relevantes.

Essa camada continua importante, mas deixa de ser o centro da experiencia.

---

## 7. Fontes e dominios da V1

O novo painel deve se apoiar principalmente em dados ja existentes no projeto.

## 7.1 Financeiro

Fontes principais:

- `api/admin/financial/history`
- `api/admin/goals/dashboard`
- estruturas atuais de faturamento diario, mensal e por unidade

Leituras esperadas:

- faturamento hoje;
- faturamento semana;
- faturamento mes;
- meta atual;
- projecao;
- status por unidade quando relevante;
- risco de nao atingimento.

## 7.2 Comercial

Fontes principais:

- `api/admin/propostas`
- metas aplicaveis no painel de metas

Leituras esperadas:

- volume e valor de propostas;
- ganho, rejeicao e aprovacao;
- propostas em aberto;
- gargalos comerciais;
- comparativo dia / semana / mes;
- metas em risco.

## 7.3 Operacao e Atendimento

Fontes principais:

- dashboard atual
- `api/admin/produtividade`
- filas operacionais atuais
- possiveis metas ligadas a agendamento, atendimento e ocupacao

Leituras esperadas:

- filas atuais;
- ocupacao;
- confirmacao;
- produtividade;
- sinais de espera critica;
- gargalos do momento.

## 7.4 Pessoas

Fontes principais:

- `api/admin/colaboradores/dashboard`
- `api/admin/recrutamento`

Leituras esperadas:

- indicadores de quadro;
- movimentacoes e gaps;
- pendencias relevantes;
- contratacao e pipeline de recrutamento;
- riscos de capacidade operacional.

## 7.5 Qualidade

Fontes principais:

- `api/admin/qms/indicadores`
- `api/admin/vigilancia-sanitaria/summary`

Leituras esperadas:

- pendencias de qualidade;
- status documental;
- treinamento;
- auditoria;
- riscos regulatorios;
- itens que exigem priorizacao.

---

## 8. Escopo executivo por usuario

O modelo atual de permissao por pagina nao e suficiente para essa tela.

Sera necessario criar uma camada complementar de **escopo executivo**.

## 8.1 Objetivo

Definir com precisao o que cada usuario pode enxergar dentro do painel executivo.

## 8.2 Estrutura proposta

Persistir uma configuracao por usuario contendo:

- `user_id`
- `areas`
- `departments`
- `teams`
- `units`

## 8.3 Comportamento esperado

- diretor e gestora podem ter escopo amplo;
- lider de area ve apenas o recorte que lhe compete;
- areas nao autorizadas nao aparecem na tela;
- dados fora do escopo nao entram no payload consolidado;
- a IA nao recebe dados fora do escopo;
- o PDF nao exporta dados fora do escopo.

## 8.4 Regra de aplicacao

O escopo deve ser aplicado em duas camadas:

1. na composicao da tela e dos blocos exibidos;
2. no filtro dos dados que alimentam agregado, IA e export.

---

## 9. Arquitetura de dados executivos

Para evitar acoplamento entre frontend e multiplos endpoints dispersos, a V1 deve criar um agregador server-side proprio.

## 9.1 Novo agregador executivo

Criar uma camada de agregacao que:

- leia os dados dos modulos existentes;
- normalize a resposta;
- consolide indicadores por area;
- aplique escopo do usuario;
- prepare o payload da IA;
- prepare o payload do PDF.

Esse agregador nao deve depender de `fetch` HTTP interno. O ideal e reutilizar repositores e funcoes server-side diretamente.

## 9.2 Envelope padrao de indicadores

Cada indicador executivo deve seguir um formato consistente, por exemplo:

- area identificada;
- chave do indicador;
- label amigavel;
- valor atual;
- valor do dia;
- valor da semana;
- valor do mes;
- meta;
- projecao;
- status;
- tendencia;
- origem e momento da ultima atualizacao;
- escopo aplicado.

## 9.3 Snapshot persistido

Criar persistencia do snapshot executivo com campos equivalentes a:

- identificador;
- usuario ou origem da geracao;
- hash do escopo;
- `metrics_json`;
- `ai_summary_json`;
- status;
- timestamps de criacao e conclusao;
- erro, quando houver.

O snapshot passa a ser a fonte oficial da tela executiva.

---

## 10. Camada de IA com OpenAI

## 10.1 Papel da IA

A IA deve agir como uma camada interpretativa, e nao como fonte de verdade operacional.

Ela deve:

- ler os indicadores consolidados;
- detectar o que e mais critico;
- comparar comportamento de curto prazo;
- identificar metas com projecao ruim;
- propor prioridades;
- sugerir planos de acao;
- redigir diagnostico por area e diagnostico geral.

## 10.2 API recomendada

Usar a **Responses API** da OpenAI com **Structured Outputs**.

Motivos:

- facilita contrato estruturado;
- reduz ambiguidade da resposta;
- melhora consistencia para tela e PDF;
- permite tratar falhas de schema com seguranca.

## 10.3 Modelo recomendado

Planejar a V1 com o modelo atual de raciocinio da familia GPT-5 como default, usando `gpt-5.5` como referencia principal de projeto.

## 10.4 Contrato estruturado da resposta

A resposta da IA deve ser validada por schema e conter, no minimo:

- `overall_status`
- `executive_summary`
- `top_priorities`
- `area_diagnoses`
- `action_plans`
- `risks`
- `opportunities`
- `data_gaps`

Cada item deve carregar:

- area relacionada, quando houver;
- severidade;
- justificativa baseada nos indicadores;
- horizonte de acao, quando aplicavel.

## 10.5 Regras do prompt

O prompt da IA deve instruir claramente que ela:

- nao pode inventar dados;
- deve distinguir fato de recomendacao;
- deve priorizar criticidade real;
- deve considerar dia, semana e mes;
- deve observar meta e projecao;
- deve adaptar a narrativa ao escopo visivel do usuario;
- deve apontar lacunas quando o dado nao for suficiente.

## 10.6 Comportamento em falha

Se a OpenAI falhar:

- a tela continua exibindo os blocos quantitativos;
- o snapshot pode ser salvo como parcial ou falho, conforme politica definida na implementacao;
- o usuario deve ver que o resumo de IA esta temporariamente indisponivel;
- o PDF nao deve inventar um resumo ausente.

---

## 11. Endpoints e contratos novos

Para suportar a V1, o plano deve incluir novos endpoints do painel executivo.

## 11.1 Leitura do dashboard executivo

`GET /api/admin/dashboard/executive`

Responsabilidade:

- retornar o snapshot executivo mais recente e valido para o escopo do usuario.

## 11.2 Refresh do dashboard executivo

`POST /api/admin/dashboard/executive/refresh`

Responsabilidade:

- gerar novo snapshot executivo;
- consolidar dados;
- executar IA;
- registrar status em `system_status`.

## 11.3 Exportacao PDF

`GET /api/admin/dashboard/executive/export?snapshotId=...`

Responsabilidade:

- exportar o PDF a partir do snapshot persistido;
- manter consistencia entre tela e arquivo.

## 11.4 Gestao de escopo executivo

`GET /PATCH /api/admin/users/executive-scope`

Responsabilidade:

- ler;
- atualizar;
- validar escopo executivo por usuario.

---

## 12. Permissoes e integracao com o modelo atual

## 12.1 Visualizacao

A nova tela continua ligada a `dashboard`.

Ou seja:

- quem nao tem `dashboard.view` nao acessa o painel executivo;
- nao e necessario criar uma nova pagina de permissao para a V1, salvo se isso for desejado em refinamento posterior.

## 12.2 Refresh

O refresh do painel executivo deve ser mapeado ao contexto de `dashboard`.

Tambem deve seguir o padrao do projeto:

- registrar `PENDING`, `RUNNING`, `COMPLETED` ou erro;
- expor heartbeat e ultima execucao;
- invalidar cache quando necessario.

## 12.3 Edicao de escopo

A edicao do escopo executivo deve ficar disponivel na gestao de usuarios, junto do contexto administrativo de permissoes.

---

## 13. Direcao de interface

O PDF de referencia apresentado pelo dono da Consultare mostra uma direcao clara:

- visual mais executivo;
- blocos por area;
- leitura compacta;
- pouca poluicao;
- hierarquia forte;
- foco em status, variacao, meta e prioridade.

A nova tela deve se inspirar nisso sem copiar literalmente.

Elementos esperados:

- titulo e data de referencia;
- indicacao clara do escopo em uso;
- ultimo snapshot gerado;
- botao de atualizar;
- botao de exportar PDF;
- bloco principal de diagnostico IA;
- cards executivos por area;
- sessao secundaria de operacao ao vivo.

---

## 14. Exportacao em PDF

O projeto ja possui uso de `pdf-lib` em outras areas e isso deve ser reaproveitado.

## 14.1 Principio

O PDF deve ser uma extensao fiel da tela executiva, e nao um relatorio diferente.

## 14.2 Estrutura recomendada

Ordem sugerida do PDF:

1. cabecalho com data, usuario e escopo;
2. resumo executivo com IA;
3. prioridades principais;
4. blocos por area;
5. riscos, oportunidades e observacoes finais.

## 14.3 Fonte dos dados

O PDF deve usar exclusivamente o snapshot persistido selecionado.

Isso evita:

- divergencia entre tela e arquivo;
- mudanca de numero durante a geracao;
- resumo IA inconsistente.

---

## 15. Testes e criterios de aceitacao

## 15.1 Escopo e permissao

- diretor ve os 5 blocos quando tiver escopo amplo;
- lider ve apenas o recorte configurado;
- usuario sem `dashboard.view` nao acessa;
- areas fora do escopo nao aparecem nem no payload nem no PDF.

## 15.2 Snapshot e consistencia

- refresh manual cria novo snapshot;
- a tela le o ultimo snapshot valido;
- o PDF usa o snapshot informado;
- refresh posterior nao altera export antigo.

## 15.3 IA

- resposta deve obedecer ao schema estruturado;
- falha de schema nao publica resumo invalido;
- dados ausentes entram como lacuna;
- a IA nao cria recomendacao sobre fatos inexistentes.

## 15.4 Experiencia

- a tela continua util mesmo quando a IA estiver indisponivel;
- operacao ao vivo permanece acessivel;
- a leitura executiva fica mais objetiva que o dashboard atual;
- o tempo de abertura da tela nao deve depender de executar IA em tempo real.

---

## 16. Plano de entrega recomendado

## Fase 1 - Fundacao executiva

- criar agregador executivo;
- definir tipos e contratos;
- criar modelo de escopo executivo;
- criar persistencia de snapshot;
- montar nova tela base.

## Fase 2 - IA e priorizacao

- integrar OpenAI via Responses API;
- validar structured output;
- gerar resumo executivo;
- ligar prioridades, riscos e planos de acao ao snapshot.

## Fase 3 - PDF e refinamento

- gerar exportacao PDF a partir do snapshot;
- ajustar layout executivo;
- melhorar leitura por perfil;
- estabilizar estados de erro e loading.

---

## 17. Resultado esperado

Ao final da refatoracao, a Consultare deve ter no dashboard principal:

- uma visao consolidada do negocio;
- uma leitura clara do que exige atencao imediata;
- comparativo de desempenho do dia, da semana e do mes;
- diagnostico operacional por IA;
- sugestoes de acao para metas e areas com pior projecao;
- experiencia adequada para diretor, gestora e lideres;
- exportacao em PDF coerente com a tela.

Em resumo, o painel deixa de ser apenas um monitor operacional e passa a ser um instrumento real de gestao executiva.
