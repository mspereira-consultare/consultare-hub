# Dependency Map

## Objetivo

Este documento mostra a ordem minima de materializacao tecnica e o que depende de que para a foundation do novo SaaS.

O objetivo e impedir implementacao fora de sequencia.

---

## Identity chain

- `IAM`
- `AuthToken`
- `MachineIdentity`
- `ServiceTokenClaims`
- `ServiceAudience`

```text
IAM
  -> AuthToken
  -> MachineIdentity
      -> ServiceTokenClaims
          -> ServiceAudience
```

---

## Tenancy chain

- `IAM grants/memberships`
- `TenantContext`
- `DataAccessContext`
- `AuditEvent`

```text
IAM grants/memberships
  -> TenantContext
      -> DataAccessContext
          -> AuditEvent
```

---

## Async chain

- `TenantContext`
- `OutboxEvent`
- `JobEnvelope`
- `InboxEvent`
- `Workers`

```text
TenantContext
  -> OutboxEvent
      -> JobEnvelope
          -> InboxEvent
              -> Workers
```

---

## Config/control chain

- `MachineIdentity` + `TenantContext` -> `SecretRef`
- `TenantContext` + `AuditEvent` + `EntitlementGrant` -> `Onboarding`

```text
MachineIdentity + TenantContext
  -> SecretRef

TenantContext + AuditEvent + EntitlementGrant
  -> Onboarding
```

---

## Nao implementar antes de

- `DataAccessContext` nao antes de `TenantContext`
- `Workers` nao antes de `OutboxEvent` e `JobEnvelope`
- `SecretRef` nao antes de `MachineIdentity`
- `Onboarding` nao antes de `EntitlementGrant`
- `Modulo funcional` nao antes de `AuditEvent`, `TenantContext`, `OutboxEvent`, `Worker runtime`
- `Analytics serving` nao antes de foundation assincrona estabilizada

---

## Ordem minima de materializacao

1. repo/monorepo
2. contracts base
3. IAM client + machine identity
4. tenancy enforcement
5. observability/audit
6. workers/outbox/inbox
7. secret/config
8. onboarding/entitlements
9. primeiro modulo
10. hardening

---

## Leituras de dependencia por tema

- Se o problema envolver identidade, olhar `F2 -> F3 -> F4`
- Se o problema envolver jobs, olhar `F5 -> F6`
- Se o problema envolver secrets, olhar `F3 -> F6 -> F7`
- Se o problema envolver primeiro modulo real, olhar `F8 -> F9`

---

## Regra pratica

Se um item ainda depende de um contrato, contexto ou runtime que nao existe na fase atual, ele ainda nao deve ser implementado.
