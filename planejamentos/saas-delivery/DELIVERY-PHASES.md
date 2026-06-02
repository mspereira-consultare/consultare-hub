# Delivery Phases

## Objetivo

Este documento transforma o roadmap macro em um guia mais executavel por fase, com foco explicito em:

- o que entra;
- o que nao entra;
- como saber se a fase terminou.

---

## F0 - Preparacao do novo repo

### Objetivo da fase

Criar o novo repositorio separado do legado e preparar a base minima de governanca do trabalho.

### Entradas obrigatorias

- `FOUNDATION-GATES.md` em `PASS`
- fontes oficiais ratificadas

### Entregaveis verificaveis

- repo novo criado
- nenhuma dependencia estrutural com o legado
- convencoes iniciais de trabalho documentadas
- branch protection e regras minimas de colaboracao

### Nao fazer nesta fase

- copiar estrutura do legado
- criar modulo funcional
- criar integracoes

### Riscos mais provaveis

- pressa para copiar boilerplate do legado
- misturar setup tecnico com feature

### Sinal de que a fase terminou

O repo existe, e o time consegue iniciar bootstrap sem tocar no legado.

---

## F1 - Bootstrap do monorepo

### Objetivo da fase

Criar a estrutura inicial do monorepo interno.

### Entradas obrigatorias

- `F0` concluida

### Entregaveis verificaveis

- estrutura inicial de `apps` e `packages`
- CI minima
- runtime web minimo
- worker runtime minimo
- boundaries iniciais coerentes com ADR-006

### Nao fazer nesta fase

- IAM real completo
- onboarding
- integracoes reais

### Riscos mais provaveis

- tentar preencher o monorepo com modulos cedo demais
- criar boundaries fracos

### Sinal de que a fase terminou

O monorepo inicial funciona e esta pronto para receber os contratos fundacionais.

---

## F2 - Platform Core

### Objetivo da fase

Transformar contratos fundacionais em tipos, interfaces e estruturas base.

### Entradas obrigatorias

- `F1` concluida
- `CONTRACT-PACK.md` como fonte oficial

### Entregaveis verificaveis

- base de `TenantContext`
- base de `DataAccessContext`
- base de `AuditEvent`
- base de `OutboxEvent`
- base de `JobEnvelope`

### Nao fazer nesta fase

- UX completa
- modulo funcional
- auth real fim a fim

### Riscos mais provaveis

- deixar contratos implicitos no codigo
- materializar tipos sem regras de uso

### Sinal de que a fase terminou

Os contratos centrais existem como primitives de foundation e podem ser reutilizados com coerencia.

---

## F3 - IAM client / Machine Identity

### Objetivo da fase

Plugar autenticacao tecnica e humana no nivel de cliente e abstracao.

### Entradas obrigatorias

- `F2` concluida
- ADR-001 e ADR-013 como fonte oficial

### Entregaveis verificaveis

- cliente do IAM
- abstracao de `AuthToken`
- abstracao de `MachineIdentity`
- abstracao de `ServiceTokenClaims`
- abstracao de `ServiceAudience`

### Nao fazer nesta fase

- fluxo completo de UX de login
- federacao
- SSO/SAML

### Riscos mais provaveis

- criar auth local para acelerar
- misturar identidade humana e tecnica

### Sinal de que a fase terminou

O runtime ja entende identidade humana e tecnica sem atalho fora do contrato oficial.

---

## F4 - Tenancy enforcement

### Objetivo da fase

Aplicar isolamento real de tenant no runtime e na camada de acesso.

### Entradas obrigatorias

- `F3` concluida
- ADR-002 e ADR-011 como fonte oficial

### Entregaveis verificaveis

- `TenantContext` propagado
- `DataAccessContext` aplicado
- guardrails de acesso a dados
- politica de `raw SQL` refletida no runtime

### Nao fazer nesta fase

- relatorios globais complexos
- support tooling avancado

### Riscos mais provaveis

- bypass por SQL
- contexto de tenant parcial

### Sinal de que a fase terminou

Testes negativos de isolamento passam a ser parte obrigatoria da foundation.

---

## F5 - Audit + Observability

### Objetivo da fase

Colocar auditabilidade e observabilidade minima em funcionamento.

### Entradas obrigatorias

- `F4` concluida
- `OPERATIONAL-BASELINE.md` como fonte oficial

### Entregaveis verificaveis

- logging estruturado
- `correlation_id`
- `AuditEvent` basico
- liveness e readiness
- metricas e alertas minimos

### Nao fazer nesta fase

- observability stack completa de empresa madura
- analytics serving completo

### Riscos mais provaveis

- instrumentacao incompleta
- logs sem correlacao

### Sinal de que a fase terminou

O runtime e o worker se tornaram observaveis e auditaveis segundo a baseline.

---

## F6 - Worker runtime + Outbox/Inbox

### Objetivo da fase

Criar o runtime assincrono operacional do novo SaaS.

### Entradas obrigatorias

- `F5` concluida
- ADR-004 e ADR-015 como fonte oficial

### Entregaveis verificaveis

- fila
- scheduler dedicado
- `JobEnvelope`
- `OutboxEvent`
- `InboxEvent`
- retry e DLQ

### Nao fazer nesta fase

- integracoes externas reais pesadas
- analytics serving completo

### Riscos mais provaveis

- replay mal definido
- scheduler improprio
- retry sem idempotencia

### Sinal de que a fase terminou

O sistema ja suporta jobs e side effects de forma assincrona, rastreavel e controlada.

---

## F7 - SecretRef foundation

### Objetivo da fase

Materializar o fluxo base de resolucao de segredos por referencia.

### Entradas obrigatorias

- `F6` concluida
- ADR-003 e `CONTRACT-PACK.md`

### Entregaveis verificaveis

- contrato de `SecretRef`
- fluxo base de resolucao
- consumo coerente por runtime e worker

### Nao fazer nesta fase

- onboarding real de credenciais de clientes
- integracao complexa com KMS/Vault

### Riscos mais provaveis

- atalhos com segredo no payload
- acesso direto ao store

### Sinal de que a fase terminou

Nenhum componente fundacional depende de acesso direto a segredo.

---

## F8 - Onboarding minimo + Entitlements base

### Objetivo da fase

Criar o control plane minimo para tenants e go-live controlado.

### Entradas obrigatorias

- `F7` concluida
- ADR-008 e ADR-014 como fonte oficial

### Entregaveis verificaveis

- state machine minima
- `EntitlementGrant`
- go-live gate

### Nao fazer nesta fase

- self-service completo
- billing automatizado
- UX comercial sofisticada

### Riscos mais provaveis

- onboarding crescer demais
- grants virarem regra espalhada

### Sinal de que a fase terminou

A foundation esta completa o suficiente para receber um primeiro modulo real.

---

## F9 - Primeiro modulo funcional

### Objetivo da fase

Validar a foundation com um primeiro slice de produto.

### Entradas obrigatorias

- `F8` concluida
- `MVP-SCOPE.md` aprovado

### Entregaveis verificaveis

- modulo funcional escolhido implementado sobre a base
- validacao real de tenancy, grants, audit e runtime

### Nao fazer nesta fase

- expandir para produto inteiro
- puxar integracoes pesadas do legado

### Riscos mais provaveis

- escopo inflar
- modulo errado virar teste de tudo

### Sinal de que a fase terminou

Existe um modulo real funcionando sem comprometer a ordem de evolucao da plataforma.

---

## F10 - Hardening

### Objetivo da fase

Endurecer a foundation apos a validacao do primeiro modulo real.

### Entradas obrigatorias

- `F9` concluida

### Entregaveis verificaveis

- restore drill inicial
- replay validado
- reconciliacao validada
- ajustes de resilience e readiness

### Nao fazer nesta fase

- reescrever base tecnica
- reabrir arquitetura por conveniencia

### Riscos mais provaveis

- hardening virar backlog sem fim
- usar essa fase para corrigir fundacao mal executada

### Sinal de que a fase terminou

A foundation fica pronta para entrar em um segundo ciclo de produto sem fragilidade estrutural.
