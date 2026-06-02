# Sprint Plan

## Defaults

- sprints sugeridas de `2 semanas`
- equipe pequena de foundation `3 a 5 engenheiros`
- um Goal Mode por sprint ou por meia sprint
- nunca usar um unico Goal Mode para o pacote inteiro

---

## Sprint 1 - F0 + F1

### Objetivo da sprint

Abrir o novo repo e bootstrapar o monorepo inicial.

### Entregaveis

- repo novo criado
- estrutura base do monorepo
- CI minima
- runtime web skeleton
- worker runtime skeleton

### Dependencias

- `FOUNDATION-GATES.md` em `PASS`

### Criterios de pronto

- repo separado funcionando
- nenhuma dependencia estrutural com o legado
- monorepo pronto para receber os pacotes fundacionais

### Riscos

- tentar adicionar feature cedo demais
- copiar boilerplate do legado

### Fora da sprint

- IAM real
- integracoes
- onboarding
- modulo funcional

### Saida para Goal Mode

Escopo seguro para um primeiro Goal Mode.

### O que ainda bloqueia a sprint seguinte

- sem contratos base no repo, `Sprint 2` nao pode comecar.

---

## Sprint 2 - F2

### Objetivo da sprint

Materializar o `Platform Core`.

### Entregaveis

- base de `TenantContext`
- base de `DataAccessContext`
- base de `AuditEvent`
- base de `OutboxEvent`
- base de `JobEnvelope`

### Dependencias

- `Sprint 1`

### Criterios de pronto

- contratos fundacionais materializados no repo
- runtime pode importar as primitives de foundation

### Riscos

- vazamento de decisoes implicitas
- pacotes base virarem pseudo-modulos de negocio

### Fora da sprint

- modulo funcional
- auth real
- workers completos

### Saida para Goal Mode

Boa fase para Goal Mode curto e objetivo.

### O que ainda bloqueia a sprint seguinte

- sem cliente IAM e identidade tecnica, `Sprint 3` nao pode fechar corretamente.

---

## Sprint 3 - F3 + F4

### Objetivo da sprint

Plugar IAM client e tenancy enforcement.

### Entregaveis

- cliente IAM
- propagacao de `TenantContext`
- aplicacao de `DataAccessContext`
- regras de acesso e isolamento

### Dependencias

- `Sprint 2`

### Criterios de pronto

- `TenantContext` e `DataAccessContext` atravessam o runtime
- auth local improvisada nao existe
- guardrails de tenant estao ativos

### Riscos

- atalho com auth local
- SQL fora do guardrail
- grants globais mal tratados

### Fora da sprint

- onboarding
- integracoes reais
- observabilidade completa

### Saida para Goal Mode

Requer Goal Mode bem contido por subfase: IAM client primeiro, enforcement depois.

### O que ainda bloqueia a sprint seguinte

- sem correlacao, audit e health, `Sprint 4` perde verificabilidade.

---

## Sprint 4 - F5

### Objetivo da sprint

Colocar auditabilidade e baseline operacional no codigo.

### Entregaveis

- logging estruturado
- `correlation_id`
- `AuditEvent` basico
- health checks
- metricas e readiness minimas

### Dependencias

- `Sprint 3`

### Criterios de pronto

- baseline minima observavel
- eventos basicos auditaveis
- runtime e worker visiveis operacionalmente

### Riscos

- instrumentacao incompleta
- logs sem padrao

### Fora da sprint

- analytics serving completo
- dashboards de observabilidade sofisticados

### Saida para Goal Mode

Boa candidata a um Goal Mode focado em observabilidade e audit.

### O que ainda bloqueia a sprint seguinte

- sem visibilidade operacional, `Sprint 5` fica arriscada para fila e replay.

---

## Sprint 5 - F6

### Objetivo da sprint

Criar o worker runtime minimo confiavel.

### Entregaveis

- fila
- scheduler
- `JobEnvelope`
- `OutboxEvent`
- `InboxEvent`
- retry
- DLQ

### Dependencias

- `Sprint 4`

### Criterios de pronto

- assincronia basica verificavel
- scheduler nao roda no web
- replay e retry basicos existem

### Riscos

- retry/replay mal fechados
- fila sem guardrails

### Fora da sprint

- integracoes externas reais
- analytics serving completo

### Saida para Goal Mode

Pode ser dividido em dois ciclos: runtime de fila e depois scheduler/replay.

### O que ainda bloqueia a sprint seguinte

- sem `SecretRef` e onboarding minimo, a foundation continua incompleta.

---

## Sprint 6 - F7 + F8

### Objetivo da sprint

Fechar `SecretRef` foundation e o control plane minimo de onboarding e entitlements.

### Entregaveis

- resolucao de secret por referencia
- state machine minima de onboarding
- `EntitlementGrant`
- go-live gate

### Dependencias

- `Sprint 5`

### Criterios de pronto

- foundation completa sem feature de negocio
- tenancy, grants, secrets e onboarding minimo coerentes

### Riscos

- expandir onboarding alem do minimo
- puxar billing para dentro da sprint

### Fora da sprint

- modulo funcional de negocio
- self-service completo
- cobranca automatizada

### Saida para Goal Mode

Boa fase para Goal Mode controlado em dois cortes: `SecretRef` e depois onboarding/entitlements.

### O que ainda bloqueia a sprint seguinte

- sem foundation completa, `Sprint 7` nao deveria existir.

---

## Sprint 7 - F9 + F10

### Objetivo da sprint

Implementar o primeiro modulo funcional e endurecer a foundation.

### Entregaveis

- modulo escolhido implementado
- restore drill inicial
- replay validado
- ajustes de readiness e resilience

### Dependencias

- `Sprint 6`
- `MVP-SCOPE.md` aprovado

### Criterios de pronto

- primeiro slice funcional validando a foundation
- hardening inicial concluido

### Riscos

- escopo inflar
- tentar expandir produto inteiro

### Fora da sprint

- rollout amplo do produto
- billing automatizado
- expansao grande de analytics

### Saida para Goal Mode

Usar Goal Mode primeiro para o modulo funcional escolhido e depois para hardening.

### O que ainda bloqueia a sprint seguinte

- a partir daqui comeca um novo ciclo de produto, nao continuidade infinita da foundation.
