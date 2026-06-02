# ADR-002 - Multi-tenancy Row-level

- Status: Aprovada
- Prioridade: P0
- Relacoes: Depende de ADR-000 e ADR-001. Tem tensao direta com ADR-007 e ADR-004 por risco de vazamento sem contexto de tenant.

## Contexto

O novo SaaS precisa nascer multi-tenant desde a fundacao, mas continua hospedado em Railway com MySQL como base principal. A estrategia escolhida deve equilibrar isolamento, custo operacional, evolucao analitica e velocidade de desenvolvimento.

## Problema

A escolha da estrategia fisica de tenancy impacta:

- seguranca e risco de vazamento entre tenants;
- custo de banco e operacao;
- complexidade de migrations;
- estrategia analitica;
- desenho de suporte, auditoria e automacao.

## Opcoes consideradas

### 1. Row-level tenancy

Um banco compartilhado, com `tenant_id` obrigatorio nos dados de dominio e isolamento logico controlado pela aplicacao.

### 2. Schema-per-tenant

Um mesmo banco com schemas separados por tenant.

### 3. Database-per-tenant

Uma base separada por tenant.

## Decisao

Foi aprovado `row-level tenancy` como estrategia padrao do novo SaaS.

A decisao inclui:

- banco novo e exclusivo do SaaS;
- `tenant_id` obrigatorio em todas as tabelas de dominio tenant-scoped;
- indices compostos incluindo `tenant_id`;
- contexto de tenant obrigatorio em toda camada de acesso;
- testes negativos de isolamento como criterio estrutural;
- possibilidade futura de excecao apenas para tenants premium que exijam segregacao fisica justificada.

## Justificativa

Para o contexto atual, `row-level tenancy` oferece o melhor equilibrio entre:

- custo;
- simplicidade operacional;
- capacidade analitica cross-tenant controlada;
- velocidade de evolucao;
- aderencia ao modelo Railway + MySQL.

`Schema-per-tenant` complica migrations e automacao sem entregar isolamento suficiente para justificar a complexidade. `Database-per-tenant` melhora o isolamento, mas eleva cedo demais o custo de operacao.

## Trade-offs

- Exige disciplina rigorosa na camada de acesso e nos testes.
- Reduz custo e simplifica analytics em comparacao com database-per-tenant.
- Torna suporte e observabilidade mais dependentes de tenant context bem propagado.
- Preserva opcao futura de isolamento premium por excecao.

## Riscos

- Query sem filtro de tenant.
- Cache sem chave composta por tenant.
- Job assinado sem tenant context.
- Relatorio global executado com filtros incorretos.
- Dados de suporte, auditoria ou analytics sendo exibidos fora do escopo.

## Reversibilidade

Media.

E possivel evoluir futuramente para isolamento fisico por excecao, mas migrar toda a plataforma para database-per-tenant depois de estabelecido o modelo e caro. A escolha precisa ser tratada como default de longo prazo.

## Impactos operacionais

- Necessidade de convencoes e linting arquitetural para garantir tenant context.
- Mais atencao em revisao de query, repository e jobs.
- Indices precisam ser desenhados para tenant_id + chaves de consulta.
- Observabilidade e suporte devem sempre carregar identificacao do tenant.

## Criterios de validacao

- Nenhuma tabela de dominio tenant-scoped existe sem `tenant_id`.
- Indices criticos incluem `tenant_id` como parte da estrategia de acesso.
- Toda leitura e escrita exige tenant context explicito.
- Testes de isolamento negativo cobrem leitura, escrita, cache, jobs e auditoria.
- Dashboards e APIs administrativas nao conseguem atravessar tenants sem grant global explicito.
