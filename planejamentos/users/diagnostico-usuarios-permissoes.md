# Diagnóstico — Usuários, Acessos e Permissões

## Estado Atual

O projeto já possui uma base compartilhada de autenticação e permissões:

- `packages/core/src/auth.ts`
  - define cookie compartilhado `consultare_hub_session`;
  - centraliza opções de cookie e duração de sessão.
- `packages/core/src/permissions.ts`
  - define `UserRole`, `PageKey`, `PermissionAction` e `PermissionMatrix`;
  - define defaults por `role`;
  - mapeia rota/API para `PageKey`;
  - resolve landing page padrão.
- `packages/core/src/permissions_server.ts`
  - cria e consulta `user_page_permissions`;
  - resolve matriz efetiva do usuário;
  - agora também cria perfis de acesso v1 compatíveis.
- `apps/painel/src/proxy.ts`
  - bloqueia páginas e APIs conhecidas no painel;
  - usa `getPageFromPath` e `hasPermission`.
- `apps/painel/src/components/layout/Sidebar.tsx`
  - monta menu a partir da sessão e da matriz de permissões.
- `apps/intranet/src/lib/intranet/auth.ts`
  - valida permissões server-side da administração da Intranet.

## Tabelas e Relações

### Usuários e sessão

- `users`
  - identidade central do painel e da Intranet;
  - campos relevantes: `id`, `name`, `email`, `username`, `password`, `role`, `department`, `status`, `employee_id`.
- `employees`
  - cadastro oficial de colaboradores;
  - vínculo lógico com usuário por `users.employee_id`.
- `employee_departments` e `employee_job_titles`
  - catálogos mestres usados pelo cadastro de colaboradores;
  - `employee_job_titles.executive_group_id` alimenta a governança do dashboard executivo.

### Permissões

- `user_page_permissions`
  - matriz persistida por usuário e página;
  - chave primária: `(user_id, page_key)`;
  - ações: `can_view`, `can_edit`, `can_refresh`;
  - agora tratada como override explícito quando houver perfil de acesso.
- `access_profiles`
  - perfis de acesso v1;
  - perfis de sistema iniciais: `ADMIN`, `GESTOR`, `OPERADOR`, `INTRANET`.
- `access_profile_permissions`
  - matriz herdada por perfil.
- `user_access_profile_assignments`
  - perfil primário atribuído ao usuário.
- `access_permission_audit_log`
  - log técnico para alterações de perfil/permissões.

### Dashboard executivo

- `dashboard_executive_profiles`;
- `dashboard_executive_widgets`;
- `dashboard_executive_profile_widgets`;
- `dashboard_executive_groups`;
- `dashboard_executive_user_exceptions`;
- `dashboard_executive_scopes`;
- `dashboard_executive_snapshots`.

Essas tabelas não devem ser absorvidas por `/users`; elas continuam definindo a visão executiva fina.

## Consumidores Principais

- Painel:
  - `apps/painel/src/proxy.ts`;
  - `apps/painel/src/components/layout/Sidebar.tsx`;
  - wrappers em `apps/painel/src/lib/*/auth.ts`;
  - páginas que chamam `hasPermission` diretamente.
- Intranet:
  - login NextAuth próprio com cookie compartilhado;
  - `apps/intranet/src/lib/intranet/auth.ts`;
  - `apps/intranet/src/lib/intranet/tasks-auth.ts`;
  - chat, busca e áreas de gestão.
- Usuários:
  - `apps/painel/src/app/(admin)/users/page.tsx`;
  - `/api/admin/users`;
  - `/api/admin/users/options`;
  - `/api/admin/users/permissions`;
  - `/api/admin/users/executive-scope`.
- Dashboard executivo:
  - `/dashboard`;
  - `/dashboard-executivo`;
  - `/api/admin/dashboard/executive/*`;
  - `apps/painel/src/lib/dashboard_executive/*`.

## Riscos Encontrados

- `role` legado ainda aparece em menu, telas e regras server-side.
- Parte das APIs administrativas dependia demais do `proxy`.
- `/users` tinha agrupamento visual local de permissões, duplicando conhecimento do core.
- Permissões por usuário eram salvas como matriz completa, dificultando distinguir herança de exceção.
- O dashboard executivo possui regra fina própria; misturá-la com a matriz genérica geraria ambiguidade.
- Usuários `INTRANET` exigem cuidado para preservar pacote básico e não confundir portal com `/dashboard`.

## Ordem Segura de Migração

1. Catalogar módulos e páginas no core.
2. Endurecer APIs críticas com helper server-side.
3. Introduzir perfis v1 com fallback por `role`.
4. Tratar `user_page_permissions` como override explícito.
5. Atualizar `/users` para mostrar herança e overrides.
6. Validar Intranet e dashboard executivo.
7. Documentar blueprint para manutenção e SaaS futuro.

## Decisões de Compatibilidade

- `role` continua existindo.
- Usuário sem perfil atribuído usa perfil padrão do `role`.
- `user_page_permissions` continua sendo respeitada.
- Perfis de sistema são protegidos conceitualmente; customização deve ser feita por clone.
- Multi-tenancy, billing e planos comerciais ficam fora deste repositório.
