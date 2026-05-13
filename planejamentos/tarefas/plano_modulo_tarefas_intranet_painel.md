# Plano do Modulo de Tarefas

Data: 2026-05-13

## Resumo
Este documento consolida o plano definitivo do modulo de tarefas internas da Consultare, com escopo compartilhado entre `intranet` e `painel`.

O objetivo e entregar um fluxo de tarefas estilo Trello, com governanca gerencial no painel e operacao diaria na intranet, reaproveitando a infraestrutura real ja existente no monorepo:

- autenticacao compartilhada com `NextAuth`
- usuarios da tabela `users`
- matriz de permissoes por `PageKey`
- governanca executiva do `dashboard_executive`
- upload de arquivos em S3
- padrao atual de repositories com `ensure*Tables`
- padrao atual de `history/audit_log`

Decisoes travadas deste plano:

- a experiencia principal do usuario comum fica na `intranet`
- a home atual da intranet continua em `/`, mas passa a destacar `Minhas tarefas`
- o board principal do V1 sera em `/tarefas`
- a visualizacao inicial sera `kanban`
- o usuario comum so ve tarefas que criou ou em que foi atribuido
- a visao global e o gerenciamento total ficam no `painel`
- o acesso global no painel fica restrito a `ADMIN` e ao perfil executivo `diretoria_gerencia_adm`
- o fluxo padrao de colunas do V1 sera `BACKLOG`, `A_FAZER`, `EM_ANDAMENTO`, `AGUARDANDO_APROVACAO`, `CONCLUIDA`
- a aprovacao sera modelada como fluxo separado e reutilizavel, nao apenas como status simples
- o aprovador e opcional no cadastro da tarefa
- quando houver aprovacao, o criador escolhe o aprovador especifico
- o protocolo da tarefa sera legivel e sequencial, no formato `TK-0001`

## Objetivo operacional
Entregar um modulo que permita:

- criar tarefas internas com identificacao legivel
- atribuir para si mesmo ou para outros usuarios
- acompanhar execucao em kanban
- comentar e anexar arquivos
- controlar prazo, prioridade, status e responsabilidade
- solicitar aprovacao quando necessario
- dar visibilidade gerencial consolidada no painel
- alimentar um mini dashboard operacional e um dashboard gerencial
- preparar uma base de workflow de aprovacao reaproveitavel para outras frentes futuras

## Escopo funcional do V1

### Campos obrigatorios da tarefa
- `id` tecnico UUID
- `protocol_id` legivel, ex.: `TK-0001`
- `protocol_number` inteiro unico para geracao do protocolo
- `title`
- `description`
- `priority`
- `status`
- `department`
- `created_by`
- `created_at`
- `updated_at`

### Campos opcionais da tarefa
- `due_date`
- `primary_assignee_user_id`
- `approver_user_id`
- `start_date`
- `completed_at`
- `canceled_at`
- `cancellation_reason`

### Relacoes e complementos
- multiplos responsaveis em relacao separada
- anexos na descricao
- comentarios com anexos
- trilha completa de atividades
- historico de aprovacao

### Sugestoes de campos relevantes incluidos no plano
Itens nao citados explicitamente no briefing, mas necessarios para uso real e para governanca:

- `title`: indispensavel para leitura rapida, busca e cards
- `department`: necessario para visao por setor e dashboard gerencial
- `start_date`: ajuda a diferenciar planejamento de execucao
- `completed_at`: necessario para auditoria e futuros indicadores de SLA
- `cancellation_reason`: preserva rastreabilidade sem delete fisico
- `primary_assignee_user_id`: evita ambiguidade em tarefas com varios responsaveis

## Regras de negocio travadas

### Visibilidade na intranet
Usuario autenticado so pode visualizar tarefas que atendam pelo menos uma regra:

- foi o criador da tarefa
- esta atribuido como responsavel principal
- esta atribuido como responsavel adicional
- foi definido como aprovador da tarefa

### Visibilidade global no painel
Podem ver e gerenciar todas as tarefas:

- usuarios `ADMIN`
- usuarios que, no escopo do painel executivo, resolvam para o perfil `diretoria_gerencia_adm`

### Status e colunas do board
Status oficiais do V1:

- `BACKLOG`
- `A_FAZER`
- `EM_ANDAMENTO`
- `AGUARDANDO_APROVACAO`
- `CONCLUIDA`
- `CANCELADA`

Regras:

- `CANCELADA` nao aparece no board principal por padrao
- `CONCLUIDA` permanece em coluna propria
- mover para `AGUARDANDO_APROVACAO` exige aprovador definido
- aprovacao `APROVADA` conclui a tarefa automaticamente
- aprovacao `REPROVADA` ou `DEVOLVIDA` retorna a tarefa para `EM_ANDAMENTO`

### Prioridades oficiais
- `BAIXA`
- `MEDIA`
- `ALTA`
- `URGENTE`

### Responsabilidade
- cada tarefa deve ter um `primary_assignee`
- pode ter responsaveis adicionais
- o criador pode atribuir a si mesmo apenas
- o criador pode atribuir a outros usuarios ativos
- no V1, apenas o criador e a visao global do painel podem alterar a lista de responsaveis

### Aprovacao
- aprovacao e opcional
- sem aprovador, a tarefa pode ser executada normalmente e encerrada sem workflow de aprovacao
- com aprovador definido, o criador ou responsavel pode solicitar aprovacao
- o aprovador nomeado decide entre `APROVADA`, `REPROVADA`, `DEVOLVIDA`
- decisao exige registro de data, autor e observacao opcional
- o modelo deve aceitar ciclos futuros de aprovacao reaproveitaveis em outros modulos

### Exclusao e cancelamento
- nao havera delete fisico no V1
- cancelamento substitui exclusao
- toda mudanca importante gera evento de atividade

## Arquitetura alvo

### Organizacao de dominio
Criar dominio compartilhado em `packages/core/src/tasks/` com:

- `types.ts`
- `repository.ts`
- `auth.ts` ou helpers de autorizacao compartilhavel
- `queries.ts` se necessario para separar agregados

Esse dominio sera consumido por:

- `apps/intranet`
- `apps/painel`

### Tabelas novas
O V1 deve nascer com as tabelas abaixo:

#### `tasks`
Campos minimos:

- `id`
- `protocol_number`
- `protocol_id`
- `title`
- `description`
- `department`
- `priority`
- `status`
- `due_date`
- `start_date`
- `primary_assignee_user_id`
- `approver_user_id`
- `created_by`
- `completed_at`
- `canceled_at`
- `cancellation_reason`
- `created_at`
- `updated_at`

Indices minimos:

- `protocol_number`
- `protocol_id`
- `status`
- `priority`
- `due_date`
- `created_by`
- `primary_assignee_user_id`
- `approver_user_id`
- `department`

#### `task_assignees`
Campos minimos:

- `id`
- `task_id`
- `user_id`
- `role_type`
- `created_at`

Regras:

- um registro para o principal tambem pode existir aqui com `role_type = PRIMARY`
- demais registros com `role_type = COLLABORATOR`
- indice por `task_id`
- indice por `user_id`
- constraint unica por `task_id + user_id`

#### `task_attachments`
Campos minimos:

- `id`
- `task_id`
- `storage_provider`
- `storage_bucket`
- `storage_key`
- `original_name`
- `mime_type`
- `size_bytes`
- `uploaded_by`
- `created_at`

#### `task_comments`
Campos minimos:

- `id`
- `task_id`
- `author_user_id`
- `body`
- `created_at`
- `updated_at`

#### `task_comment_attachments`
Campos minimos:

- `id`
- `comment_id`
- `storage_provider`
- `storage_bucket`
- `storage_key`
- `original_name`
- `mime_type`
- `size_bytes`
- `uploaded_by`
- `created_at`

#### `task_approval_requests`
Campos minimos:

- `id`
- `task_id`
- `approver_user_id`
- `requested_by`
- `requested_at`
- `decision_status`
- `decision_notes`
- `decided_by`
- `decided_at`
- `cycle_number`
- `is_active`

Regras:

- apenas uma solicitacao ativa por tarefa no V1
- manter historico dos ciclos anteriores

#### `task_activity_log`
Campos minimos:

- `id`
- `task_id`
- `action`
- `actor_user_id`
- `payload_json`
- `created_at`

### Storage
Reaproveitar o provider atual de S3.

Estrutura sugerida de chave:

- `tasks/{taskId}/attachments/{uuid}-{fileName}`
- `tasks/{taskId}/comments/{commentId}/{uuid}-{fileName}`

### Permissoes
Adicionar novo `PageKey` compartilhado:

- `intranet_tarefas`

Defaults do `PageKey`:

- `ADMIN`: `view/edit/refresh = true`
- `GESTOR`: `view/edit = true`, `refresh = false`
- `OPERADOR`: `view/edit = true`, `refresh = false`

Observacao:

- o modulo da intranet nao depende de `refresh`
- o `painel` nao precisa de `PageKey` separado para visao global
- a governanca global deve reaproveitar `dashboard_executive_governance`

### Rotas e interfaces previstas

#### Intranet
- `/tarefas`
- `GET /api/tasks`
- `POST /api/tasks`
- `GET /api/tasks/[taskId]`
- `PATCH /api/tasks/[taskId]`
- `POST /api/tasks/[taskId]/attachments`
- `POST /api/tasks/[taskId]/comments`
- `POST /api/tasks/[taskId]/approval/request`
- `POST /api/tasks/[taskId]/approval/decision`

#### Painel
- `/dashboard-executivo/tarefas`
- `GET /api/admin/tasks`
- `GET /api/admin/tasks/summary`
- `GET /api/admin/tasks/[taskId]`
- `PATCH /api/admin/tasks/[taskId]`

## Experiencia do usuario

### Intranet
- a home atual em `/` continua existindo
- incluir um bloco forte `Minhas tarefas` no topo da home autenticada
- incluir CTA para `/tarefas`
- incluir `Tarefas` como item de navegacao destacado na sidebar
- board em `/tarefas` abre em visualizacao `kanban`
- filtros minimos:
  - minhas criadas
  - atribuidas a mim
  - aguardando minha aprovacao
  - vencidas
  - a vencer

### Painel
- criar rota dedicada dentro de `dashboard-executivo`
- exibir mini dashboard gerencial no topo
- exibir alternancia entre `Kanban` e `Lista`
- filtros minimos:
  - setor
  - criador
  - responsavel
  - aprovador
  - prioridade
  - status
  - vencimento

### Cards de dashboard
Cards obrigatorios:

- `Total de tarefas`
- `A vencer`
- `Vencidas`
- `Aguardando aprovacao`
- `Aprovadas`

Definicoes operacionais:

- `A vencer`: tarefas com prazo entre hoje e D+2, excluindo `CONCLUIDA` e `CANCELADA`
- `Vencidas`: tarefas com prazo menor que hoje, excluindo `CONCLUIDA` e `CANCELADA`
- `Aguardando aprovacao`: tarefas em `AGUARDANDO_APROVACAO` com solicitacao ativa pendente
- `Aprovadas`: tarefas cuja ultima solicitacao ativa foi aprovada e resultou em conclusao

## Integracao com dashboard executivo
- o widget `tarefas`, ja previsto em `dashboard_executive/catalog.ts`, deve sair de `planned` para `available`
- o snapshot executivo deve receber agregados de tarefas
- o widget deve mostrar no minimo:
  - abertas
  - vencidas
  - a vencer
  - aguardando aprovacao
- a leitura deve respeitar o escopo global autorizado do usuario do painel

## Fases de execucao
As fases abaixo estao desenhadas para serem executadas pelo Codex depois, com dependencias claras e criterios objetivos de pronto.

### Fase 0 — Fundacao tecnica e contrato de dominio
Objetivo:
- criar a fundacao do dominio de tarefas sem interface final

Entregas:
- novo dominio `packages/core/src/tasks`
- tipos oficiais de tarefa, comentario, anexo, aprovacao e dashboard
- `ensureTaskTables` com criacao idempotente das tabelas
- geracao segura de `protocol_number` e `protocol_id`
- repository com operacoes basicas:
  - criar tarefa
  - listar tarefas por escopo
  - detalhar tarefa
  - atualizar tarefa
  - inserir comentario
  - anexar arquivo
  - abrir solicitacao de aprovacao
  - decidir aprovacao
  - gerar agregados de dashboard
- trilha de atividade padronizada

Checklist para execucao:
- mapear padrao de `ensure*Tables` ja usado no repo
- criar enums e tipos compartilhados
- decidir forma transacional da geracao do protocolo
- criar consultas de escopo de usuario comum e escopo global
- incluir testes unitarios do repository, se a area ja possuir harness

Critério de pronto:
- o dominio compartilhado permite CRUD funcional e agregados, sem depender ainda da UI

### Fase 1 — Permissoes, navegacao e APIs
Objetivo:
- conectar o dominio ao ecossistema real de autenticacao e autorizacao

Entregas:
- novo `PageKey` `intranet_tarefas`
- defaults atualizados em `packages/core/src/permissions.ts`
- mapeamento de rota em `getPageFromPath`
- helpers server-side de autorizacao para intranet e painel
- APIs da intranet implementadas
- APIs administrativas do painel implementadas
- validacao server-side de acesso a tarefa por escopo

Checklist para execucao:
- ajustar sidebar da intranet para incluir `Tarefas`
- garantir que `/api/tasks/*` use escopo do usuario logado
- garantir que `/api/admin/tasks/*` use governanca executiva global
- validar upload/download com autorizacao

Critério de pronto:
- frontend ja consegue consumir endpoints reais com regra de acesso correta

### Fase 2 — UX inicial da intranet
Objetivo:
- entregar a experiencia operacional principal para os usuarios

Entregas:
- pagina `/tarefas` na intranet
- kanban com colunas oficiais do V1
- criacao de tarefa por modal ou drawer
- edicao basica de titulo, descricao, prioridade, prazo e responsaveis
- comentarios com anexos
- abertura de solicitacao de aprovacao
- decisao de aprovacao quando o usuario for o aprovador
- filtro `Minhas tarefas`
- filtro `Aguardando minha aprovacao`
- ordenacao operacional por urgencia e vencimento

Checklist para execucao:
- seguir identidade visual existente da intranet
- manter board responsivo para desktop e mobile
- priorizar leitura rapida do card:
  - protocolo
  - titulo
  - prioridade
  - prazo
  - responsavel principal
- mostrar badges de aprovacao e vencimento
- impedir transicoes invalidas pelo frontend e backend

Critério de pronto:
- um usuario comum consegue operar o ciclo completo de uma tarefa dentro da intranet

### Fase 3 — Home da intranet e entrada padrao
Objetivo:
- tornar o modulo visivel por padrao sem eliminar a home institucional

Entregas:
- bloco `Minhas tarefas` no topo da home autenticada
- resumo rapido com os cinco cards operacionais
- CTA para abrir board completo
- lista curta de tarefas criticas:
  - vencidas
  - a vencer
  - aguardando aprovacao

Checklist para execucao:
- preservar noticias e atalhos existentes
- posicionar `Minhas tarefas` acima dos cards institucionais
- evitar duplicar consultas desnecessarias entre home e board

Critério de pronto:
- a home da intranet passa a expor tarefas como experiencia principal do dia a dia

### Fase 4 — Painel gerencial global
Objetivo:
- entregar governanca e leitura consolidada para ADM e gerencia ADM

Entregas:
- rota `/dashboard-executivo/tarefas`
- cards gerenciais no topo
- visualizacao `Kanban`
- visualizacao `Lista`
- filtros globais por setor, criador, responsavel, aprovador, prioridade, status e prazo
- edicao global de qualquer tarefa
- leitura da trilha de atividade

Checklist para execucao:
- reaproveitar padrao visual do painel
- respeitar filtro e escopo do perfil executivo
- manter respostas server-side adequadas para volume maior
- preparar pagina para futuras exportacoes, mesmo que a exportacao nao entre no V1

Critério de pronto:
- a gestao consegue acompanhar e atuar sobre todas as tarefas da empresa pelo painel

### Fase 5 — Widget executivo e consolidacao do dashboard
Objetivo:
- integrar o modulo ao dashboard executivo ja existente

Entregas:
- widget `tarefas` marcado como `available`
- agregados de tarefas no snapshot executivo
- exibicao do widget na home do dashboard para perfis que ja possuem `tarefas` no catalogo
- coerencia entre resumo da rota `/dashboard-executivo/tarefas` e widget do dashboard

Checklist para execucao:
- revisar `dashboard_executive/catalog.ts`
- ligar `buildExecutiveWidgets` ao agregador de tarefas
- validar textos e labels do widget

Critério de pronto:
- o painel executivo principal passa a refletir o novo dominio de tarefas

### Fase 6 — Hardening e fechamento de V1
Objetivo:
- consolidar qualidade, rastreabilidade e seguranca antes de evolucoes futuras

Entregas:
- refinamento de indices e consultas
- tratamento de erros de upload
- mensagens operacionais consistentes
- testes de autorizacao
- testes de transicao de status
- testes de aprovacao
- testes de dashboard
- documentacao tecnica minima de operacao

Checklist para execucao:
- revisar comportamento concorrente do protocolo sequencial
- revisar anexos orfaos em caso de erro
- revisar queries de dashboard para volume
- validar mobile basico do board

Critério de pronto:
- modulo pronto para uso real controlado e base segura para evolucoes

## Ordem recomendada de implementacao
Ordem de execucao recomendada pelo Codex:

1. `Fase 0`
2. `Fase 1`
3. `Fase 2`
4. `Fase 3`
5. `Fase 4`
6. `Fase 5`
7. `Fase 6`

Justificativa:

- o dominio compartilhado precisa nascer antes das UIs
- as APIs e permissoes precisam travar o contrato antes do frontend
- a intranet e o primeiro consumidor real do modulo
- a visao global do painel vem depois que a regra operacional estiver funcional
- o widget executivo deve consumir agregados ja estabilizados

## Criterios de aceite do V1
- usuario comum cria tarefa com protocolo legivel
- usuario comum visualiza apenas tarefas permitidas pelo seu escopo
- tarefa aceita comentario e anexo
- tarefa pode ser atribuida a si mesmo ou a outros usuarios
- tarefa pode entrar em aprovacao opcional
- aprovador nomeado consegue decidir
- aprovacao aprovada conclui a tarefa
- aprovacao reprovada ou devolvida retorna a tarefa para execucao
- intranet exibe resumo de tarefas na home
- painel exibe visao global restrita a governanca correta
- widget executivo `tarefas` aparece no dashboard dos perfis elegiveis

## Nao objetivos do V1
- automacoes de notificacao
- mencoes em comentarios
- subtarefas
- checklists internos por tarefa
- templates de tarefas
- colunas customizaveis
- exportacao XLSX/PDF
- SLA formal por tipo de tarefa
- workflow multiaprovador

## Riscos e cuidados de implementacao
- geracao sequencial do protocolo precisa ser segura contra concorrencia
- visibilidade cruzada entre intranet e painel exige cuidado para nao vazar tarefa indevida
- anexos exigem validacao de download autenticado
- board kanban pode sofrer com volume se lista completa vier sem paginacao ou filtros
- dashboard executivo nao deve consumir consultas pesadas sem agregacao adequada

## Proximas evolucoes pos-V1
- notificacoes in-app e e-mail
- templates por setor
- categorias e etiquetas
- SLA e aging
- dashboard por colaborador e por setor
- exportacoes
- workflow de aprovacao multi-etapa
- reaproveitamento do mesmo motor de aprovacao em outros modulos

