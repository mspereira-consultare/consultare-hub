# MVP Scope

## Objetivo

Definir o menor escopo possivel para:

- validar a foundation em engineering;
- evitar inflar o primeiro ciclo;
- separar claramente `MVP tecnico` de `MVP de produto`.

---

## MVP tecnico

O `MVP tecnico` e o menor escopo necessario para termos uma foundation operacionalmente coerente sem feature de negocio.

### Deve incluir

- repo novo criado
- monorepo interno funcionando
- app principal inicial
- worker runtime inicial
- `TenantContext` propagado
- `DataAccessContext` aplicado
- `MachineIdentity` conceitual via cliente/abstracao
- logging estruturado com `correlation_id`
- `AuditEvent` basico
- `OutboxEvent` basico
- `JobEnvelope` basico
- `SecretRef` basico
- health checks minimos

### Nao deve incluir

- feature de negocio
- integracoes reais
- billing real
- analytics serving completo
- onboarding funcional completo

### Objetivo de validacao

Ao final do `MVP tecnico`, o time deve conseguir provar que:

- a foundation existe no repo novo;
- os contratos centrais estao materializados;
- o runtime e observavel;
- a base assincrona minima existe;
- tenancy e identidade tecnica nao ficaram implicitas.

---

## MVP de produto

O primeiro modulo real recomendado para implementar depois da foundation e:

- `Administracao de tenant / Onboarding minimo e configuracao inicial`

### Justificativa

- valida tenancy
- valida entitlements
- valida `SecretRef`
- valida `AuditEvent`
- valida `support/admin global`
- evita complexidade operacional de dominio pesado logo no primeiro modulo

### O que esse modulo precisa provar

- tenants podem ser criados e geridos no novo runtime
- grants basicos funcionam
- onboarding minimo conversa corretamente com a foundation
- configuracao inicial nao depende do legado

---

## O que nao escolher como primeiro modulo

- dashboards pesados
- analytics first
- integracoes externas complexas
- automacoes operacionais centrais do legado
- billing automatizado

---

## Regra de escopo

Se o time precisar escolher entre:

- aumentar cobertura de foundation; ou
- antecipar complexidade de produto

a prioridade continua sendo proteger a foundation.
