# Foundation Roadmap

## Objetivo

Este roadmap organiza a construcao do novo SaaS em fases macro que podem ser executadas de forma incremental, sem tentar implementar tudo de uma vez.

As fases abaixo respeitam a arquitetura congelada e as dependencias definidas no Foundation Freeze.

---

## F0 - Preparacao do novo repo

- **Objetivo:** abrir o novo repositorio separado do legado e preparar o terreno minimo de trabalho.
- **Dependencias de entrada:** `FOUNDATION-GATES.md` em `PASS`.
- **Entregaveis principais:** repo novo, convencoes iniciais, protecoes basicas de branch, estrutura vazia de trabalho.
- **Criterio de saida:** existe repositorio novo sem compartilhar codigo, pipeline, banco ou runtime com o legado.
- **Nao entra:** codigo de negocio, integracoes, onboarding, billing, dashboards.

## F1 - Bootstrap do monorepo

- **Objetivo:** criar o monorepo interno inicial do novo SaaS.
- **Dependencias de entrada:** `F0` concluida.
- **Entregaveis principais:** estrutura inicial de `apps` e `packages`, CI minima, skeleton do runtime web e do worker runtime.
- **Criterio de saida:** monorepo funciona como base tecnica e pode receber os pacotes fundacionais.
- **Nao entra:** integracoes reais, IAM real completo, modulo funcional.

## F2 - Platform Core

- **Objetivo:** materializar os contratos fundacionais como pacotes base do novo repositorio.
- **Dependencias de entrada:** `F1` concluida.
- **Entregaveis principais:** base para `TenantContext`, `DataAccessContext`, `AuditEvent`, `OutboxEvent`, `JobEnvelope`.
- **Criterio de saida:** contratos centrais existem no repo e podem ser usados pelo runtime.
- **Nao entra:** fluxos completos de UX, onboarding funcional, modulo de negocio.

## F3 - IAM client / Machine Identity

- **Objetivo:** conectar o runtime aos contratos de identidade aprovados.
- **Dependencias de entrada:** `F2` concluida.
- **Entregaveis principais:** cliente do IAM, abstracoes de `AuthToken`, `MachineIdentity`, `ServiceTokenClaims`, `ServiceAudience`.
- **Criterio de saida:** runtime entende identidade humana e tecnica sem auth local improvisada.
- **Nao entra:** SSO, SAML, MFA para todos os perfis, UX completa de autenticacao.

## F4 - Tenancy enforcement

- **Objetivo:** propagar `TenantContext` e aplicar guardrails de isolamento no runtime.
- **Dependencias de entrada:** `F3` concluida.
- **Entregaveis principais:** enforcement de `TenantContext`, politica de `raw SQL`, guardrails de acesso a dados e de acesso cross-tenant.
- **Criterio de saida:** isolamento tenant-aware esta materializado no runtime e na camada de acesso.
- **Nao entra:** modulo funcional de negocio, relatorios globais complexos, support tooling avancado.

## F5 - Audit + Observability

- **Objetivo:** colocar auditabilidade e observabilidade minima em operacao no codigo.
- **Dependencias de entrada:** `F4` concluida.
- **Entregaveis principais:** logging estruturado, `correlation_id`, health checks, `AuditEvent` basico, metricas e alertas minimos.
- **Criterio de saida:** runtime e worker sao observaveis e auditaveis de forma coerente com o baseline.
- **Nao entra:** stack analitica completa, dashboards de observabilidade sofisticados.

## F6 - Worker runtime + Outbox/Inbox

- **Objetivo:** criar o runtime assincrono basico e confiavel do novo SaaS.
- **Dependencias de entrada:** `F5` concluida.
- **Entregaveis principais:** fila, scheduler, `JobEnvelope`, `OutboxEvent`, `InboxEvent`, retry e DLQ.
- **Criterio de saida:** side effects e jobs basicos ja nao dependem de fluxo sincrono improvisado.
- **Nao entra:** integracoes externas reais complexas, analytics serving completo.

## F7 - SecretRef foundation

- **Objetivo:** materializar a fundacao de secrets por referencia.
- **Dependencias de entrada:** `F6` concluida.
- **Entregaveis principais:** contrato e fluxo base de resolucao de `SecretRef`.
- **Criterio de saida:** runtime e workers referenciam segredo por contrato, nao por acesso direto.
- **Nao entra:** onboarding completo de credenciais de clientes reais, rotacao avancada, marketplace de integracoes.

## F8 - Onboarding minimo + Entitlements base

- **Objetivo:** criar o menor control plane possivel para entrar com tenants na fundacao.
- **Dependencias de entrada:** `F7` concluida.
- **Entregaveis principais:** state machine minima de onboarding, `EntitlementGrant` basico, go-live gate.
- **Criterio de saida:** o novo SaaS tem foundation completa sem ainda depender de modulo funcional de negocio.
- **Nao entra:** self-service completo, cobranca automatizada, onboarding comercial sofisticado.

## F9 - Primeiro modulo funcional

- **Objetivo:** validar a foundation em um primeiro slice real de produto.
- **Dependencias de entrada:** `F8` concluida.
- **Entregaveis principais:** primeiro modulo escolhido com baixo risco e alto valor de validacao.
- **Criterio de saida:** existe um modulo real funcionando sobre a foundation, sem inflar para o produto inteiro.
- **Nao entra:** expansao ampla do produto, modulo pesado de operacao legado, analytics first.

## F10 - Hardening

- **Objetivo:** endurecer a foundation apos o primeiro modulo real.
- **Dependencias de entrada:** `F9` concluida.
- **Entregaveis principais:** restore drills, replay/reconciliacao, ajustes de resilience e readiness para o proximo ciclo.
- **Criterio de saida:** foundation deixa de ser apenas bootstrap e passa a ser base segura para expandir produto.
- **Nao entra:** reescrita de arquitetura, substituicao massiva de stack, reabertura de ADRs basicas.

---

## Regras de sequenciamento obrigatorias

- Nao implementar modulo funcional antes de `F0-F8`.
- Nao implementar integracoes reais antes de `F6 + F7`.
- Nao implementar dashboards ou analytics dependentes de serving antes da estabilizacao da foundation.
- Nao usar o legado como dependencia operacional do novo runtime.
- Nao pular `F5` para acelerar modulo funcional sem observabilidade minima.
- Nao pular `F8` para improvisar onboarding e grants manualmente dentro de modulo funcional.
