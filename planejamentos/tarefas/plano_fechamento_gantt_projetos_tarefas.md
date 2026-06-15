# Plano de Fechamento do Gantt de Projetos no Modulo de Tarefas

Data: 2026-06-15

## Resumo
Este plano fecha o restante da entrega de `Projetos + Gantt` no modulo de tarefas, com foco em transformar o que hoje ja existe em backend e UI parcial em uma funcionalidade completa, governavel e pronta para uso operacional e gerencial.

Estado atual confirmado no codigo:

- entidade `Projeto` ja existe no dominio de tarefas
- tarefas ja podem ser vinculadas a projeto
- visao `Gantt` ja existe no intranet e no painel
- APIs de projetos, membros, dependencias e portfolio ja existem
- exportacao por projeto em `XLSX` e `PDF` ja existe
- filtros por projeto ja existem no intranet e no painel

O que falta fechar:

- gestao visual de dependencias
- gestao visual de membros e metadados do projeto
- reordenacao das tarefas dentro do cronograma
- visualizacao grafica das dependencias no Gantt
- exportacao consolidada da visao `Todos`
- refinamento da experiencia de governanca de projetos no painel e do uso operacional no intranet

## Decisoes travadas

- o fechamento deve partir do estado atual do codigo, sem reabrir o modelo de dominio
- cada tarefa continua pertencendo a no maximo um projeto
- dependencias continuam sendo apenas `finish-to-start`
- checklist continua sendo apenas progresso da tarefa
- o painel continua sendo a visao global gerencial
- o intranet continua sendo a visao operacional do usuario e dos projetos em que ele participa
- a UX de dependencias e membros deve existir tanto no intranet quanto no painel, respeitando as permissoes atuais
- a UI de dependencias sera centrada primeiro no modal da tarefa
- a reordenacao pode comecar por lista estruturada do projeto se o drag and drop direto no Gantt ficar instavel

## Sprints de Execucao

### Sprint 1 — Governanca completa do projeto
Objetivo:
fechar a camada de administracao do projeto como entidade funcional, nao apenas como filtro do Gantt.

Entregas:

- adicionar UI de edicao de projeto no intranet e no painel:
  - nome
  - descricao
  - estado arquivado/ativo
- adicionar UI de gestao de membros:
  - listar membros atuais do projeto
  - adicionar membro
  - remover membro
  - bloquear remocao do owner na UI
- adicionar ponto de entrada claro para abrir detalhes do projeto a partir da visao Gantt
- mostrar metadados do projeto na UI:
  - total de tarefas
  - tarefas agendadas
  - dependencias
  - membros
- refletir owner/membro com badges simples
- no intranet, mostrar apenas projetos visiveis ao usuario
- no painel, mostrar todos os projetos visiveis pela governanca global

Arquivos-alvo principais:

- `apps/intranet/src/app/(site)/tarefas/tasks-client.tsx`
- `apps/painel/src/app/(admin)/dashboard-executivo/tarefas/tasks-admin-client.tsx`

Criterio de pronto:

- projeto pode ser criado, aberto, editado e ter membros gerenciados sem sair da interface

### Sprint 2 — Dependencias e predecessoras editaveis
Objetivo:
fechar a parte estrutural mais critica do cronograma.

Entregas:

- adicionar UI para escolher predecessora da tarefa:
  - no modal de tarefa
  - restrita as tarefas do mesmo projeto
- permitir criar dependencia via seletor pesquisavel
- permitir remover dependencia existente
- exibir no modal:
  - projeto atual
  - predecessoras atuais
- bloquear acoes invalidas na UI:
  - tarefa sem projeto
  - auto dependencia
  - tarefa sem datas minimas exigidas quando aplicavel
- espelhar no painel a mesma capacidade de gestao
- tratar mensagens amigaveis para erros do backend:
  - ciclo detectado
  - tarefas de projetos diferentes
  - predecessora invalida

Criterio de pronto:

- usuario autorizado consegue adicionar e remover predecessoras pela UI, e o backend continua sendo a fonte oficial de validacao

### Sprint 3 — Reordenacao do cronograma e refinamento do Gantt
Objetivo:
tornar o cronograma realmente manipulavel e compreensivel.

Entregas:

- implementar reordenacao das tarefas do projeto:
  - no Gantt
  - e/ou em uma lista estrutural do projeto
- persistir `projectSortOrder`
- melhorar a escala temporal do Gantt:
  - cabecalho de datas mais claro
  - melhor leitura de duracao
  - melhor diferenciacao visual entre:
    - concluida
    - atrasada
    - em andamento
    - aguardando aprovacao
- desenhar relacionamentos visuais entre tarefas dependentes
- manter comportamento responsivo e legivel no desktop
- preservar fallback elegante quando o projeto ainda nao tem massa critica para Gantt

Criterio de pronto:

- o cronograma fica ordenavel e as dependencias ficam perceptiveis visualmente

### Sprint 4 — Exportacoes completas e visao consolidada
Objetivo:
fechar a leitura executiva e operacional fora da tela.

Entregas:

- implementar exportacao consolidada da visao `Todos`
- `XLSX` consolidado:
  - projetos do usuario ou globais, conforme contexto
  - tarefas avulsas
  - agrupamento por projeto
  - predecessoras
  - duracao
  - progresso checklist
- `PDF` consolidado:
  - relatorio resumido por projeto
  - bloco de tarefas avulsas
  - sem tentar reproduzir um Gantt gigante em pagina unica
- expor os botoes de exportacao na visao consolidada:
  - intranet
  - painel
- ajustar nomenclatura dos arquivos exportados para diferenciar:
  - projeto especifico
  - portfolio consolidado
- revisar performance da montagem dos exports em datasets maiores

Criterio de pronto:

- usuario e gerencia conseguem exportar tanto um projeto quanto a visao consolidada `Todos`

### Sprint 5 — Polimento final, QA e hardening
Objetivo:
deixar o modulo pronto para uso real e manutencao segura.

Entregas:

- revisar mensagens de erro e estados vazios
- revisar permissoes fim a fim:
  - membro
  - owner
  - usuario fora do projeto
  - gerencia/ADM
- revisar consistencia entre intranet e painel
- revisar UX dos modais e filtros
- revisar textos e nomenclaturas:
  - projeto
  - tarefa avulsa
  - predecessora
  - cronograma
  - portfolio
- incluir cobertura de regressao manual e automatizada onde ja houver padrao no modulo
- validar cenarios com:
  - projeto sem tarefas
  - projeto com 1 tarefa
  - projeto com varias dependencias
  - tarefas concluidas e arquivadas
  - projeto com membros multiplos
- manter no proprio plano os comandos minimos de validacao:
  - `npx tsc -p apps/intranet/tsconfig.json --noEmit`
  - `npx tsc -p apps/painel/tsconfig.json --noEmit`
  - `git diff --check`

Criterio de pronto:

- o modulo fica coerente visualmente, previsivel em regras e seguro para uso continuo

## Interfaces e contratos a preservar

- `TaskProjectSummary`
- `TaskProjectDetail`
- `TaskDependency`
- `TaskPortfolioGantt`
- `TaskSummary.projectId`
- `TaskSummary.projectSortOrder`
- `TaskSummary.predecessorTaskIds`

APIs ja existentes e que devem ser reaproveitadas:

- `GET/POST /api/task-projects`
- `GET/PATCH /api/task-projects/[projectId]`
- `POST/DELETE /api/task-projects/[projectId]/members...`
- `POST/DELETE /api/task-projects/[projectId]/dependencies...`
- `GET /api/task-projects/[projectId]/gantt`
- `GET /api/tasks/portfolio-gantt`
- equivalentes administrativos em `/api/admin/...`

Novas capacidades esperadas sem mudar o modelo:

- endpoints atuais passam a ser efetivamente consumidos pela UI
- export consolidado de portfolio pode usar rota dedicada nova
- reordenacao do cronograma pode usar endpoint dedicado para `projectSortOrder`

## Casos de teste obrigatorios

- criar projeto e editar seus metadados depois
- adicionar e remover membros do projeto
- membro do projeto ver todas as tarefas dele, mesmo sem atribuicao direta
- usuario fora do projeto nao ver tarefas so por existirem no projeto
- vincular tarefa ao projeto exigindo inicio e prazo
- selecionar predecessora valida no mesmo projeto
- tentar criar ciclo e receber erro claro
- remover predecessora existente com sucesso
- reordenar tarefas do projeto e manter ordem ao recarregar
- visualizar dependencias no Gantt
- exportar projeto especifico em `XLSX`
- exportar projeto especifico em `PDF`
- exportar visao consolidada `Todos`
- validar que `ARQUIVADA` e `CANCELADA` continuam fora do Gantt por padrao
- validar que `CONCLUIDA` continua visivel no historico do cronograma
- validar que painel e intranet respeitam seus respectivos escopos de visibilidade
