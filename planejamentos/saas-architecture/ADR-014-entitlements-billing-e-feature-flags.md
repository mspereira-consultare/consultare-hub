# ADR-014 - Entitlements, Billing e Feature Flags

- Status: Aprovada
- Prioridade: P1
- Relacoes: Complementa ADR-008 e depende de ADR-001 e ADR-011. Tem relacao forte com ADR-015 para medicao de uso.

## Contexto

O novo SaaS precisa controlar capacidade por tenant, liberar modulos por plano e preparar o terreno para cobranca recorrente futura. Sem um contrato tecnico claro, feature flags e regras comerciais tendem a se misturar de forma fragil na UI e em scripts operacionais.

## Problema

Sem separar plano comercial, entitlement tecnico e flag operacional:

- features podem ser bloqueadas apenas na interface;
- planos ficam acoplados ao futuro gateway de pagamento;
- limites de uso nascem sem trilha confiavel;
- onboarding libera capabilities por convencao, nao por contrato;
- suporte passa a ajustar permissao comercial manualmente.

## Opcoes consideradas

### 1. Adiar tudo ate o gateway de cobranca

Implementar apenas quando a cobranca automatizada estiver pronta.

### 2. Tratar tudo como flags manuais

Usar apenas feature flags e configuracoes operacionais para liberar capabilities.

### 3. Criar camada interna de entitlements e uso

Tratar plano, grants tecnicos, limite de uso e flags operacionais como contratos internos desde a foundation.

## Decisao

Foi aprovada uma camada interna de `Entitlements, Billing e Feature Flags`.

A decisao inclui:

- `Plan` como definicao comercial de referencia;
- `EntitlementGrant` como contrato tecnico canonico que libera capability por tenant;
- `SubscriptionState` interno, mesmo quando a cobranca inicial ainda for operacional/manual;
- `FeatureFlag` restrita a comportamento operacional ou rollout, sem substituir entitlement;
- `UsageMeter` ou `UsageLedger` append-only para capacidades que exigirem medicao;
- enforcement sempre server-side, com UI apenas refletindo a decisao do backend;
- gateway de pagamento futuro tratado por adapter boundary, sem virar fonte direta de autorizacao.

## Justificativa

O produto precisa separar desde cedo o que e politica comercial, o que e liberacao tecnica e o que e rollout operacional. Essa separacao evita que o core de autorizacao seja reescrito quando o billing automatizado entrar.

## Trade-offs

- Introduz mais modelagem antes de existir cobranca automatizada completa.
- Aumenta a disciplina entre onboarding, admin global e runtime.
- Reduz o risco de a UI virar ponto unico de enforcement.
- Prepara billing futuro sem travar a foundation ao gateway.

## Enforcement operacional

- Nenhuma capability tenant-scoped pode ser bloqueada ou liberada apenas na UI.
- `FeatureFlag` nao pode substituir `EntitlementGrant` para liberar capacidade comercial.
- Onboarding deve provisionar plano e grants de forma explicita.
- Ajustes manuais de subscription ou grants devem gerar trilha de auditoria.
- Consumo medido deve registrar uso em estrutura append-only quando houver limite tecnico ou comercial associado.

## Contratos envolvidos

- `Plan`: definicao comercial de referencia para um tenant.
- `SubscriptionState`: estado vigente da assinatura, mesmo antes do gateway automatizado.
- `EntitlementGrant`: grant tecnico que libera ou bloqueia capability por tenant.
- `UsageMeter`: contrato de medicao de uso ou ledger append-only para limites consumiveis.
- `FeatureFlag`: flag operacional de rollout ou comportamento, distinta de entitlement comercial.

## Riscos

- Flags operacionais serem usadas para contornar entitlements.
- Estado manual de subscription virar legado dificil de substituir.
- Medicao de uso ser pensada tarde demais e gerar refactor.
- Time misturar permissao funcional com regra comercial.
- Gateway futuro tentar impor modelo diferente do contrato interno.

## Reversibilidade

Media.

O gateway pode mudar, os planos podem evoluir e o pricing pode ser revisto. O que nao deve mudar e a existencia de um contrato tecnico proprio de entitlements desacoplado do provedor de cobranca.

## Criterios obrigatorios de validacao

- Existe separacao explicita entre `Plan`, `EntitlementGrant` e `FeatureFlag`.
- Um tenant sem grant nao acessa capability mesmo se a UI tentar expor o recurso.
- Ajustes manuais de subscription ou entitlement geram auditoria.
- Capacidades com limite medido possuem `UsageMeter` ou ledger equivalente.
- A entrada futura de gateway nao exige redesenhar o contrato tecnico de capabilities.
