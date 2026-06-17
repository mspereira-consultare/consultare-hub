# Magic IA - Modelo Alvo Multi-Tenant

## Objetivo

O Magic IA deve transformar a operacao atual em um produto comercializavel, modular e multi-tenant.

A hierarquia alvo e:

```text
Plataforma Magic IA
  -> Tenant / Cliente
  -> Modulos contratados
  -> Unidades / Organizacoes
  -> Usuarios
  -> Perfis / Grupos
  -> Permissoes
  -> Escopo de dados
  -> Acesso final
```

## Principio central

No legado, acesso significa basicamente "usuario tem permissao para uma pagina".

No Magic IA, acesso final deve ser resultado de quatro decisoes independentes:

1. identidade: quem e o usuario;
2. entitlement: o tenant contratou o modulo;
3. autorizacao funcional: o usuario pode executar a acao;
4. escopo de dados: quais registros o usuario pode enxergar ou alterar.

## Entidades fundacionais

### Plataforma

Representa o produto Magic IA como ambiente global.

Responsabilidades:

- catalogo global de modulos;
- catalogo global de capabilities;
- super admin/support;
- billing gateway futuro;
- auditoria global;
- operacao de onboarding;
- status de integracoes por tenant.

### Tenant

Representa cliente/contrato comercial.

Campos conceituais:

- `tenant_id`
- `legal_name`
- `display_name`
- `slug`
- `status`
- `created_at`
- `onboarding_state`
- `data_region`
- `primary_contact`

Estados sugeridos:

- `PROVISIONING`
- `ACTIVE`
- `SUSPENDED`
- `CLOSING`
- `ARCHIVED`

### Modulos contratados

Representam entitlements comerciais.

Exemplos:

- `platform_admin`
- `bi_gestao`
- `comercial_atendimento`
- `financeiro`
- `marketing`
- `pessoas_rh`
- `operacao_clinica`
- `qualidade_regulatorio`
- `intranet`
- `tarefas_projetos`
- `feegow_bridge`

Contrato minimo:

- `tenant_id`
- `module_key`
- `status`
- `starts_at`
- `ends_at`
- `limits_json`
- `feature_flags_json`

Regra:

- entitlement e verificado no backend antes de qualquer permissao de usuario.

### Unidades / Organizacoes

Representam estrutura operacional do tenant.

Podem incluir:

- unidade clinica;
- matriz;
- filial;
- centro de custo;
- marca;
- departamento;
- regiao;
- area operacional.

Contrato minimo:

- `tenant_id`
- `org_unit_id`
- `parent_id`
- `type`
- `name`
- `external_refs`
- `status`

### Usuarios

No Magic IA, usuario deve ser identidade global ou IAM externo, com membership por tenant.

Contratos:

- `identity_user`: pessoa autenticavel;
- `tenant_membership`: vinculo do usuario com tenant;
- `tenant_member_status`: ativo, convidado, suspenso;
- `employee_link`: vinculo opcional com colaborador interno do tenant;
- `professional_link`: vinculo opcional com profissional de saude.

Regra:

- o mesmo email pode ter acesso a mais de um tenant, mas a sessao deve exigir tenant ativo selecionado.

### Perfis / Grupos

Perfis sao conjuntos de permissoes. Grupos sao colecoes de usuarios, podendo tambem carregar escopo de dados.

Tipos:

- perfil de sistema;
- perfil customizado do tenant;
- grupo de unidade;
- grupo de departamento;
- grupo executivo;
- grupo editorial;
- grupo de projeto.

Regra:

- perfis definem acoes;
- grupos podem definir escopo e audiencia;
- overrides por usuario devem ser excecao auditada.

### Permissoes

Permissoes devem usar catalogo central.

Formato conceitual:

```text
module_key.resource_key.action
```

Exemplos:

- `financeiro.repasses.view`
- `financeiro.repasses.edit`
- `financeiro.repasses.refresh`
- `intranet.pages.publish`
- `pessoas.colaboradores.documents.download`
- `plataforma.users.manage`

Acoes base:

- `view`
- `create`
- `edit`
- `delete`
- `approve`
- `export`
- `download`
- `refresh`
- `manage`

### Escopo de dados

Escopo define quais registros entram na decisao.

Dimensoes iniciais:

- tenant;
- unidade;
- organizacao;
- departamento;
- cargo;
- equipe;
- projeto;
- profissional;
- colaborador;
- campanha;
- procedimento;
- periodo;
- audiencia/editorial;
- escopo executivo.

Regra:

- permissao para abrir pagina nao implica acesso a todos os dados da pagina.

## Contratos de contexto

### `IdentityContext`

Contem:

- `user_id`
- `email`
- `global_roles`
- `auth_method`
- `session_id`

### `TenantContext`

Contem:

- `tenant_id`
- `tenant_slug`
- `membership_id`
- `tenant_status`
- `selected_org_unit_id`, quando aplicavel.

### `EntitlementContext`

Contem:

- modulos ativos;
- limites;
- flags;
- modo de fonte de dados (`MAGIC_CORE`, `FEEGOW_BRIDGE` ou hibrido).

### `AuthorizationContext`

Contem:

- perfis;
- grupos;
- permissoes efetivas;
- overrides;
- origem da decisao.

### `DataAccessContext`

Contem:

- unidades autorizadas;
- grupos autorizados;
- escopo executivo;
- escopo editorial;
- escopo de projeto;
- filtros obrigatorios que todo repositorio deve aplicar.

## Fluxo de decisao de acesso

1. Validar sessao.
2. Resolver tenant ativo.
3. Validar membership ativa.
4. Validar entitlement do modulo.
5. Resolver perfis e grupos.
6. Resolver permissao funcional.
7. Resolver data scope.
8. Aplicar policy do recurso.
9. Registrar decisao sensivel em auditoria.
10. Executar consulta/mutacao com filtros obrigatorios.

## Modos de dados

### `Magic Core`

Modo principal do produto.

O Magic IA e fonte da verdade para:

- pacientes;
- agenda;
- profissionais;
- procedimentos;
- propostas;
- contratos;
- financeiro;
- repasses;
- pessoas/RH;
- intranet;
- tarefas;
- qualidade;
- analytics.

### `Feegow Bridge`

Modo de compatibilidade para clientes que usam Feegow.

O Feegow e origem externa para:

- agenda;
- pacientes;
- profissionais;
- procedimentos;
- propostas;
- contratos;
- faturamento;
- repasses.

Regra:

- dados do Feegow entram por conectores tenant-aware;
- o core do Magic IA nao deve depender diretamente de banco legado;
- quando possivel, bridge grava staging e entidades canonicas mapeadas.

### Hibrido

Modo transicional.

Exemplos:

- Feegow alimenta agenda e faturamento;
- Magic IA controla follow-up, tarefas, intranet, RH e qualidade;
- Magic IA cria entidades locais que depois podem substituir entidades Feegow.

## Arquitetura recomendada no novo repo

Monorepo novo, separado do legado.

Estrutura conceitual:

```text
apps/
  admin/
  intranet/
  portal/
  api/
packages/
  core/
  auth-client/
  data-access/
  permissions/
  entitlements/
  jobs/
  integrations/
  ui/
workers/
  runtime/
  connectors/
  processors/
docs/
  adr/
  blueprints/
```

O IAM compartilhado deve continuar fora do repo do SaaS, conforme ADR congelada.

## Modulos contrataveis iniciais

### Sempre inclusos

- plataforma/admin;
- tenant onboarding;
- usuarios e permissoes;
- health/status;
- auditoria basica.

### Contrataveis

- BI e Gestao;
- Comercial e Atendimento;
- Financeiro;
- Marketing;
- Pessoas e RH;
- Operacao Clinica;
- Qualidade e Regulatorio;
- Intranet;
- Tarefas e Projetos;
- Feegow Bridge.

## Regras de tenant enforcement

- Toda tabela de negocio do novo SaaS deve ter `tenant_id`, exceto catalogos globais explicitamente marcados.
- Toda query de negocio deve receber `DataAccessContext`.
- Toda mutacao deve validar entitlement, permissao e data scope.
- Todo job deve ter `tenant_id`.
- Todo cache deve incluir tenant e modulo na chave.
- Todo arquivo deve ter prefixo/metadata de tenant.
- Toda integracao deve usar segredo por tenant.
- Todo acesso global deve ser grant explicito e auditavel.

## Auditoria minima

Eventos que devem ser auditados:

- login e troca de tenant;
- criacao/alteracao de usuarios;
- alteracao de perfis e permissoes;
- alteracao de entitlements;
- alteracao de integracoes/secrets;
- exports sensiveis;
- downloads de documentos sensiveis;
- aprovacoes;
- mudancas financeiras;
- mudancas de RH;
- execucao manual de jobs;
- acesso support/admin global.

## O que o Magic IA nao deve herdar

- roles globais como decisao final;
- `user_page_permissions` sem tenant;
- secrets em env global por cliente;
- workers que processam todos os clientes implicitamente;
- tabelas `feegow_*` como fonte principal permanente;
- UI que mistura permissao administrativa com escopo executivo;
- analytics pesados em cima do OLTP principal;
- downloads diretos sem autorizacao server-side;
- integracoes sem health, idempotencia e trilha.
