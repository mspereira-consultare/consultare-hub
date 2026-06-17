# Blueprint Magic IA

Este pacote documenta o `consultare-hub` como referencia funcional e operacional para o novo SaaS multi-tenant **Magic IA**.

O objetivo nao e copiar a arquitetura do legado. O objetivo e extrair:

- quais produtos, fluxos e modulos existem hoje;
- quais dados, workers e integracoes sustentam cada modulo;
- quais partes dependem do Feegow;
- quais partes ja podem nascer como Magic Core;
- quais contratos multi-tenant precisam existir no novo repositorio.

## Ordem recomendada de leitura

1. `BLUEPRINT-LEGADO-CONSULTARE-HUB.md`
2. `MODULOS-E-FUNCIONALIDADES.md`
3. `DADOS-INTEGRACOES-E-WORKERS.md`
4. `MAGIC-IA-MULTITENANT-TARGET.md`
5. `MATRIZ-FEEGOW-BRIDGE-VS-MAGIC-CORE.md`
6. `ROADMAP-DE-PARIDADE-E-MIGRACAO.md`

## Fontes usadas

Este blueprint foi montado a partir de leitura do repositorio atual:

- apps: `apps/painel`, `apps/intranet`, `apps/portal-colaborador`;
- pacotes compartilhados: `packages/core`, `packages/ui`;
- workers: `workers`;
- documentacao funcional e tecnica em `apps/painel/docs`;
- dicionarios e contratos de banco em `apps/painel/docs/database`;
- planejamentos existentes em `planejamentos/*`;
- ADRs SaaS congeladas em `planejamentos/saas-architecture`;
- plano de entrega SaaS em `planejamentos/saas-delivery`;
- diagnostico de usuarios e permissoes em `planejamentos/users`.

## Premissas congeladas

- O novo produto sera chamado **Magic IA**.
- O novo SaaS ficara em outro repositorio.
- Este repositorio sera apenas fonte de consulta.
- O Magic IA tera dois modos de operacao:
  - `Feegow Bridge`: para clientes que ainda usam Feegow;
  - `Magic Core`: produto principal, substituindo progressivamente o Feegow.
- O legado atual nao e tenant-aware.
- O novo produto deve nascer multi-tenant desde a foundation.
- A base arquitetural em `planejamentos/saas-architecture` continua valida: separacao fisica, IAM separado, row-level tenancy, secrets por tenant, workers tenant-aware, auditoria append-only, entitlements server-side e anti-corruption layer read-only.

## Como usar este pacote

- Para produto: usar `MODULOS-E-FUNCIONALIDADES.md` como mapa de paridade e empacotamento comercial.
- Para engenharia: usar `DADOS-INTEGRACOES-E-WORKERS.md` e `MAGIC-IA-MULTITENANT-TARGET.md` como base de contratos.
- Para migracao: usar `MATRIZ-FEEGOW-BRIDGE-VS-MAGIC-CORE.md` e `ROADMAP-DE-PARIDADE-E-MIGRACAO.md`.
- Para qualquer decisao futura: separar sempre "como o legado funciona hoje" de "como o Magic IA deve nascer".

