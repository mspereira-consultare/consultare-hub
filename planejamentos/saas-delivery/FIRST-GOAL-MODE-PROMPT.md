# First Goal Mode Prompt

## Objetivo

Este documento define o prompt seguro para iniciar o primeiro Goal Mode sem extrapolar o escopo da foundation bootstrap.

O primeiro Goal Mode deve cobrir apenas `F0 + F1`.

---

## Prompt recomendado

```text
Crie o novo repositorio SaaS separado do legado conforme as fontes oficiais em `planejamentos/saas-architecture/` e o plano em `planejamentos/saas-delivery/`. Execute apenas as fases F0 e F1: preparacao do repo e bootstrap do monorepo interno. Implemente somente a estrutura inicial de apps e packages, runtime web minimo, worker runtime minimo, CI minima e guardrails basicos de foundation. Nao implemente features de negocio, integracoes legadas, billing, dashboards, analytics serving completo nem onboarding funcional ainda.
```

---

## O que este Goal Mode pode fazer

- criar o novo repo
- bootstrapar o monorepo inicial
- criar `apps` e `packages` base
- criar runtime web minimo
- criar worker runtime minimo
- criar CI minima
- preparar guardrails tecnicos de foundation

---

## O que este Goal Mode nao pode fazer

- implementar modulo funcional
- implementar integracoes legadas reais
- implementar billing
- implementar dashboards
- implementar analytics completo
- implementar onboarding funcional
- puxar regras de negocio do legado

---

## Criterio de encerramento

O Goal Mode termina quando:

- o repo novo existe
- o monorepo inicial esta funcionando
- a base esta pronta para entrar em `F2`

Se surgir demanda de produto antes disso, ela deve ser recusada e movida para fase posterior.
