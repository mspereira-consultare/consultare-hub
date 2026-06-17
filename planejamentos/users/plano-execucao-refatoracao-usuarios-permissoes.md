# Plano de Execução em Sprints — Usuários, Acessos e Permissões

## Resumo

Este plano organiza a refatoração do modelo single-tenant atual de usuários, acessos e permissões sem implementar multi-tenancy, billing, planos comerciais ou módulos contratados.

A base atual confirmada é:

- autenticação via NextAuth credentials;
- cookie compartilhado `consultare_hub_session`;
- usuários na tabela `users`;
- permissões efetivas por `role` legado + matriz `user_page_permissions`;
- `PageKey`, `PermissionMatrix`, rotas e defaults em `packages/core/src/permissions.ts`;
- persistência em `packages/core/src/permissions_server.ts`;
- `proxy` como primeira barreira de página/API no painel;
- wrappers server-side por módulo;
- governança específica do dashboard executivo em `dashboard_executive_*`;
- Intranet consumindo a mesma sessão e a mesma matriz compartilhada.

Direção final:

- preservar comportamento atual;
- centralizar catálogo de módulos, páginas e ações;
- tornar herança de perfil e overrides explícitos;
- endurecer APIs sensíveis no backend;
- manter o dashboard executivo com governança própria;
- gerar documentação útil como blueprint para o SaaS futuro.

## Sprint 0 — Diagnóstico e inventário

Entregas:

- criar `planejamentos/users/diagnostico-usuarios-permissoes.md`;
- mapear tabelas e relações principais;
- catalogar consumidores de permissão no painel, Intranet, `proxy`, `Sidebar`, `/users`, `/dashboard-executivo`, `/colaboradores` e APIs administrativas;
- listar hardcodes, duplicidades e riscos;
- definir ordem segura de migração.

Critério de aceite:

- diagnóstico salvo;
- mapa de permissões atual revisável;
- riscos e compatibilidades explícitos;
- nenhuma mudança comportamental obrigatória nesta etapa.

## Sprint 1 — Catálogo central de módulos e páginas

Entregas:

- evoluir `packages/core/src/permissions.ts`;
- adicionar metadados centrais por `PageKey`:
  - módulo funcional;
  - superfície: `painel`, `intranet` ou `compartilhado`;
  - criticidade: `standard`, `sensitive` ou `critical`;
- expor helpers puros:
  - `getPermissionCatalog`;
  - `getPagesByModule`;
  - `getPageDefinition`;
  - `getPermissionModuleDefinition`;
- mover a lógica visual de agrupamento de `/users` para o catálogo central.

Compatibilidade:

- manter `getDefaultMatrixByRole`;
- manter `getPageFromPath`;
- manter `hasPermission`;
- manter landing path;
- manter `user_page_permissions`.

## Sprint 2 — Helper único de autorização e hardening de APIs

Entregas:

- criar `apps/painel/src/lib/authz.ts`;
- disponibilizar `requirePagePermission(pageKey, action)`;
- disponibilizar `requireAnyPagePermission([...])` para rotas de compatibilidade;
- aplicar validação explícita em:
  - `/api/admin/users`;
  - `/api/admin/users/options`;
  - `/api/admin/users/permissions`;
  - `/api/admin/users/executive-scope`;
- impedir remoção, rebaixamento ou inativação do último `ADMIN` ativo.

Princípio:

- o `proxy` continua como primeira barreira;
- APIs críticas passam a validar permissão no próprio handler.

## Sprint 3 — Perfis de acesso v1 com compatibilidade

Entregas:

- introduzir tabelas:
  - `access_profiles`;
  - `access_profile_permissions`;
  - `user_access_profile_assignments`;
  - `access_permission_audit_log`;
- semear perfis de sistema equivalentes aos defaults atuais:
  - `ADMIN`;
  - `GESTOR`;
  - `OPERADOR`;
  - `INTRANET`;
- resolver permissão efetiva como:

```txt
perfil atribuído
ou fallback do role legado
+ overrides por usuário em user_page_permissions
```

- manter payload legado de matriz de permissões aceito;
- criar script dry-run para comparar linhas explícitas contra o perfil herdado:
  - `npm run db:permissions:compare-profiles:dry --workspace apps/painel`.

Compatibilidade:

- usuários sem perfil atribuído continuam usando o default do `role`;
- `user_page_permissions` continua funcionando como camada de override.

## Sprint 4 — `/users` como central administrativa de acessos

Entregas:

- listar perfil efetivo e quantidade de overrides;
- exibir `role` legado como compatibilidade;
- reorganizar permissões por módulo funcional usando o catálogo central;
- mostrar herança do perfil versus overrides individuais;
- permitir restaurar herança por filtro, grupo ou página;
- salvar permissões como perfil + overrides.

Limite:

- `/users` mostra status/vínculo do dashboard executivo;
- configuração fina de grupos, cargos, perfis executivos e exceções continua em `/dashboard-executivo`.

## Sprint 5 — Alinhamento da Intranet e colaboradores

Entregas:

- manter `intranet_portal` separado de `dashboard` e `intranet_dashboard`;
- fazer Intranet consumir o resolvedor efetivo via `loadUserPermissionMatrix`;
- preservar o pacote `INTRANET` existente:
  - `intranet_portal`;
  - `intranet_tarefas`;
  - `propostas`;
  - `propostas_pos_consulta`;
  - `metas_dashboard`;
- usar backfills idempotentes apenas quando houver decisão operacional.

Validação manual:

- `/intranet`;
- `/tarefas`;
- `/gestao`;
- chatbot;
- busca;
- permissões editoriais.

## Sprint 6 — Fronteira com dashboard executivo

Regras preservadas:

- `dashboard` libera visualização do dashboard;
- `dashboard_executive_governance` libera governança/configuração;
- escopo executivo continua resolvido por colaborador, cargo, grupo executivo e exceção individual.

Entregas:

- manter `/api/admin/users/executive-scope` como compatibilidade de leitura;
- manter escrita bloqueada e orientada para `/dashboard-executivo`;
- documentar diferença entre permissão de acesso e escopo executivo.

## Sprint 7 — Documentação, auditoria e limpeza

Entregas:

- criar `planejamentos/users/PERMISSIONS-AND-MODULES-BLUEPRINT.md`;
- documentar modelo atual, perfis, módulos, páginas, ações, overrides, Intranet e dashboard executivo;
- marcar helpers antigos como compatibilidade quando necessário;
- consolidar checklist para novas páginas protegidas.

## Testes e validação

Comandos mínimos:

```bash
git diff --check
npm run lint --workspace apps/painel
npm run build --workspace apps/painel
npm run build --workspace apps/intranet
node --check apps/painel/scripts/compare-access-profiles-dry-run.cjs
```

Cenários manuais:

- admin com acesso total;
- gestor com áreas restritas;
- operador sem áreas administrativas;
- colaborador `INTRANET`;
- usuário sem colaborador vinculado;
- usuário com perfil herdado;
- usuário com override;
- acesso direto por URL;
- chamada direta de API protegida;
- `/users`;
- `/dashboard`;
- `/dashboard-executivo`;
- `/colaboradores`;
- `/intranet`;
- `/gestao`;
- `/tarefas`;
- propostas;
- metas.

## Assumptions

- O painel atual permanece single-tenant.
- `role` legado continua existindo por compatibilidade.
- `user_page_permissions` continua como camada de override.
- Overrides são tratados em granularidade de página.
- Não adicionar `tenantId`, `organizationId`, billing, planos comerciais ou entitlement contratado neste projeto.
