# ADR-011 - Tenant Enforcement e Data Access Policy

- Status: Aprovada
- Prioridade: P0
- Relacoes: Complementa diretamente ADR-002. Tem dependencia forte com ADR-004, ADR-007 e ADR-010. Reforca o uso de grants definidos em ADR-001.

## Contexto

O pacote arquitetural ja aprovou row-level tenancy como estrategia fisica padrao. Isso resolve custo e operacao, mas nao resolve sozinho o principal risco do modelo: bypass de isolamento por erro de query, cache, job, exportacao, suporte ou analytics.

O novo SaaS precisa transformar `tenant_id` em regra estrutural de acesso, e nao apenas em convencao de modelagem.

## Problema

Sem uma politica formal de enforcement:

- querys tenant-scoped podem sair sem filtro;
- cache pode reutilizar chaves entre tenants;
- jobs podem circular sem contexto suficiente;
- operacoes administrativas podem virar bypass informal;
- exports, staging e analytics podem atravessar escopo por conveniencia.

## Opcoes consideradas

### 1. Convencao manual por repository

Depender apenas de disciplina de equipe e revisao de codigo para garantir filtros de tenant.

### 2. Isolamento nativo no banco como controle principal

Transferir o enforcement quase todo para mecanismos do banco.

### 3. Tenant enforcement por politica de aplicacao e contratos explicitos

Impor contexto de tenant, camada aprovada de acesso, grants globais dedicados e isolamento de cache/queue/object key como requisito transversal.

## Decisao

Foi aprovada uma `Tenant Enforcement e Data Access Policy` explicita para o novo SaaS.

Essa politica inclui:

- toda operacao tenant-scoped deve carregar `TenantContext` imutavel;
- toda leitura e escrita tenant-scoped deve passar por camada aprovada de acesso, query service ou repository governado;
- `raw SQL` contra tabelas tenant-scoped e proibido fora de caminhos explicitamente aprovados para migracao, operacao interna controlada ou manutencao administrativa;
- acessos cross-tenant so podem ocorrer por caminhos dedicados com `GlobalScopeGrant` explicito;
- suporte/admin global nao opera com "superuser implicito" e deve usar `SupportAccessSession` auditada e com tempo limitado;
- cache keys, queue keys, object keys, export artifacts e staging temporario devem incorporar `tenant_id` quando o recurso for tenant-scoped;
- credenciais tecnicas e papeis de banco devem ser segregados por runtime, no minimo entre `web`, `worker`, `analytics` e `bridge`.

## Justificativa

Row-level tenancy sem enforcement real vira risco estrutural de vazamento. Ao congelar a politica de acesso agora, o novo SaaS evita espalhar filtros manuais, excecoes ocultas e mecanismos de suporte inseguros pelo codigo.

## Trade-offs

- Exige mais disciplina de arquitetura, revisao e tooling.
- Reduz a liberdade de acesso ad hoc por SQL direto.
- Aumenta o custo inicial de desenho da camada de acesso.
- Reduz fortemente o risco de vazamento entre tenants.

## Enforcement operacional

- Nenhum endpoint, job ou export tenant-scoped pode executar sem `TenantContext`.
- Caminhos de acesso global devem ser separados dos caminhos tenant-scoped e sempre auditados.
- Cache compartilhado sem namespacing de tenant e proibido para dados tenant-scoped.
- Scripts operacionais que precisarem tocar dados tenant-scoped devem declarar escopo, motivo e runtime aprovado.
- Revisoes arquiteturais devem tratar bypass de tenant como falha critica, nao como detalhe de implementacao.

## Contratos envolvidos

- `TenantContext`: tenant ativo, organizacao, sistema consumidor, membership ativa, actor, correlation_id e escopo efetivo.
- `DataAccessContext`: tenant context combinado com motivo operacional e nivel de acesso esperado.
- `ScopeGrant`: grant de permissao com escopo tenant-scoped ou global-scoped.
- `SupportAccessSession`: sessao temporaria e auditada de acesso de suporte sobre tenant alvo.
- `TenantObjectKey`: convencao de chave para cache, storage e artefatos temporarios com identificacao de tenant.

## Riscos

- Bypass por SQL direto em ferramentas auxiliares.
- Cache keys mal desenhadas misturarem tenants.
- Queries globais serem reaproveitadas em fluxos tenant-scoped.
- Suporte/admin global virar atalho permanente.
- Jobs herdarem contexto parcial e processarem dados fora do escopo esperado.

## Reversibilidade

Media-baixa.

Os contratos podem evoluir, mas relaxar enforcement depois de o codigo nascer espalhado e muito caro. Esta ADR deve ser tratada como regra de fundacao.

## Criterios obrigatorios de validacao

- Nenhuma operacao tenant-scoped executa sem `TenantContext`.
- Nenhuma tabela tenant-scoped e acessada por `raw SQL` fora da politica aprovada.
- Nenhum cache tenant-scoped existe sem chave com `tenant_id`.
- Acessos cross-tenant exigem `GlobalScopeGrant` explicito e trilha de auditoria.
- Suporte/admin global usa `SupportAccessSession` com expiracao e motivo operacional.
