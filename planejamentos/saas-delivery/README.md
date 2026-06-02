# SaaS Delivery

## Objetivo

Este pacote transforma o Foundation Freeze do novo SaaS Consultare em um plano incremental de delivery e execution.

O foco aqui nao e reabrir arquitetura nem detalhar backlog infinito. O foco e converter a fundacao aprovada em fases pequenas, verificaveis e seguras para engineering.

---

## Fontes oficiais

Os documentos abaixo devem ser tratados como fonte oficial desta iniciativa:

- `planejamentos/saas-architecture/README.md`
- `planejamentos/saas-architecture/ADR-000-separacao-fisica-legado-saas.md`
- `planejamentos/saas-architecture/ADR-001-iam-compartilhado.md`
- `planejamentos/saas-architecture/ADR-002-multi-tenancy-row-level.md`
- `planejamentos/saas-architecture/ADR-003-secrets-por-tenant.md`
- `planejamentos/saas-architecture/ADR-004-workers-multi-tenant.md`
- `planejamentos/saas-architecture/ADR-005-auditoria.md`
- `planejamentos/saas-architecture/ADR-006-monorepo-interno.md`
- `planejamentos/saas-architecture/ADR-007-analytics-serving.md`
- `planejamentos/saas-architecture/ADR-008-onboarding-tenants.md`
- `planejamentos/saas-architecture/ADR-009-design-system.md`
- `planejamentos/saas-architecture/ADR-010-anti-corruption-layer.md`
- `planejamentos/saas-architecture/ADR-011-tenant-enforcement-e-data-access-policy.md`
- `planejamentos/saas-architecture/ADR-012-data-governance-lgpd-e-lifecycle.md`
- `planejamentos/saas-architecture/ADR-013-service-to-service-security-e-machine-identity.md`
- `planejamentos/saas-architecture/ADR-014-entitlements-billing-e-feature-flags.md`
- `planejamentos/saas-architecture/ADR-015-data-movement-e-integration-delivery-model.md`
- `planejamentos/saas-architecture/CONTRACT-PACK.md`
- `planejamentos/saas-architecture/OPERATIONAL-BASELINE.md`
- `planejamentos/saas-architecture/FOUNDATION-GATES.md`
- `planejamentos/saas-architecture/RISKS.md`
- `planejamentos/saas-architecture/OPEN-QUESTIONS.md`
- `planejamentos/saas-architecture/NEXT-STEPS.md`

---

## Ordem recomendada de leitura

1. `FOUNDATION-ROADMAP.md`
2. `DELIVERY-PHASES.md`
3. `DEPENDENCY-MAP.md`
4. `MVP-SCOPE.md`
5. `SPRINT-PLAN.md`
6. `FIRST-GOAL-MODE-PROMPT.md`

---

## Regras deste pacote

- Nao reabrir ADRs ja aprovadas.
- Nao alterar o sistema legado.
- Nao pular foundation para construir modulo funcional.
- Nao tentar implementar o produto inteiro de uma vez.
- Nao usar o legado como dependencia operacional do novo runtime.
- Usar Goal Mode apenas por fase fechada e com escopo limitado.

---

## Quando usar Goal Mode

Goal Mode so deve ser usado quando todos os itens abaixo forem verdadeiros:

- a fase anterior terminou com criterio de saida claro;
- as dependencias de entrada da nova fase estao satisfeitas;
- o escopo da fase cabe em um ciclo curto e verificavel;
- o resultado esperado nao depende de reabrir arquitetura;
- os contratos e gates necessarios ja estao definidos nas fontes oficiais;
- o objetivo da fase pode ser validado sem puxar modulo funcional antes da base.

Em termos praticos:

- `F0` e `F1` podem entrar primeiro em Goal Mode;
- `F9` nao pode entrar antes de `F0-F8`;
- `F10` nao pode virar desculpa para corrigir foundation que deveria ter sido fechada antes.

---

## Decisao operacional

- O novo repo pode ser criado apos aprovacao deste pacote.
- A primeira fase executavel e `F0 - Preparacao do novo repo`.
- A implementacao ampla do produto continua fora de escopo neste momento.
- O primeiro ciclo de engenharia deve atacar apenas foundation bootstrap, sem modulo funcional.

---

## Como usar este pacote

- Use `FOUNDATION-ROADMAP.md` para entender a ordem macro.
- Use `DELIVERY-PHASES.md` para saber o que entra e o que nao entra em cada fase.
- Use `DEPENDENCY-MAP.md` para nao inverter a ordem tecnica.
- Use `MVP-SCOPE.md` para proteger o escopo minimo.
- Use `SPRINT-PLAN.md` para organizar a execucao incremental.
- Use `FIRST-GOAL-MODE-PROMPT.md` para iniciar o primeiro Goal Mode com seguranca.
