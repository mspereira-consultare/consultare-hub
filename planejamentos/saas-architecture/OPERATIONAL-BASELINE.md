# Operational Baseline

## Objetivo

Este documento define a baseline operacional minima obrigatoria antes do primeiro commit do novo SaaS.

O objetivo nao e operacao enterprise completa. O objetivo e garantir uma base coerente com a arquitetura aprovada em Railway, MySQL e Valkey, sem deixar observabilidade, recovery e runtime behavior implicitos.

---

## Principios

- A baseline vale para `IAM`, `saas-api`, `worker-runtime`, `secret-service`, `analytics-serving` e `legacy-bridge`.
- Seguranca entre servicos nao depende apenas de rede privada.
- Logs tecnicos, metricas, tracing, backup, restore e runbooks minimos sao gates de foundation.
- `Valkey` nao e fonte autoritativa de negocio.
- `MySQL` continua sendo a fonte autoritativa de dados transacionais, auditoria e estado persistente.

---

## Railway operational assumptions

- Railway continua valido para a fase de foundation.
- Cada componente critico deve ter deployable separado conforme ADR-000.
- Rede privada do Railway ajuda, mas nao substitui `MachineIdentity` e `ServiceTokenClaims`.
- Se o plano escolhido do Railway nao suportar cumprir a baseline abaixo, o gate de foundation permanece fechado.

---

## Pooling e connection budgets

### Regra global

- Usar no maximo `80%` de `max_connections` de cada MySQL para pools aplicacionais.
- Reservar `20%` para headroom, recovery, observabilidade e acesso administrativo controlado.

### OLTP

Do orcamento aplicacional de `80%`:

- `web`: `35%`
- `workers`: `35%`
- `secret-service`: `10%`
- `analytics extraction/materialization`: `10%`
- `legacy-bridge`: `5%`
- `migrations/support tooling`: `5%`

### IAM DB

Do orcamento aplicacional de `80%`:

- `iam runtime`: `70%`
- `admin/migrations`: `10%`
- `headroom operacional`: `20%`

### Regra por replica

- Pool por replica = `budget do servico / max replicas planejadas`
- Nenhum deployable pode assumir pool sem considerar escala horizontal prevista.

---

## Tracing e correlation

- `correlation_id` e obrigatorio em request, job, outbox, inbox, audit e export.
- `traceparent` ou equivalente deve ser propagado em HTTP interno e em envelopes de job.
- O gate minimo nao exige stack de tracing enterprise completa, mas exige propagacao coerente, logs correlacionaveis e capacidade de seguir uma operacao ponta a ponta.

---

## Logging minimo

- Logs tecnicos estruturados em JSON.
- Campos minimos quando disponiveis:
  - `timestamp`
  - `service`
  - `environment`
  - `level`
  - `message`
  - `correlation_id`
  - `request_id`
  - `tenant_id`
  - `actor_id` ou `machine_identity_id`
  - `job_id`
- E explicitamente proibido logar:
  - secrets
  - access tokens
  - refresh tokens
  - payloads sensiveis brutos

---

## Metricas minimas

### HTTP e API

- request rate
- error rate
- latency

### IAM

- login success/failure
- refresh success/failure
- token issuance latency
- failed auth by cause

## SLO inicial do IAM

- disponibilidade mensal alvo: `99.5%`
- P95 de login, refresh e emissao de token interno na mesma regiao: `<= 500 ms`
- propagacao de revogacao e mudanca de grants em caches internos: `<= 5 minutos`

Estes valores sao metas operacionais iniciais de foundation. Nao sao SLA comercial externo.

### Workers e filas

- queue depth
- oldest queued age
- retry count
- DLQ count
- success/failure por `job_type`

### Banco

- pool utilization
- connection failures
- slow queries

### Analytics

- freshness lag
- failed materializations

### Secrets

- read failures
- rotation failures

### Outbox/Inbox

- pending count
- dispatch lag
- replay failures

---

## Alertas minimos

- IAM availability abaixo do SLO
- queue depth acima do limite operacional definido
- oldest queued age acima de `15 minutos`
- DLQ maior que `0` por mais de `15 minutos`
- DB pool saturation acima de `80%` de forma sustentada
- analytics freshness acima do SLO do pipeline
- falha de backup
- falha de restore verification

---

## Backup policy

- MySQL critico: snapshots diarios + PITR quando suportado pelo plano escolhido.
- Se PITR nao estiver disponivel, deve existir export logico complementar em cadencia suficiente para cumprir o RPO definido.
- Se o plano operacional nao permitir isso, o gate de foundation permanece fechado.
- `Valkey` nao e gate primario de backup por nao ser fonte autoritativa.
- `analytics-serving` pode ser restaurado por backup ou rebuild, desde que cumpra o RTO definido.

---

## Restore drills

- Deve existir runbook documentado para:
  - `IAM DB`
  - `OLTP`
  - `Secret Service store`
  - `Audit store`
  - `analytics-serving`
- Deve ocorrer `1 restore drill completo` antes do primeiro go-live compartilhado.
- Depois disso, a frequencia minima esperada e `trimestral` para componentes criticos.
- Recovery de fila deve ser testado por replay de `OutboxEvent` e reconciliacao, nao por confiar em persistencia do `Valkey`.

---

## Queue retry policy

- Retry default de foundation:
  - tentativa 1 -> imediata
  - tentativa 2 -> `1 minuto`
  - tentativa 3 -> `5 minutos`
  - tentativa 4 -> `15 minutos`
  - tentativa 5 -> `60 minutos`
  - tentativa 6 -> `180 minutos`
- Para evitar ambiguidade, o limite default de retry e `5 retries apos a primeira tentativa`, totalizando `6 execucoes maximas`.
- Sempre com `backoff + jitter`.

---

## Queue DLQ policy

- Excedendo o limite de retries, o job vai para `DLQ`.
- Replay de `DLQ` so pode ocorrer:
  - por fluxo auditado
  - com job idempotente
  - com motivo operacional registrado
- `DLQ` maior que `0` nao e falha automatica de plataforma, mas `DLQ > 0 por mais de 15 minutos` e alerta obrigatorio.

---

## Scheduler behavior

- Scheduler usa `single active leader`.
- Leader election usa lease em storage autoritativo.
- Lease TTL: `30 segundos`
- Heartbeat: `10 segundos`
- Failover alvo: `<= 60 segundos`
- O runtime web nao executa papel de scheduler.

---

## Worker health checks

### Liveness

- Processo responsivo.

### Readiness

- acesso a `Valkey`
- acesso ao DB autoritativo necessario
- emissao ou renovacao de token tecnico quando aplicavel
- dependencias minimas necessarias para o job atual

Worker degradado nao deve continuar consumindo fila.

---

## Timeout policy

- outbound HTTP connect timeout: `5 segundos`
- outbound HTTP total timeout default: `30 segundos`
- DB acquisition timeout: `2 segundos`
- job soft timeout default: `10 minutos`
- job hard timeout default: `15 minutos`
- excecoes so por `job_type` documentado

---

## Idempotencia

- Todo side effect externo relevante deve carregar `idempotency_key`.
- `JobEnvelope`, `OutboxEvent` e `InboxEvent` devem permitir replay seguro.
- Reexecucao manual sem contrato de idempotencia e proibida.

---

## Observabilidade minima

- logs estruturados
- `correlation_id` obrigatorio
- tracing/correlation ponta a ponta
- metricas minimas por componente
- alertas minimos ativos
- health checks de liveness e readiness por deployable

---

## Valkey persistence assumptions

- `Valkey` e tratado como camada de fila/cache operacional, nao fonte autoritativa.
- Perda de fila deve ser recuperavel por `MySQL + Outbox + reconciliacao`.
- Persistencia do `Valkey` melhora resiliencia, mas nao substitui replay seguro.

---

## Failure domains

- Falha do `IAM` bloqueia novos logins, refresh e novos service tokens, mas tokens validos continuam ate expirar.
- Falha do `Valkey` nao invalida `OLTP`; recovery vem de replay e reconciliacao.
- Falha de `analytics-serving` nao bloqueia `OLTP`.
- Falha do `secret-service` pode bloquear integracoes dependentes, mas nao deve corromper dados transacionais ja persistidos.
- Falha da `legacy-bridge` nao pode bloquear o core runtime do novo SaaS.

---

## Runbooks minimos esperados

- restore de MySQL por servico
- replay de `DLQ`
- recovery de scheduler
- rotacao de `KEK` e de credencial de bootstrap
- incidente de stale grants no IAM
- atraso de analytics freshness

---

## RPO/RTO por servico

| Servico | Fonte autoritativa | RPO | RTO | Recovery path |
| --- | --- | --- | --- | --- |
| IAM DB | MySQL IAM | 15 min | 2 h | restore + replay de configuracoes nao persistidas |
| OLTP | MySQL SaaS | 15 min | 2 h | restore + reconciliacao operacional |
| Secret Service store | MySQL/secret store do SaaS | 15 min | 2 h | restore consistente com KEK e versoes |
| Audit store | MySQL audit | 15 min | 4 h | restore + export/reindex quando necessario |
| Analytics serving | MySQL analytics | 24 h | 8 h | restore ou rebuild por pipeline |
| Valkey queue | nao autoritativa | n/a | 2 h | replay de outbox + reconciliacao |
