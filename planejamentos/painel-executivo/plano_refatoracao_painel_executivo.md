# Plano de Refatoracao - Painel Executivo com IA

## 1. Objetivo deste documento

Este documento consolida o plano de refatoracao da pagina principal do painel para transforma-la no novo **Painel Executivo** da Consultare.

A proposta e sair de uma tela predominantemente operacional e evoluir para uma visao consolidada de negocio, capaz de:

- mostrar os principais indicadores da operacao em um unico lugar;
- destacar automaticamente os pontos mais criticos;
- comparar desempenho do dia, da semana e do mes;
- apoiar diretor, gestora e lideres de area na priorizacao;
- gerar leitura executiva com IA;
- permitir exportacao em PDF da mesma visao;
- respeitar, sem codigo, a matriz de visibilidade por cargo, setor e perfil definida pela operacao.

Este plano deve servir como referencia para produto, design, backend, frontend, dados, permissoes, IA e exportacao.

---

## 2. Contexto atual

O repositorio ja possui uma primeira fundacao executiva implementada para `/dashboard`.

Ja existe no projeto:

- agregador server-side inicial do painel executivo;
- persistencia de `dashboard_executive_scopes`;
- persistencia de `dashboard_executive_snapshots`;
- endpoint de leitura do snapshot executivo;
- endpoint de refresh manual do snapshot executivo;
- endpoint inicial de escopo executivo por usuario;
- tela base do novo dashboard executivo;
- integracao inicial com modulos de financeiro, comercial, operacao, pessoas e qualidade.

Ao mesmo tempo, o projeto ja possui outras pecas relevantes para a evolucao completa:

- painel de metas com visao executiva em `apps/painel/src/app/(admin)/metas/dashboard`;
- exportacao em PDF e XLSX no ecossistema atual;
- endpoints-resumo em modulos como propostas, colaboradores, recrutamento, QMS, vigilancia sanitaria, agenda, produtividade e marketing;
- modelo de permissoes por pagina e refresh;
- vinculo `users.employee_id -> employees.id`;
- dados de colaboradores com `department`, `jobTitle` e `units`;
- estrutura de `system_status` para heartbeat e status de processos.

O novo insumo de negocio recebido da gerente muda um ponto importante do plano:

- o dashboard nao deve ser segmentado apenas por grandes areas;
- ele deve respeitar uma matriz de visibilidade por perfil operacional;
- cada cargo/setor precisa enxergar um conjunto especifico de informacoes;
- a gerente precisa conseguir editar essa matriz no painel, sem depender de deploy ou alteracao em codigo.

---

## 3. Visao de produto

O novo dashboard deve ser o **Painel Executivo** da Consultare.

Ele deve funcionar como um "gerente de negocios" digital para a lideranca, organizando a informacao de forma objetiva, priorizada e contextual por perfil.

Na pratica, a tela deve responder perguntas como:

- o que esta mais critico agora;
- quais metas estao com pior projecao;
- quais areas exigem acao imediata;
- onde a operacao esta melhorando ou piorando;
- quais planos de acao fazem mais sentido no curto prazo;
- quais informacoes cada perfil deve ver para decidir melhor, sem poluicao e sem acesso indevido.

O foco principal e atender:

- diretoria;
- gerencia ADM;
- gerencia operacional;
- lideres de unidade;
- lider operacional;
- agendas;
- financeiro;
- marketing;
- RH;
- CRC.

---

## 4. Decisoes travadas para a V1

As decisoes abaixo ficam definidas como base da primeira versao:

- a pagina principal sera a nova visao executiva em `/dashboard`;
- a camada de IA usara a **API da OpenAI**;
- a geracao da IA sera baseada em **snapshot persistido + refresh manual**;
- o PDF deve exportar exatamente o mesmo snapshot exibido ao usuario;
- a IA nao vai consultar banco nem APIs diretamente;
- a IA recebera apenas um payload consolidado e normalizado pelo backend;
- `dashboard.view` continua sendo o gate de entrada para o painel executivo;
- a segmentacao fina do dashboard nao sera controlada apenas por `role`;
- a visibilidade do dashboard sera controlada por **persona executiva + catalogo de widgets + escopo de dados**;
- a persona do dashboard sera **explicita e editavel** no painel;
- a regra padrao podera ser sugerida por `department + jobTitle`, mas nao sera inferida como fonte unica de verdade;
- itens do PDF que ainda nao possuem fonte real no sistema ficarao cadastrados como `planned`, mas ocultos da experiencia final ate serem implementados.

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

## 5.3 Escopo, perfil e confidencialidade primeiro

Como a tela sera executiva, ela precisa respeitar com rigor:

- permissao de acesso;
- persona executiva;
- unidade;
- setor;
- time;
- nivel de confidencialidade.

Nenhum usuario deve receber diagnostico, resumo ou PDF com dados fora do seu escopo.

## 5.4 Snapshot como fonte oficial

Para evitar inconsistencias entre tela, PDF e IA:

- a visao executiva deve nascer de um snapshot consolidado;
- o PDF deve ser gerado a partir do snapshot;
- o resumo da IA deve ser persistido junto do snapshot;
- o refresh manual gera um novo snapshot.

## 5.5 Governanca sem codigo

A gerente deve conseguir manter a matriz do painel executivo sem depender de alteracoes tecnicas.

Isso inclui:

- editar quais perfis existem;
- editar quais widgets cada perfil pode ver;
- definir regras padrao por cargo/setor;
- criar excecoes por usuario;
- controlar a ordem de exibicao dos widgets.

---

## 6. Estrutura funcional do novo painel

O novo `/dashboard` deve ser organizado em 4 camadas.

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

## 6.2 Camada 2 - Catalogo de widgets executivos

Abaixo do resumo, a experiencia final nao sera montada apenas por 5 blocos fixos.

Ela sera composta por um **catalogo de widgets executivos**.

Cada widget deve ter:

- chave estavel;
- label;
- area executiva associada;
- status `available` ou `planned`;
- fonte de dados declarada;
- ordem padrao;
- regras de visibilidade por perfil.

## 6.3 Camada 3 - Blocos executivos por area

Os 5 blocos continuam existindo como espinha dorsal analitica e base da IA:

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

Esses blocos podem alimentar mais de um widget visual.

## 6.4 Camada 4 - Operacao ao vivo

O dashboard atual possui leitura operacional importante e ela nao deve se perder.

Por isso, a V1 deve manter uma secao secundaria, ou bloco especifico, com a operacao ao vivo:

- fila medica;
- fila recepcao;
- WhatsApp;
- sinais de espera critica;
- heartbeat de servicos relevantes.

Essa camada continua importante, mas deixa de ser o centro da experiencia.

---

## 7. Fontes, dominios e widgets da V1

O novo painel deve se apoiar principalmente em dados ja existentes no projeto.

## 7.1 Financeiro

Fontes principais:

- `api/admin/financial/history`
- `api/admin/goals/dashboard`

Leituras ja mapeadas:

- faturamento hoje;
- faturamento semana;
- faturamento mes;
- meta atual;
- projecao;
- risco de nao atingimento.

Itens do PDF com indicio de base futura:

- contas em aberto;
- notas fiscais;
- contas da semana;
- previsto e realizado;
- estornos pendentes.

## 7.2 Comercial

Fontes principais:

- `api/admin/propostas`
- painel de metas

Leituras ja mapeadas:

- volume e valor de propostas;
- ganho;
- propostas em aberto;
- comparativo dia / semana / mes.

## 7.3 Operacao e Atendimento

Fontes principais:

- dashboard atual;
- `api/admin/produtividade`
- `api/admin/agenda-ocupacao`
- filas operacionais atuais

Leituras ja mapeadas ou proximas:

- filas atuais;
- ocupacao;
- confirmacao;
- sinais de espera critica;
- gargalos do momento;
- mapa diario e semanal de agendas;
- agendamento diario e mensal x meta.

Itens futuros provaveis:

- fila telefonia;
- recoletas;
- tarefas operacionais.

## 7.4 Pessoas

Fontes principais:

- `api/admin/colaboradores/dashboard`
- `api/admin/recrutamento`

Leituras ja mapeadas ou proximas:

- aniversariantes;
- quadro ativo;
- pendencias relevantes;
- recrutamento;
- tempo de empresa;
- banco de horas, quando houver fonte consolidada.

## 7.5 Qualidade

Fontes principais:

- `api/admin/qms/indicadores`
- `api/admin/vigilancia-sanitaria/summary`
- modulo de equipamentos e documentos

Leituras ja mapeadas ou proximas:

- documentos em alerta;
- riscos regulatorios;
- treinamentos;
- auditorias;
- documentos ou equipamentos vencidos ou vencendo;
- inspecoes, quando a base estiver consolidada.

## 7.6 Marketing

Fontes principais:

- `marketing/funil`
- `marketing/controle`

Leituras ja mapeadas ou proximas:

- Google;
- investimento ADS;
- faturamento x meta x campanha x conversao;
- cliques em WhatsApp e sinais de conversao.

## 7.7 Itens do PDF por status

Cada item da matriz do PDF deve entrar em um destes estados:

- `available`: ja existe fonte suficiente para entrar na V1 ou logo apos a governanca;
- `planned`: faz parte da matriz, mas ainda nao sera exibido;
- `blocked`: exige definicao adicional de dado, regra ou integracao.

---

## 8. Modelo de permissao, perfil e escopo

O modelo atual de permissao por pagina nao e suficiente para essa tela.

Sera necessario manter uma camada complementar de **segmentacao executiva**.

## 8.1 O que o projeto atual ja resolve

Hoje o sistema ja resolve:

- autenticacao;
- permissao por pagina e acao;
- acesso geral ao dashboard por `dashboard.view`;
- vinculo do usuario ao colaborador por `employee_id`;
- dados organizacionais basicos do colaborador (`department`, `jobTitle`, `units`).

## 8.2 O que ainda falta resolver

Hoje o sistema ainda nao resolve, sozinho:

- qual persona do dashboard cada usuario representa;
- quais widgets cada persona deve ver;
- quais regras padrao valem por cargo/setor;
- como a gerente altera isso sem codigo;
- como o snapshot, a IA e o PDF passam a respeitar essa matriz.

## 8.3 Estrutura proposta

Persistir tres camadas:

### a) Persona executiva

Representa os perfis operacionais da matriz recebida, por exemplo:

- `diretoria_gerencia_adm`
- `gerencia_operacional`
- `lider_unidades`
- `lider_operacional`
- `agendas`
- `financeiro`
- `marketing`
- `rh`
- `crc`

### b) Catalogo de widgets

Representa cada informacao possivel do painel, com:

- `widget_key`
- `label`
- `area_key`
- `status`
- `source_key`
- `sort_order`

### c) Regras e overrides

Representa:

- regra padrao por `department + jobTitle`;
- override explicito por usuario;
- escopo de dados por perfil ou por usuario.

## 8.4 Precedencia de resolucao

A resolucao final do dashboard deve seguir esta ordem:

1. usuario precisa ter `dashboard.view`;
2. se existir override explicito do usuario, ele prevalece;
3. se nao existir override, usar regra padrao por `department + jobTitle`;
4. se nao houver regra valida, o painel abre em estado seguro de configuracao pendente;
5. os widgets visiveis definem a composicao da tela;
6. o escopo define quais dados entram em cada widget.

## 8.5 Estado seguro

Se um usuario tiver acesso ao dashboard, mas nao tiver perfil resolvido, a tela nao deve abrir escopo amplo por fallback.

Ela deve:

- abrir sem dados executivos;
- informar que a configuracao do perfil executivo esta pendente;
- orientar o administrador a concluir a configuracao.

---

## 9. Arquitetura de dados executivos

Para evitar acoplamento entre frontend e multiplos endpoints dispersos, o painel executivo deve manter um agregador server-side proprio.

## 9.1 Novo agregador executivo

Criar ou evoluir a camada de agregacao para que ela:

- leia os dados dos modulos existentes;
- normalize a resposta;
- consolide indicadores por area;
- resolva a persona executiva;
- resolva os widgets visiveis;
- aplique o escopo do usuario;
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

Manter persistencia do snapshot executivo com campos equivalentes a:

- identificador;
- usuario ou origem da geracao;
- hash do perfil e do escopo;
- `metrics_json`;
- `ai_summary_json`;
- status;
- timestamps de criacao e conclusao;
- erro, quando houver.

O snapshot passa a ser a fonte oficial da tela executiva.

## 9.4 O que ja esta implementado

Ja existe uma fundacao inicial para:

- geracao de snapshot;
- leitura do ultimo snapshot valido;
- refresh manual;
- escopo executivo inicial por usuario;
- tela base do painel executivo.

Essa base deve ser evoluida, e nao descartada.

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
- deve adaptar a narrativa ao perfil e ao escopo visivel do usuario;
- deve apontar lacunas quando o dado nao for suficiente.

## 10.6 Comportamento em falha

Se a OpenAI falhar:

- a tela continua exibindo os blocos quantitativos;
- o snapshot pode ser salvo como parcial ou falho, conforme politica definida na implementacao;
- o usuario deve ver que o resumo de IA esta temporariamente indisponivel;
- o PDF nao deve inventar um resumo ausente.

---

## 11. Endpoints e contratos novos

## 11.1 Leitura do dashboard executivo

`GET /api/admin/dashboard/executive`

Responsabilidade:

- retornar o snapshot executivo mais recente e valido para o perfil e escopo do usuario.

## 11.2 Refresh do dashboard executivo

`POST /api/admin/dashboard/executive/refresh`

Responsabilidade:

- gerar novo snapshot executivo;
- consolidar dados;
- executar IA quando a fase estiver habilitada;
- registrar status em `system_status`.

## 11.3 Exportacao PDF

`GET /api/admin/dashboard/executive/export?snapshotId=...`

Responsabilidade:

- exportar o PDF a partir do snapshot persistido;
- manter consistencia entre tela e arquivo.

## 11.4 Gestao de perfil e escopo executivo

Endpoints administrativos esperados:

- leitura e edicao de perfis executivos;
- leitura e edicao do catalogo de widgets;
- leitura e edicao de regras por cargo/setor;
- leitura e edicao de override por usuario;
- preview de resolucao do dashboard por usuario.

O endpoint inicial `GET / PATCH /api/admin/users/executive-scope` continua util, mas deve evoluir para fazer parte dessa governanca maior.

---

## 12. Permissoes e integracao com o modelo atual

## 12.1 Visualizacao

A nova tela continua ligada a `dashboard`.

Ou seja:

- quem nao tem `dashboard.view` nao acessa o painel executivo;
- o gate de pagina continua centralizado no modelo atual de permissao.

## 12.2 Segmentacao fina

O `role` atual (`ADMIN`, `GESTOR`, `OPERADOR`, `INTRANET`) continua valido para acesso geral, mas nao deve ser a fonte unica de segmentacao do painel executivo.

A segmentacao fina deve passar por:

- persona executiva;
- regras por cargo/setor;
- override por usuario;
- escopo de dados.

## 12.3 Permissao administrativa nova

Criar uma permissao administrativa propria para governanca do painel executivo.

Essa permissao deve controlar quem pode:

- editar perfis executivos;
- editar widgets;
- editar regras por cargo/setor;
- editar overrides;
- reorganizar a experiencia sem codigo.

Ela nao deve ficar misturada apenas com `users.edit`.

## 12.4 Edicao sem codigo

A gerente deve ter acesso a uma interface propria do painel executivo para manter essa matriz.

Essa interface deve permitir:

- editar quais perfis existem;
- definir quais widgets cada perfil enxerga;
- definir ordem dos widgets;
- ativar ou desativar widgets por perfil;
- revisar usuarios com perfil resolvido;
- aplicar override manual quando necessario.

---

## 13. Direcao de interface

Existem agora duas referencias de interface:

### a) PDF executivo original

Continua guiando:

- visual mais executivo;
- leitura compacta;
- hierarquia forte;
- foco em status, variacao, meta e prioridade.

### b) PDF por setor e cargo

Passa a guiar:

- matriz de perfis;
- ordem de relevancia dos assuntos;
- recorte esperado por area operacional;
- definicao de quais widgets cada perfil deve ver.

Elementos esperados da tela:

- titulo e data de referencia;
- indicacao clara do perfil e do escopo em uso;
- ultimo snapshot gerado;
- botao de atualizar;
- botao de exportar PDF;
- bloco principal de diagnostico IA;
- widgets executivos visiveis para o perfil;
- sessao secundaria de operacao ao vivo;
- estado claro para itens indisponiveis, configuracao pendente ou IA indisponivel.

---

## 14. Exportacao em PDF

O projeto ja possui uso de `pdf-lib` em outras areas e isso deve ser reaproveitado.

## 14.1 Principio

O PDF deve ser uma extensao fiel da tela executiva, e nao um relatorio diferente.

## 14.2 Estrutura recomendada

Ordem sugerida do PDF:

1. cabecalho com data, usuario, perfil e escopo;
2. resumo executivo com IA;
3. prioridades principais;
4. widgets ou blocos visiveis no perfil;
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

- usuario sem `dashboard.view` nao acessa;
- usuario com `dashboard.view`, mas sem perfil resolvido, entra em estado seguro sem dados amplos;
- diretoria ve os widgets previstos para seu perfil;
- CRC ve apenas os widgets previstos para CRC;
- financeiro ve apenas os widgets previstos para financeiro;
- areas e widgets fora do perfil nao aparecem na tela, nem no payload, nem no PDF.

## 15.2 Governanca sem codigo

- gerente consegue editar perfis e widgets sem deploy;
- gerente consegue alterar a ordem de widgets por perfil;
- gerente consegue ativar ou desativar visibilidade por perfil;
- override por usuario prevalece sobre regra padrao;
- alteracoes administrativas passam a refletir na resolucao do dashboard.

## 15.3 Snapshot e consistencia

- refresh manual cria novo snapshot;
- a tela le o ultimo snapshot valido;
- o PDF usa o snapshot informado;
- refresh posterior nao altera export antigo;
- o hash do snapshot muda quando perfil, widgets ou escopo mudarem.

## 15.4 IA

- resposta deve obedecer ao schema estruturado;
- falha de schema nao publica resumo invalido;
- dados ausentes entram como lacuna;
- a IA nao cria recomendacao sobre fatos inexistentes;
- a IA respeita apenas widgets e escopo visiveis ao perfil.

## 15.5 Experiencia

- a tela continua util mesmo quando a IA estiver indisponivel;
- operacao ao vivo permanece acessivel;
- a leitura executiva fica mais objetiva que o dashboard atual;
- o tempo de abertura da tela nao deve depender de executar IA em tempo real.

---

## 16. Plano de entrega atualizado

## Fase 0 - Fundacao tecnica ja pronta

Status: **parcialmente concluida**

Ja existe no projeto:

- agregador executivo inicial;
- tipos e contratos iniciais;
- snapshot persistido;
- refresh manual;
- tela base do dashboard executivo;
- escopo executivo inicial por usuario.

O objetivo agora e evoluir essa base, e nao recomecar do zero.

## Fase 1 - Governanca de visibilidade e perfis

Objetivo:

- transformar o modelo atual de escopo em uma governanca completa por perfil.

Entregas:

- modelar personas executivas;
- modelar catalogo de widgets;
- modelar regras por `department + jobTitle`;
- modelar overrides por usuario;
- criar permissao administrativa do painel executivo;
- criar tela administrativa para a gerente editar tudo sem codigo;
- colocar o dashboard em estado seguro quando faltar configuracao.

## Fase 2 - Consolidacao de widgets V1

Objetivo:

- ligar o dashboard aos widgets que ja possuem fonte real no projeto.

Entregas:

- mapear widgets `available`;
- separar widgets `planned`;
- reorganizar a tela por perfil, nao apenas por area;
- melhorar a composicao final por persona do PDF.

## Fase 3 - IA e priorizacao

Objetivo:

- integrar OpenAI sobre o snapshot ja governado por perfil.

Entregas:

- integrar Responses API;
- validar structured output;
- gerar resumo executivo;
- gerar prioridades, riscos e planos de acao;
- persistir a leitura de IA no snapshot.

## Fase 4 - PDF e refinamento final

Objetivo:

- fechar consistencia entre tela, IA, export e manutencao operacional.

Entregas:

- gerar exportacao PDF a partir do snapshot;
- refletir perfil, widgets e escopo no PDF;
- ajustar layout executivo;
- estabilizar estados de erro e loading;
- preparar backlog formal dos widgets futuros.

---

## 17. Resultado esperado

Ao final da refatoracao, a Consultare deve ter no dashboard principal:

- uma visao consolidada do negocio;
- uma leitura clara do que exige atencao imediata;
- comparativo de desempenho do dia, da semana e do mes;
- diagnostico operacional por IA;
- sugestoes de acao para metas e areas com pior projecao;
- experiencia adequada para diretor, gestora e lideres;
- segmentacao correta por cargo, setor e perfil;
- governanca sem codigo pela gerente;
- exportacao em PDF coerente com a tela.

Em resumo, o painel deixa de ser apenas um monitor operacional e passa a ser um instrumento real de gestao executiva, com controle operacional da propria equipe sobre quem ve o que.
