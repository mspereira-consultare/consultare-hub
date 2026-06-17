# Blueprint — Permissões e Módulos Funcionais

## Modelo Atual Refatorado

O painel atual permanece single-tenant. A autorização efetiva passa a ser lida como:

```txt
Usuário autenticado
+ perfil de acesso atribuído
  ou fallback do role legado
+ overrides individuais em user_page_permissions
= permissão efetiva por página e ação
```

A autorização comercial por módulo contratado não existe neste projeto.

## Fonte da Verdade

- Identidade: `users`.
- Vínculo operacional: `users.employee_id -> employees.id`.
- Catálogo de páginas/permissões: `packages/core/src/permissions.ts`.
- Perfil herdado: `access_profiles` + `access_profile_permissions`.
- Perfil atribuído: `user_access_profile_assignments`.
- Override individual: `user_page_permissions`.
- Escopo executivo: governança própria em `dashboard_executive_*`.

## Perfis de Acesso

Perfis de sistema iniciais:

- `ADMIN`;
- `GESTOR`;
- `OPERADOR`;
- `INTRANET`.

Esses perfis espelham os defaults atuais de `getDefaultMatrixByRole`.

Regra de evolução:

- não editar destrutivamente perfil de sistema;
- criar clone para customização;
- atribuir perfil customizado ao usuário;
- manter overrides individuais apenas para exceções.

## Módulos Funcionais

Módulos centralizados no core:

- Principal;
- Operações;
- Gestão de Pessoas;
- Qualidade;
- Financeiro;
- Inteligência;
- Marketing;
- Intranet;
- Sistema.

Cada `PageKey` possui:

- módulo funcional;
- rota principal;
- superfície: `painel`, `intranet` ou `compartilhado`;
- criticidade: `standard`, `sensitive` ou `critical`.

## Ações

A matriz atual suporta:

- `view`;
- `edit`;
- `refresh`.

Essa granularidade deve ser preservada até existir necessidade real de novas ações como `delete`, `export` ou `manage`.

## Intranet

Separações obrigatórias:

- `intranet_portal`: abre `/intranet`;
- `intranet_dashboard`: administra `/gestao`;
- `dashboard`: abre o dashboard do painel.

Pacote mínimo de colaborador `INTRANET`:

- `intranet_portal.view`;
- `intranet_tarefas.view/edit`;
- `propostas.view/edit/refresh`;
- `propostas_pos_consulta.view/edit/refresh`;
- `metas_dashboard.view/refresh`.

Backfills devem ser idempotentes e preservar permissões maiores já concedidas.

## Dashboard Executivo

Separação de responsabilidades:

- `dashboard.view`: acesso ao dashboard;
- `dashboard_executive_governance.view/edit`: acesso à governança/configuração.

A visão final do dashboard não é decidida pela matriz genérica. Ela depende de:

- colaborador vinculado;
- cargo mestre;
- grupo executivo;
- perfil executivo;
- exceção individual.

Essa governança continua em `/dashboard-executivo`.

## Checklist para Nova Página Protegida

1. Adicionar `PageKey`.
2. Adicionar entrada em `PAGE_DEFS` com módulo, superfície e criticidade.
3. Mapear rota/API em `getPageFromPath`.
4. Ajustar defaults de perfil/role em `getDefaultMatrixByRole`.
5. Garantir bloqueio no `proxy`.
6. Garantir validação server-side no handler ou wrapper do módulo.
7. Conferir se a página aparece corretamente em `/users`.
8. Documentar se o módulo é candidato a venda separada no SaaS futuro.

## Ponte para SaaS Futuro

No SaaS futuro, este blueprint pode virar referência para:

- módulos comerciais;
- pacotes de permissões;
- perfis por tenant;
- combinação entre módulo contratado e permissão do usuário.

O painel atual não deve receber:

- `tenantId`;
- `organizationId`;
- billing;
- planos;
- assinaturas;
- entitlements comerciais.
