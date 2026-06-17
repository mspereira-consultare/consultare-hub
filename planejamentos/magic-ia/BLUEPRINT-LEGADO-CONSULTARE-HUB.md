# Blueprint do Legado - consultare-hub

## Visao geral

O `consultare-hub` e um monorepo operacional da Consultare. Ele concentra painel administrativo, intranet, portal de colaborador, pacotes compartilhados e workers Python.

Hoje ele resolve uma operacao single-tenant da Consultare:

- usuarios internos autenticados por NextAuth;
- permissoes por matriz de paginas e acoes;
- MySQL Railway como persistencia principal;
- workers Python alimentando tabelas de dominio;
- Feegow, Clinia, Google Ads, GA4, MailerSend, OpenAI, Indeed e S3 como dependencias externas;
- dashboards, operacao, RH, financeiro, marketing, qualidade, intranet e tarefas no mesmo ecossistema.

Ele nao possui conceito estrutural de `tenant_id`, contrato comercial por modulo, assinatura, tenant membership ou escopo de dados por cliente.

## Estrutura de apps

### `apps/painel`

App principal de administracao e operacao.

Responsabilidades:

- login administrativo;
- sidebar e layout gerencial;
- paginas administrativas em `src/app/(admin)`;
- APIs em `src/app/api/admin`;
- APIs de fila em `src/app/api/queue`;
- webhook MailerSend de repasses;
- proxy de autorizacao por pagina;
- componentes de UI especificos do painel;
- bibliotecas locais de dominio em `src/lib`.

Paginas administrativas principais:

- `/dashboard`
- `/monitor`
- `/financeiro`
- `/contratos`
- `/propostas`
- `/propostas/pos-consulta`
- `/propostas/gerencial`
- `/repasses`
- `/repasses/envios-fechamento`
- `/marketing/controle`
- `/marketing/funil`
- `/colaboradores`
- `/folha-pagamento`
- `/recrutamento`
- `/equipamentos`
- `/equipamentos/os`
- `/agenda-ocupacao`
- `/metas`
- `/metas/dashboard`
- `/produtividade`
- `/agendamentos`
- `/profissionais`
- `/profissionais/mapas`
- `/qualidade/documentos`
- `/qualidade/vigilancia-sanitaria`
- `/qualidade/treinamentos`
- `/qualidade/auditorias`
- `/checklist-crc`
- `/checklist-recepcao`
- `/intranet`
- `/intranet/chatbot`
- `/dashboard-executivo`
- `/dashboard-executivo/tarefas`
- `/modelos-contrato`
- `/users`
- `/settings`
- `/ajuda`

APIs administrativas relevantes:

- `/api/admin/users/*`
- `/api/admin/dashboard/executive/*`
- `/api/admin/colaboradores/*`
- `/api/admin/profissionais/*`
- `/api/admin/propostas/*`
- `/api/admin/repasses/*`
- `/api/admin/marketing/*`
- `/api/admin/folha-pagamento/*`
- `/api/admin/recrutamento/*`
- `/api/admin/qms/*`
- `/api/admin/vigilancia-sanitaria/*`
- `/api/admin/equipamentos/*`
- `/api/admin/tasks/*`
- `/api/admin/task-projects/*`
- `/api/admin/intranet/*`
- `/api/admin/settings`
- `/api/admin/status`
- `/api/admin/refresh`

### `apps/intranet`

App separado para experiencia de intranet.

Responsabilidades:

- login usando a mesma base `users`;
- cookie compartilhado `consultare_hub_session`;
- consumo de conteudo institucional e operacional;
- busca;
- FAQ;
- paginas dinamicas;
- catalogo de servicos, consultas, exames e procedimentos;
- chat interno;
- chatbot com conhecimento indexado;
- tarefas e projetos;
- area `/gestao` para administracao editorial da intranet.

Paginas principais:

- `/login`
- `/`
- `/busca`
- `/faq`
- `/ia`
- `/chat`
- `/tarefas`
- `/gestao`
- `/gestao/[module]`
- `/servicos/consultas`
- `/servicos/exames`
- `/servicos/procedimentos`
- paginas dinamicas por slug.

APIs principais:

- `/api/auth/[...nextauth]`
- `/api/search`
- `/api/chat/*`
- `/api/chatbot/*`
- `/api/notifications/*`
- `/api/tasks/*`
- `/api/task-projects/*`
- `/api/admin/intranet/*`
- `/api/intranet/assets/*`
- `/api/qms/documents/*`

### `apps/portal-colaborador`

Portal externo para coleta de dados e documentos de colaboradores.

Responsabilidades:

- acesso por token, CPF e data de nascimento;
- sessao propria por cookie de portal;
- exibicao de dados do colaborador;
- envio de dados pessoais;
- upload de documentos;
- submissao para revisao do RH;
- consulta de acesso a intranet.

APIs:

- `POST /api/auth`
- `POST /api/logout`
- `GET /api/me`
- `GET /api/intranet-access`
- `POST /api/submission/personal`
- `POST /api/submission/documents`
- `DELETE /api/submission/documents/[documentId]`
- `POST /api/submission/submit`

## Pacotes compartilhados

### `packages/core`

Pacote central do monorepo.

Responsabilidades atuais:

- `auth`: cookie compartilhado, paths de login e max age;
- `db`: adaptador MySQL/Turso com compatibilidade SQL;
- `permissions`: catalogo de paginas, roles, matriz e landing path;
- `permissions-server`: persistencia de permissoes, perfis e overrides;
- `user_accounts`: utilidades de contas;
- `storage`: provider S3;
- `colaboradores`: contratos e repositorio do portal;
- `employee_portal`: autenticacao e repositorio do portal colaborador;
- `intranet`: catalogo, chatbot, notificacoes e repositorio;
- `tasks`: tarefas, projetos, Gantt, exportacao e tipos.

### `packages/ui`

Existe como pacote de UI compartilhada, mas o legado ainda concentra grande parte dos componentes dentro dos apps.

Para o Magic IA, este pacote deve virar design system real, permission-aware e tenant-aware.

## Autenticacao e autorizacao atuais

### Sessao

- NextAuth Credentials Provider.
- Usuario vem da tabela `users`.
- Login aceita username ou email.
- Senha validada com bcrypt.
- Sessao JWT com validade de 30 dias.
- Cookie compartilhado: `consultare_hub_session`.
- `AUTH_COOKIE_DOMAIN` permite compartilhamento entre subdominios.

Campos carregados na sessao:

- `id`
- `name`
- `email`
- `username`
- `role`
- `department`
- `permissions`

### Roles

Roles atuais:

- `ADMIN`
- `GESTOR`
- `OPERADOR`
- `INTRANET`

Esses roles ainda sao globais, nao tenant-scoped.

### Matriz de permissao

Permissoes usam:

- `PageKey`
- `view`
- `edit`
- `refresh`

A matriz base vem de `getDefaultMatrixByRole`.

A camada persistida usa:

- `user_page_permissions`
- `access_profiles`
- `access_profile_permissions`
- `user_access_profile_assignments`
- `access_permission_audit_log`

Resolucao atual:

1. perfil atribuido, quando existir;
2. fallback para role legado;
3. overlay de `user_page_permissions` como override por pagina;
4. matriz efetiva gravada no token/sessao.

### Protecoes

O `proxy` do painel:

- bloqueia usuarios sem token;
- redireciona login para primeira pagina permitida;
- mapeia pathname para `PageKey`;
- trata API `GET` como `view`;
- trata mutacoes como `edit`;
- trata `/api/admin/refresh` por qualquer permissao `refresh`.

Alguns modulos tambem possuem helpers server-side locais, como `requirePagePermission` e wrappers especificos por dominio.

## Banco de dados

Persistencia principal atual:

- MySQL no Railway.

Compatibilidade:

- Turso/SQLite ainda aparece como legado em adaptadores.
- SQL antigo e traduzido para MySQL em algumas camadas.

Tabelas tecnicas centrais:

- `users`
- `user_page_permissions`
- `access_profiles`
- `access_profile_permissions`
- `user_access_profile_assignments`
- `access_permission_audit_log`
- `system_status`
- `integrations_config`

`system_status` funciona como heartbeat e gatilho leve de refresh manual.

`integrations_config` armazena configuracoes sensiveis de integracoes e nao deve ser exposta diretamente.

## Fluxo operacional padrao

1. Worker Python coleta dado externo ou processa job.
2. Worker grava tabela de dominio ou tabela `raw/fact`.
3. Worker atualiza `system_status`.
4. API Next.js le tabelas locais.
5. Frontend renderiza cards, filtros, tabelas, detalhes e exports.
6. Refresh manual marca `system_status` ou cria job em tabela especifica.
7. Orquestrador detecta pendencia e executa worker.

Esse padrao aparece em financeiro, propostas, contratos, agenda, marketing, repasses, folha, intranet knowledge e recrutamento IA.

## Workers e orquestrador

O orquestrador principal fica em `workers/main.py`.

Ele sobe threads para:

- listener de refresh sob demanda;
- scheduler;
- monitor recepcao;
- monitor medico;
- ciclo Clinia;
- triagem IA de recrutamento;
- indexacao de conhecimento da intranet;
- fila serial de scrapers sensiveis;
- dispatcher de repasses;
- watchdog;
- healthcheck HTTP opcional.

Servicos conhecidos:

- `appointments`
- `patients_registry`
- `procedures_catalog`
- `professionals_sync`
- `faturamento`
- `comercial`
- `repasses`
- `repasse_consolidacao`
- `repasse_email`
- `contratos`
- `auth`
- `auth_clinia`
- `clinia`
- `monitor_medico`
- `monitor_recepcao`
- `agenda_occupancy`
- `payroll_point_import`
- `marketing_funnel`
- `clinia_ads`
- `intranet_knowledge_index`

## Limites estruturais do legado

Pontos que nao devem ser herdados como arquitetura do Magic IA:

- banco sem `tenant_id`;
- roles globais, nao por cliente;
- permissoes resolvidas sem membership de tenant;
- entitlements comerciais inexistentes;
- secrets globais e nao por tenant;
- workers sem envelope tenant-aware;
- caches sem chave de tenant;
- integracoes Feegow/Clinia acopladas a uma unica operacao;
- analytics e OLTP no mesmo banco principal;
- ausencia de onboarding formal de tenant;
- ausencia de IAM separado;
- ausencia de escopo de dados comercializavel por unidade, grupo, cargo, regiao ou modulo.

## O que deve ser reaproveitado conceitualmente

- Taxonomia funcional dos modulos.
- Aprendizado de UI operacional por area.
- Contratos de dominio ja amadurecidos.
- Separacao entre dados brutos, fatos e leitura gerencial.
- Uso de jobs e heartbeats para fluxos pesados.
- Auditorias por dominio.
- Catalogo de permissoes como fonte central.
- Experiencia da intranet como produto separado, mas compartilhando plataforma.
- Portal externo de colaborador como padrao de acesso de baixa friccao.
- Workers especializados por integracao e dominio.

