# Foundation Gates

## Objetivo

Este documento responde se a foundation esta pronta para abrir o novo repositorio do Magic IA e iniciar a engineering bootstrap.

Os gates abaixo sao objetivos. Cada item deve estar em estado `PASS` ou `FAIL`.

---

## Gates de aprovacao

### Gate 1 - Arquitetura macro congelada

- **Status:** `PASS`
- **Criterio:** ADR-000 ate ADR-015 ratificadas como baseline oficial.

### Gate 2 - Contract pack fundacional congelado

- **Status:** `PASS`
- **Criterio:** `CONTRACT-PACK.md` presente e aprovado.
- **Cobertura minima obrigatoria:** `TenantContext`, `DataAccessContext`, `AuthToken`, `MachineIdentity`, `ServiceTokenClaims`, `ServiceAudience`, `SecretRef`, `JobEnvelope`, `AuditEvent`, `OutboxEvent`, `InboxEvent`, `EntitlementGrant`.

### Gate 3 - Baseline operacional minima fechada

- **Status:** `PASS`
- **Criterio:** `OPERATIONAL-BASELINE.md` presente e aprovado.
- **Cobertura minima obrigatoria:** pooling, budgets de conexao, tracing, correlation IDs, logging minimo, metricas, alertas, backup, restore, RPO/RTO, DLQ, scheduler, health checks, failure domains e runbooks minimos.

### Gate 4 - Bloqueadores P0 resolvidos

- **Status:** `PASS`
- **Criterio:** `OPEN-QUESTIONS.md` nao contem mais itens `P0`.

### Gate 5 - Tenancy enforcement fechado

- **Status:** `PASS`
- **Criterio:** `TenantContext`, `DataAccessContext`, politica de `raw SQL`, isolamento de cache/queue e acesso cross-tenant estao explicitamente definidos.

### Gate 6 - IAM e service-to-service trust fechados

- **Status:** `PASS`
- **Criterio:** `AuthToken`, `MachineIdentity`, `ServiceTokenClaims`, `ServiceAudience`, MFA day-1, TTLs e revogacao inicial estao definidos.

### Gate 7 - Data movement e worker semantics fechados

- **Status:** `PASS`
- **Criterio:** `JobEnvelope`, `OutboxEvent`, `InboxEvent`, idempotencia, retry, replay e reconciliacao estao definidos.

### Gate 8 - Data governance e auditabilidade fechadas

- **Status:** `PASS`
- **Criterio:** `AuditEvent`, redaction, lifecycle, retention classes, deletion mode, legal hold e restore expectations estao definidos.

### Gate 9 - Operational assumptions validas para foundation

- **Status:** `PASS`
- **Criterio:** Railway/MySQL/Valkey continuam compativeis com a baseline minima aprovada para foundation.

### Gate 10 - Blueprint Magic IA alinhado

- **Status:** `PASS`
- **Criterio:** `planejamentos/magic-ia/` existe e separa claramente legado, Magic Core, Feegow Bridge, modulos comercializaveis e roadmap de paridade.
- **Cobertura minima obrigatoria:** o blueprint nao reabre ADRs; ele complementa a foundation com contexto funcional e produto.

---

## O que pode esperar a fase 2

- mTLS efetivo entre servicos
- SSO e SAML implementados
- gateway de pagamento automatizado
- impersonation operacional
- tenants premium com isolamento fisico
- warehouse externo ou stack analitico mais sofisticado
- paridade completa de modulos de negocio
- migracao tecnica de dados do legado

---

## Decisao atual

- `Podemos criar o novo repo do Magic IA agora? Sim`
- `Podemos iniciar Goal Mode de foundation agora? Sim`
- `Podemos iniciar implementacao ampla agora? Nao`

Justificativa:

- A foundation documental agora esta fechada para bootstrap de engineering.
- O blueprint funcional do Magic IA esta disponivel como referencia de produto e paridade.
- O que continua fora do gate e implementacao ampla do produto, integracoes completas e capacidades de fase 2.
