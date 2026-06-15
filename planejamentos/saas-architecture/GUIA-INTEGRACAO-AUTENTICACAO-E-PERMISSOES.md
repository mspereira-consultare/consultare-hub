# Guia de Integracao - Autenticacao, Usuarios e Permissoes

## Objetivo

Este documento resume como o `consultare-hub` funciona hoje em autenticacao, sessao, usuarios, papeis e permissoes, para que outro sistema possa adotar o mesmo padrao de integracao.

O foco aqui e o estado atual implementado no projeto, nao um desenho ideal futuro. Onde houver limitacoes para o cenario multi-tenant, elas estao destacadas.

---

## Resumo executivo

Hoje o padrao do projeto e:

- autenticacao via `NextAuth` com `CredentialsProvider`;
- login validado direto na tabela central `users`;
- senha armazenada em `bcrypt`;
- sessao em `JWT`;
- cookie de sessao compartilhavel entre apps;
- autorizacao baseada em uma matriz por usuario e por pagina;
- matriz final resolvida como `defaults do role + overrides persistidos em user_page_permissions`;
- checagem de acesso feita tanto na UI quanto no backend;
- mesma base de usuarios sendo usada pelo `apps/painel` e pelo `apps/intranet`.

Em termos praticos: o "mesmo login em varios sistemas" hoje acontece porque os apps compartilham a mesma base de usuarios, o mesmo segredo do NextAuth e o mesmo cookie de sessao.

---

## Como a autenticacao funciona hoje

### Fonte de verdade do login

O login consulta a tabela `users`.

Campos usados diretamente na autenticacao:

- `id`
- `username`
- `email`
- `password`
- `role`
- `department`
- `status`

Regras atuais de login:

- o usuario pode autenticar por `username` ou `email`;
- a busca prioriza `username` quando houver coincidencia;
- o usuario precisa estar com `status = 'ATIVO'`;
- a senha e comparada com `bcrypt.compare(...)`;
- ao logar, o sistema atualiza `last_access`.

Arquivos principais:

- `apps/painel/src/app/api/auth/[...nextauth]/route.ts`
- `apps/intranet/src/app/api/auth/[...nextauth]/route.ts`

### Estrategia de sessao

A sessao usa `JWT` no NextAuth.

Configuracao compartilhada:

- `session.strategy = 'jwt'`
- `maxAge = 30 dias`
- cookie padrao: `consultare_hub_session`

Arquivo principal:

- `packages/core/src/auth.ts`

### Cookie compartilhado entre apps

O compartilhamento entre sistemas depende destes pontos:

- mesmo `NEXTAUTH_SECRET`;
- mesmo nome de cookie: `consultare_hub_session`;
- mesmo `AUTH_COOKIE_DOMAIN` quando os apps estiverem em subdominios do mesmo dominio;
- mesma estrategia de sessao;
- todos os apps lendo a mesma base de usuarios e a mesma base de permissoes.

Exemplo de configuracao esperada entre apps:

```env
NEXTAUTH_SECRET=...
AUTH_COOKIE_DOMAIN=.seudominio.com
```

Observacao:

- `NEXTAUTH_URL` ou `AUTH_URL` e normalizado para `origin` antes de iniciar o NextAuth;
- isso evita alguns erros de configuracao de URL.

---

## Claims que entram na sessao/JWT

A sessao padrao do projeto carrega estes campos customizados:

- `id`
- `role`
- `department`
- `permissions`
- `username`

Na pratica, o JWT e reidratado com permissoes atualizadas sempre que possivel. Isso reduz o risco de um usuario continuar navegando com permissoes antigas depois de uma alteracao.

Tipos declarados em:

- `apps/painel/src/types/next-auth.d.ts`

Formato logico da sessao:

```ts
session.user = {
  id: string;
  name?: string;
  email?: string;
  username?: string;
  role?: string;
  department?: string;
  permissions?: PermissionMatrix;
}
```

---

## Como a autorizacao funciona

## Conceito central

A autorizacao nao e apenas por role.

O role define um pacote base, mas o acesso final do usuario vem de uma matriz por pagina:

- `view`
- `edit`
- `refresh`

Ou seja:

`permissao efetiva = defaults do role + overrides salvos para aquele usuario`

Arquivo central:

- `packages/core/src/permissions.ts`

### Acoes suportadas

- `view`: visualizar pagina e consumir leitura relacionada
- `edit`: criar, editar, aprovar, excluir ou alterar dados
- `refresh`: disparar atualizacao manual de jobs/workers

### Estrutura da matriz

Cada `PageKey` tem:

```ts
type PagePermission = {
  view: boolean;
  edit: boolean;
  refresh: boolean;
}
```

---

## Roles atuais

Roles implementados hoje:

- `ADMIN`
- `GESTOR`
- `OPERADOR`
- `INTRANET`

### 1. `ADMIN`

- acesso total a todas as paginas e acoes.

### 2. `GESTOR`

- acesso amplo de backoffice;
- inclui varios modulos operacionais, financeiros, qualidade, marketing e administracao da intranet;
- nao recebe acesso total automatico a tudo, mas o pacote base e extenso.

### 3. `OPERADOR`

- acesso operacional mais restrito;
- varios modulos ficam apenas com `view`;
- poucos pontos recebem `edit` e `refresh`.

### 4. `INTRANET`

Este role e importante porque nao representa administrador da intranet. Ele representa o colaborador comum que precisa acessar o portal e um pacote minimo de modulos.

Bundle base atual do `INTRANET`:

- `intranet_portal`: `view`
- `intranet_tarefas`: `view`, `edit`
- `propostas`: `view`, `edit`, `refresh`
- `propostas_pos_consulta`: `view`, `edit`, `refresh`
- `metas_dashboard`: `view`, `refresh`

Ponto importante:

- `intranet_portal` e uma permissao propria para abrir `/intranet`;
- ela nao depende de `dashboard` nem de `gestao`.

---

## Paginas e permissoes

O sistema mapeia rotas para um `PageKey`. Alguns exemplos importantes:

| PageKey | Rota principal |
| --- | --- |
| `intranet_portal` | `/intranet` |
| `dashboard` | `/dashboard` |
| `financeiro` | `/financeiro` |
| `propostas` | `/propostas` |
| `propostas_pos_consulta` | `/propostas/pos-consulta` |
| `repasses` | `/repasses` |
| `metas_dashboard` | `/metas/dashboard` |
| `metas` | `/metas` |
| `colaboradores` | `/colaboradores` |
| `recrutamento` | `/recrutamento` |
| `intranet_dashboard` | `/gestao` |
| `intranet_tarefas` | `/tarefas` |
| `intranet_chat` | `/gestao/chat` |
| `intranet_chatbot` | `/gestao/chatbot` |
| `users` | `/users` |
| `settings` | `/settings` |

Fonte de verdade:

- `packages/core/src/permissions.ts`

Esse mesmo arquivo tambem faz o mapeamento de varias rotas de API para `PageKey`.

Exemplos:

- `/api/admin/repasses*` -> `repasses`
- `/api/admin/users*` -> `users`
- `/api/admin/propostas/pos-consulta*` -> `propostas_pos_consulta`
- `/api/tasks*` -> `intranet_tarefas`

---

## Como a permissao e resolvida em runtime

### 1. Defaults por role

Quando o sistema precisa montar a matriz de um usuario, ele primeiro gera os defaults do role:

- `getDefaultMatrixByRole(role)`

### 2. Overrides persistidos

Depois ele consulta `user_page_permissions` para aquele `user_id`.

Cada linha encontrada sobrescreve a permissao base daquela pagina.

### 3. Resultado final

O resultado final e a matriz efetiva usada em:

- JWT
- sessao
- menu
- paginas
- APIs

Importante:

- se o usuario nao tiver nenhuma linha em `user_page_permissions`, ele continua funcionando com o pacote default do role;
- ou seja, a tabela de permissoes personalizadas complementa o role, ela nao e obrigatoria para o login funcionar.

---

## Persistencia em banco

## Tabela `users`

Tabela central de autenticacao e cadastro de usuarios.

Campos principais:

- `id` `varchar`
- `name`
- `email`
- `username`
- `password`
- `role`
- `department`
- `status`
- `last_access`
- `employee_id`

Regras relevantes:

- `username` deve ser unico;
- `employee_id` tambem e tratado como unico quando houver vinculo com colaborador;
- `password` guarda hash `bcrypt`;
- `status` controla se o login pode ocorrer;
- `employee_id` e opcional e liga o usuario a `employees.id`.

Referencias:

- `apps/painel/src/app/api/admin/users/route.ts`
- `packages/core/src/user_accounts.ts`
- `apps/painel/docs/database/03-dicionario-de-dados-mysql.md`

## Tabela `user_page_permissions`

Tabela central de autorizacao por usuario e pagina.

Estrutura:

- `user_id`
- `page_key`
- `can_view`
- `can_edit`
- `can_refresh`
- `updated_at`

Chave primaria composta:

- `(user_id, page_key)`

Comportamento:

- um usuario pode ter uma linha por `PageKey`;
- `saveUserPermissionMatrix(...)` faz upsert;
- `loadUserPermissionMatrix(...)` monta a matriz final a partir do role + overrides.

Arquivo central:

- `packages/core/src/permissions_server.ts`

---

## Como o painel protege acesso

No `apps/painel`, a camada principal de guarda e o `proxy.ts`.

Fluxo:

1. le o JWT com `getToken(...)`;
2. identifica a rota acessada;
3. converte rota em `PageKey` com `getPageFromPath(...)`;
4. decide a acao:
   - `GET`, `HEAD`, `OPTIONS` -> `view`
   - outros metodos -> `edit`
5. chama `hasPermission(...)`;
6. se negar:
   - API retorna `401` ou `403`
   - pagina faz redirect para a primeira pagina permitida.

Excecoes importantes:

- `/api/admin/refresh` exige que o usuario tenha pelo menos algum `refresh`;
- `/api/admin/goals/dashboard` aceita `metas_dashboard` ou `metas`.

Arquivo principal:

- `apps/painel/src/proxy.ts`

### Landing page padrao

Quando o usuario entra no sistema, o redirecionamento inicial usa:

- `getDefaultLandingPath(permissions, role)`

Para `INTRANET`, a ordem de preferencia atual e:

1. `/intranet`
2. `/tarefas`
3. `/propostas/pos-consulta`
4. `/propostas`
5. `/metas/dashboard`

Para os demais, o primeiro alvo preferencial e `/dashboard`.

Ponto importante:

- ao alterar bundles ou pagina inicial, alinhar ao mesmo tempo:
  - `apps/painel/src/proxy.ts`
  - `apps/painel/src/app/(auth)/login/page.tsx`
  - `apps/painel/src/app/(admin)/ajuda/layout.tsx`

---

## Como a intranet protege acesso

No `apps/intranet`, o padrao e um pouco diferente:

- nao depende do `proxy.ts` do painel;
- usa `getServerSession(authOptions)` nas paginas e APIs;
- recarrega a matriz com `loadUserPermissionMatrix(...)`;
- valida acesso por helper server-side.

Helpers principais:

- `apps/intranet/src/lib/intranet/auth.ts`
- `apps/intranet/src/lib/intranet/tasks-auth.ts`

Exemplos:

- `requireIntranetPermission(pageKey, action)`
- `requireAnyIntranetPermission(pageKeys, action)`

Isso significa que outro sistema pode seguir um dos dois modelos:

- modelo tipo painel: guard central por rota no middleware/proxy;
- modelo tipo intranet: guard server-side por pagina/API.

O mais importante nao e qual dos dois estilos usar, e sim manter:

- a mesma sessao;
- a mesma base `users`;
- a mesma resolucao de matriz;
- a mesma semantica de `view`, `edit` e `refresh`.

---

## Administracao de usuarios e permissoes

## Cadastro de usuario

O painel tem API administrativa para CRUD de usuarios:

- `GET /api/admin/users`
- `POST /api/admin/users`
- `DELETE /api/admin/users?id=...`

Comportamentos importantes:

- cria usuario com `id` UUID;
- hash de senha via `bcrypt`;
- valida unicidade;
- permite vinculo opcional com `employee_id`;
- impede dois usuarios diferentes apontando para o mesmo colaborador.

Arquivo:

- `apps/painel/src/app/api/admin/users/route.ts`

## Edicao de permissoes

API administrativa:

- `GET /api/admin/users/permissions?userId=...`
- `POST /api/admin/users/permissions`

Regras:

- exige permissao `users:view` para leitura;
- exige permissao `users:edit` para gravacao;
- a tela de usuarios carrega a matriz atual e salva o estado completo do usuario.

Arquivos:

- `apps/painel/src/app/api/admin/users/permissions/route.ts`
- `apps/painel/src/app/(admin)/users/page.tsx`

Ponto importante:

- o projeto possui uma tela administrativa bem completa para overrides por usuario;
- isso mostra que o role sozinho nao e tratado como fonte unica de autorizacao.

---

## Menu, UI e backend usam a mesma matriz

A mesma matriz de permissoes e aplicada em varios niveis:

- menu lateral do painel;
- redirects de login;
- acesso a paginas;
- acesso a APIs;
- exibicao de areas administrativas da intranet;
- controles de acao como editar, refresh, governanca e afins.

Arquivos exemplares:

- `apps/painel/src/components/layout/Sidebar.tsx`
- `apps/painel/src/app/(admin)/ajuda/layout.tsx`
- `apps/intranet/src/app/(site)/layout.tsx`

Recomendacao para o outro sistema:

- nao use a role como unico criterio de UI;
- consuma a matriz resolvida e derive o menu e as acoes a partir dela.

---

## O que o outro sistema precisa seguir para integrar no mesmo padrao

Se o objetivo for "mesmo login e mesma politica centralizada", o outro sistema deve:

1. Autenticar contra a mesma tabela `users`.
2. Validar senha com `bcrypt`.
3. Usar o mesmo `NEXTAUTH_SECRET`.
4. Usar o mesmo nome de cookie de sessao (`consultare_hub_session`).
5. Configurar `AUTH_COOKIE_DOMAIN` para compartilhamento entre subdominios, se aplicavel.
6. Carregar `id`, `role`, `department`, `username` e `permissions` na sessao.
7. Resolver permissoes com a mesma logica:
   - defaults do role
   - overlay de `user_page_permissions`
8. Mapear as rotas locais do sistema dele para `PageKey`s conhecidos ou novos `PageKey`s compartilhados.
9. Validar permissao no backend, nao apenas na interface.
10. Definir uma landing page a partir de `getDefaultLandingPath(...)` ou equivalente.

Se o outro sistema precisar de modulos proprios, o ideal e:

- adicionar novos `PageKey`s compartilhados;
- incluir esses `PageKey`s no catalogo central;
- decidir os defaults por role;
- persistir overrides da mesma forma em `user_page_permissions`.

---

## Padrao recomendado para novos modulos/sistemas

Para manter consistencia com o que ja existe:

### 1. Catalogo central de permissoes

Manter um catalogo central com:

- `page_key`
- label
- rota principal
- semantica das acoes

Hoje isso esta em:

- `packages/core/src/permissions.ts`

### 2. Resolucao central

Todo sistema deve depender de uma unica biblioteca ou servico para:

- `getDefaultMatrixByRole`
- `sanitizeMatrix`
- `hasPermission`
- `getDefaultLandingPath`
- `getPageFromPath`
- `loadUserPermissionMatrix`
- `saveUserPermissionMatrix`

### 3. Backend primeiro

Mesmo que a UI esconda menu ou botao, a API do sistema precisa validar permissao de novo.

### 4. Separar role de permissao efetiva

Role deve continuar sendo bundle base, nao a autorizacao final.

---

## Limitacoes atuais para o cenario multi-tenant

Hoje o modelo ainda e single-tenant do ponto de vista de IAM.

O que existe hoje:

- um diretorio unico de usuarios;
- uma matriz global por usuario;
- roles globais;
- `PageKey`s globais;
- sessao sem contexto explicito de tenant.

O que ainda nao existe neste modelo:

- `tenant_id` na sessao;
- membership por tenant;
- overrides de permissao por tenant;
- role por tenant;
- isolamento de acesso por cliente;
- catalogo de produtos por tenant.

Entao, para o outro dev, e importante entender:

- ele consegue aderir ao mesmo padrao de login e permissao hoje;
- mas, se o plano e comercializar os produtos como multi-tenant, a camada atual ainda precisa evoluir para suportar contexto de tenant.

Em outras palavras:

- o que ja existe resolve autenticacao centralizada e autorizacao compartilhada;
- o que ainda falta e transformar isso em IAM multi-tenant de fato.

---

## Evolucao natural para multi-tenant

Sem mudar a base conceitual, a evolucao natural seria:

1. manter `users` como diretorio central;
2. criar tabela de memberships por tenant;
3. mover role para o contexto de membership, nao do usuario global;
4. tornar `user_page_permissions` tenant-aware;
5. incluir `tenant_id` e `memberships` na sessao/token;
6. permitir que cada sistema valide:
   - quem e o usuario
   - em qual tenant ele esta
   - quais modulos daquele tenant ele pode acessar

Mas isso ja e um passo acima do que esta implementado hoje.

---

## Observacoes operacionais importantes

- Hoje nao ha evidencia de SSO externo com IdP tipo Auth0, Cognito, Entra ID ou Keycloak. O login e local via credenciais.
- O mesmo padrao de login entre apps depende de compartilhar o cookie e o backend de usuarios, nao de federacao externa.
- O projeto ja aceita MySQL e Turso/libSQL na camada de abstracao, mas o modelo de auth/permissao e o mesmo nos dois casos.
- `seedPermissionDefaults(...)` existe, mas os defaults tambem sao aplicados em runtime mesmo sem linhas persistidas.
- Quando o bundle default de um role muda, usuarios antigos podem precisar de backfill explicito se ja houver linhas personalizadas em `user_page_permissions`.

---

## Arquivos mais importantes para o outro dev revisar

### Nucleo compartilhado

- `packages/core/src/auth.ts`
- `packages/core/src/permissions.ts`
- `packages/core/src/permissions_server.ts`
- `packages/core/src/user_accounts.ts`

### Painel

- `apps/painel/src/app/api/auth/[...nextauth]/route.ts`
- `apps/painel/src/proxy.ts`
- `apps/painel/src/app/(auth)/login/page.tsx`
- `apps/painel/src/app/api/admin/users/route.ts`
- `apps/painel/src/app/api/admin/users/permissions/route.ts`
- `apps/painel/src/components/layout/Sidebar.tsx`

### Intranet

- `apps/intranet/src/app/api/auth/[...nextauth]/route.ts`
- `apps/intranet/src/lib/intranet/auth.ts`
- `apps/intranet/src/lib/intranet/tasks-auth.ts`
- `apps/intranet/src/app/(site)/layout.tsx`

### Documentacao complementar

- `apps/painel/docs/02-matriz-de-permissoes.md`
- `apps/painel/docs/database/03-dicionario-de-dados-mysql.md`
- `planejamentos/saas-architecture/PROPOSTA-IAM-COMPARTILHADO.md`

---

## Recomendacao final para a integracao

Se o objetivo imediato e colocar o outro sistema "no mesmo padrao do meu":

- compartilhar a base `users`;
- compartilhar a base `user_page_permissions`;
- compartilhar o segredo e o cookie de sessao;
- reaproveitar a biblioteca central de permissoes;
- mapear as rotas do novo sistema para permissoes centralizadas;
- validar tudo no backend.

Se o outro sistema nao usar Next.js/NextAuth:

- ele nao precisa copiar a implementacao literalmente;
- mas precisa respeitar o mesmo contrato de identidade, senha, role, matriz de permissoes e validacao server-side;
- se nao houver compatibilidade real de sessao/cookie entre stacks, o melhor caminho e centralizar o login em um servico comum, em vez de tentar reproduzir parcialmente o cookie do NextAuth.

Se o objetivo ja for nascer pronto para produto multi-tenant:

- vale manter esse padrao como base;
- mas ja projetando membership por tenant, role por tenant e permissoes por tenant, porque isso ainda nao esta resolvido no modelo atual.
