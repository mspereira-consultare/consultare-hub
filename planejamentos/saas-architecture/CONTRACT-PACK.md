# Contract Pack

## Objetivo

Este documento congela os contratos fundacionais que nao podem ficar implicitos no codigo da foundation.

Os contratos abaixo sao obrigatorios para o novo SaaS e devem ser tratados como fonte oficial junto com as ADRs aprovadas. O objetivo e tirar decisoes do implementador e coloca-las explicitamente na fundacao documental.

---

## Defaults globais

- `AuthToken` humano usa TTL de `15 minutos`.
- `refresh token` usa TTL de `30 dias`, com rotacao obrigatoria a cada uso.
- `ServiceTokenClaims` usa TTL de `5 minutos`.
- `MFA` no day-1 e obrigatorio apenas para `global admins` e `tenant admins`.
- `correlation_id` e obrigatorio em request, job, audit, outbox, inbox e export.
- Todo fluxo tenant-scoped e compativel com `TenantContext`.
- Todo side effect externo relevante usa `OutboxEvent` + `JobEnvelope` + `idempotency_key`.

---

## TenantContext

### Proposito

Representar o contexto efetivo de tenancy de qualquer operacao tenant-scoped ou global-scoped.

### Owner

`Platform Core / Tenancy`

### Formato conceitual

Contexto imutavel propagado por request, job, auditoria, export e pipeline interno.

### Campos obrigatorios

- `tenant_id` quando o escopo for tenant-scoped
- `organization_id`
- `system_id`
- `actor_type`
- `actor_id`
- `scope_kind`
- `correlation_id`

### Invariantes obrigatorias

- Operacao tenant-scoped nunca existe sem `tenant_id`.
- `scope_kind` so pode ser `tenant` ou `global`.
- `scope_kind=global` nao pode reutilizar o mesmo caminho de execucao de uma operacao tenant-scoped sem grant global explicito.
- `correlation_id` nao pode ser nulo.

### Propagacao

- HTTP request
- job assinado
- `AuditEvent`
- `OutboxEvent`
- exportacao
- pipeline de analytics

### Lifecycle

Criado no ponto de entrada da operacao, propagado de forma imutavel e encerrado com a operacao ou job.

### Regras de seguranca

- Nao pode ser montado a partir de cache implicito.
- Nao pode ser sobrescrito por payload de usuario sem validacao de grants.
- `tenant_id` vindo de header externo so vale apos validacao pelo IAM e pelo runtime.

### Observabilidade

- Deve ser refletido em logs tecnicos via `correlation_id`, `tenant_id`, `actor_id`.
- Deve estar presente em metricas e tracing quando aplicavel.

### Requisitos de auditoria

- Toda operacao auditavel deve persistir `tenant_id` ou `scope_kind=global`.
- Toda elevacao para escopo global deve ser rastreavel.

### Failure semantics

- Sem `TenantContext`, operacao tenant-scoped falha por design.
- `scope_kind=global` sem grant global falha por autorizacao.

### Quem pode emitir

- runtime web
- worker runtime
- admin platform
- bridge read-only quando gerar staging ou reconciliacao

### Quem pode consumir

- data access layer
- audit
- workers
- analytics pipelines
- services internos

### O que e explicitamente proibido

- Inferir `tenant_id` apenas por subdominio, cache ou valor default.
- Criar operacao tenant-scoped sem contexto explicito.
- Usar `scope_kind=global` como superuser implicito.

### Exemplo valido

```json
{
  "tenant_id": "ten_123",
  "organization_id": "org_001",
  "system_id": "saas-api",
  "actor_type": "user",
  "actor_id": "usr_456",
  "scope_kind": "tenant",
  "correlation_id": "corr_abc123"
}
```

### Exemplo invalido

```json
{
  "organization_id": "org_001",
  "system_id": "saas-api",
  "actor_type": "user",
  "actor_id": "usr_456",
  "scope_kind": "tenant",
  "correlation_id": "corr_abc123"
}
```

Invalido porque uma operacao tenant-scoped nao pode existir sem `tenant_id`.

### Compatibilidade com multi-tenancy

Contrato base de isolamento logico.

### Compatibilidade com workers

Todo `JobEnvelope` tenant-scoped carrega `tenant_id` e `correlation_id` derivados deste contexto.

### Compatibilidade com analytics

Pipelines analiticos precisam carregar `tenant_id` ou grant global explicito.

### Compatibilidade com IAM

`actor_id`, `actor_type` e grants efetivos devem ser derivados de identidade validada pelo IAM.

---

## DataAccessContext

### Proposito

Representar o contexto minimo obrigatorio para qualquer acesso a dado de dominio.

### Owner

`Platform Core / Data Access`

### Formato conceitual

Envelope de acesso composto por `TenantContext` + motivo operacional + modo de acesso.

### Campos obrigatorios

- `tenant_context`
- `access_reason`
- `access_mode`
- `grant_source`

### Invariantes obrigatorias

- Tabela tenant-scoped nao pode ser acessada sem `tenant_context`.
- `grant_source=global` e obrigatorio para acessos cross-tenant.
- `access_mode` deve distinguir leitura, escrita ou manutencao aprovada.

### Propagacao

Criado na borda do servico e consumido pela camada aprovada de data access.

### Lifecycle

Existe apenas durante a operacao de acesso ao dado.

### Regras de seguranca

- `raw SQL` tenant-scoped fora da camada aprovada e proibido.
- Queries globais nao podem ser reutilizadas em fluxos tenant-scoped sem validacao.

### Observabilidade

- Slow query e erro de acesso devem carregar `correlation_id` e `tenant_id` quando existir.

### Requisitos de auditoria

- Acessos globais e de suporte devem registrar `access_reason`.

### Failure semantics

- Ausencia de `DataAccessContext` invalida acesso tenant-scoped.
- `grant_source` inconsistente invalida acesso global.

### Quem pode emitir

- runtime web
- worker runtime
- admin platform

### Quem pode consumir

- repositories
- query services aprovados
- pipelines de analytics aprovados

### O que e explicitamente proibido

- SQL tenant-scoped fora da camada aprovada.
- Reaproveitar `DataAccessContext` global em operacao tenant-scoped por conveniencia.

### Exemplo valido

```json
{
  "tenant_context": {
    "tenant_id": "ten_123",
    "organization_id": "org_001",
    "system_id": "saas-api",
    "actor_type": "user",
    "actor_id": "usr_456",
    "scope_kind": "tenant",
    "correlation_id": "corr_abc123"
  },
  "access_reason": "api_request",
  "access_mode": "read",
  "grant_source": "tenant_membership"
}
```

### Exemplo invalido

```json
{
  "access_reason": "report",
  "access_mode": "read",
  "grant_source": "none"
}
```

Invalido porque nao existe `tenant_context` nem grant global autorizado.

### Compatibilidade com multi-tenancy

Obrigatorio para enforcement de `tenant_id`.

### Compatibilidade com workers

Workers devem construir `DataAccessContext` a partir de `JobEnvelope`.

### Compatibilidade com analytics

Acesso analitico global exige grant global explicito e trilha propria.

### Compatibilidade com IAM

`grant_source` deve refletir grant resolvido a partir do IAM.

---

## AuthToken

### Proposito

Representar o access token humano canonico emitido pelo IAM para chamadas interativas e autenticadas.

### Owner

`IAM`

### Formato conceitual

JWT assinado para identidade humana e sessao ativa.

### Campos obrigatorios

- `iss`
- `sub`
- `aud`
- `iat`
- `exp`
- `jti`
- `session_id`
- `token_type`
- `actor_type`
- `active_tenant_id` quando a chamada for tenant-scoped
- `grant_version`
- `amr`

### Invariantes obrigatorias

- `token_type` deve ser `access`.
- `actor_type` deve ser `user`.
- TTL fixo de `15 minutos`.
- `aud` e obrigatoria e restrita ao sistema consumidor.
- `grant_version` deve permitir invalidacao de sessoes/grants stale.
- `amr` deve indicar o metodo de autenticacao utilizado.
- Para `global admins` e `tenant admins`, `amr` deve indicar MFA no day-1.

### Propagacao

- browser -> backend
- frontend -> backend
- backend -> IAM para validacao quando necessario

### Lifecycle

Emitido pelo IAM apos autenticacao, expira em `15 minutos`, renovado apenas via refresh token valido. O refresh token tem TTL de `30 dias`, rotaciona a cada uso e reuso de token invalidado encerra a cadeia da sessao.

### Regras de seguranca

- Nunca armazenar em log.
- Nunca usar como identidade permanente de worker ou servico.
- Rotacao e revogacao de sessao controladas server-side.
- MFA obrigatorio no day-1 para `global admins` e `tenant admins`.

### Observabilidade

- Login, refresh, expiracao e revogacao devem gerar metricas e logs tecnicos.
- Falhas de validacao por `aud`, `exp` ou revogacao devem ser observaveis.

### Requisitos de auditoria

- Login, refresh, logout e falha de autenticacao devem gerar `AuditEvent`.
- Mudanca de sessao ou revogacao deve ser rastreavel.

### Failure semantics

- Token expirado falha com autenticacao invalida.
- Token revogado falha imediatamente.
- `active_tenant_id` ausente em chamada tenant-scoped falha.
- Reuso de refresh token invalidado encerra a sessao associada.

### Quem pode emitir

- IAM

### Quem pode consumir

- saas-api
- admin platform
- outros sistemas autorizados pela `aud`

### O que e explicitamente proibido

- Usar `AuthToken` como token de servico.
- Emitir sem `aud` explicita.
- Aceitar token expirado ou revogado por tolerancia operacional.

### Exemplo valido

```json
{
  "iss": "iam.consultare.internal",
  "sub": "usr_456",
  "aud": "saas-api",
  "iat": 1767225600,
  "exp": 1767226500,
  "jti": "atk_001",
  "session_id": "ses_001",
  "token_type": "access",
  "actor_type": "user",
  "active_tenant_id": "ten_123",
  "grant_version": 7,
  "amr": ["password"]
}
```

### Exemplo invalido

```json
{
  "iss": "iam.consultare.internal",
  "sub": "usr_456",
  "token_type": "access"
}
```

Invalido porque faltam `aud`, `iat`, `exp`, `jti`, `session_id` e `grant_version`.

### Compatibilidade com multi-tenancy

Precisa carregar `active_tenant_id` para chamadas tenant-scoped.

### Compatibilidade com workers

Nao e identidade de worker. Jobs podem carregar referencia ao ator humano, nao o token em si.

### Compatibilidade com analytics

Pode autorizar consultas interativas, nunca pipelines tecnicos.

### Compatibilidade com IAM

Contrato canonico do IAM para usuarios humanos.

---

## MachineIdentity

### Proposito

Representar a identidade tecnica canonica de um servico ou deployable.

### Owner

`IAM / Platform Security`

### Formato conceitual

Identidade de maquina registrada e habilitada para emissao de token tecnico.

### Campos obrigatorios

- `machine_identity_id`
- `service_name`
- `environment`
- `allowed_audiences`
- `status`

### Invariantes obrigatorias

- Cada deployable relevante tem identidade propria.
- `status` deve distinguir ativo, suspenso ou revogado.
- `allowed_audiences` nao aceita wildcard.

### Propagacao

Persistida no IAM e usada para emissao de `ServiceTokenClaims`.

### Lifecycle

Provisionada antes do deploy, usada em runtime, rotacionada por credencial de bootstrap e revogavel.

### Regras de seguranca

- Nao compartilhar identidade entre `web`, `worker`, `analytics`, `secret-service` e `bridge`.
- Credencial estatica so serve como bootstrap.

### Observabilidade

- Falha de emissao, expiracao e uso indevido devem ser metricas criticas.

### Requisitos de auditoria

- Criacao, revogacao e alteracao de `allowed_audiences` sao auditaveis.

### Failure semantics

- Identidade suspensa ou revogada nao emite novos tokens.
- Servico sem identidade valida entra em estado nao pronto.

### Quem pode emitir

- IAM registra e governa a identidade.

### Quem pode consumir

- runtime web
- worker runtime
- secret service
- analytics pipeline
- legacy bridge

### O que e explicitamente proibido

- Uma identidade tecnica unica para todo o ecossistema.
- Reusar identidade humana como identidade de maquina.

### Exemplo valido

```json
{
  "machine_identity_id": "mid_worker_runtime_prod",
  "service_name": "worker-runtime",
  "environment": "prod",
  "allowed_audiences": ["secret-service", "saas-api"],
  "status": "active"
}
```

### Exemplo invalido

```json
{
  "machine_identity_id": "mid_shared",
  "service_name": "all-services",
  "environment": "prod",
  "allowed_audiences": ["*"],
  "status": "active"
}
```

Invalido porque generaliza identidade tecnica e usa audience wildcard.

### Compatibilidade com multi-tenancy

Nao carrega tenant por padrao; tenant aparece no contexto da operacao, nao na identidade da maquina.

### Compatibilidade com workers

Obrigatoria para workers emitirem chamadas internas.

### Compatibilidade com analytics

Obrigatoria para pipelines e materializacoes.

### Compatibilidade com IAM

Fonte autoritativa e o IAM.

---

## ServiceTokenClaims

### Proposito

Representar o token tecnico de curta duracao para comunicacao entre servicos.

### Owner

`IAM`

### Formato conceitual

JWT tecnico emitido para uma `MachineIdentity`.

### Campos obrigatorios

- `iss`
- `sub`
- `aud`
- `iat`
- `exp`
- `jti`
- `token_type`
- `service_name`

### Invariantes obrigatorias

- `token_type` deve ser `service`.
- TTL fixo de `5 minutos`.
- `sub` referencia `machine_identity_id`.
- Nao carrega sessao humana.

### Propagacao

- HTTP interno
- chamada entre servicos
- bootstrap de job quando precisar falar com services internos

### Lifecycle

Emitido sob demanda, expira em `5 minutos`, renovado por credencial de bootstrap valida.

### Regras de seguranca

- Validar sempre `issuer`, `audience`, `exp` e `service_name`.
- Nao persistir em logs.
- Nao usar como substituto de grant humano.

### Observabilidade

- Emissao, rejeicao e expiracao devem ter metricas por servico.

### Requisitos de auditoria

- Emissao de token tecnico nao precisa virar auditoria de negocio, mas revogacao de identidade e alteracao de escopo precisam.

### Failure semantics

- Token expirado ou audience incorreta falha imediatamente.
- Falha de emissao torna o servico nao pronto para chamadas dependentes.

### Quem pode emitir

- IAM

### Quem pode consumir

- servicos internos definidos pela audience

### O que e explicitamente proibido

- Usar `ServiceTokenClaims` para autenticar usuario humano.
- Aceitar token sem audience explicita.

### Exemplo valido

```json
{
  "iss": "iam.consultare.internal",
  "sub": "mid_worker_runtime_prod",
  "aud": "secret-service",
  "iat": 1767225600,
  "exp": 1767225900,
  "jti": "stk_001",
  "token_type": "service",
  "service_name": "worker-runtime"
}
```

### Exemplo invalido

```json
{
  "iss": "iam.consultare.internal",
  "sub": "usr_456",
  "aud": "secret-service",
  "token_type": "service"
}
```

Invalido porque o `sub` aponta para usuario humano e faltam `iat`, `exp` e `jti`.

### Compatibilidade com multi-tenancy

Nao substitui `TenantContext`.

### Compatibilidade com workers

Obrigatorio para worker falar com secrets, API ou control plane.

### Compatibilidade com analytics

Obrigatorio para pipelines tecnicos internos.

### Compatibilidade com IAM

Emitido e validado segundo contratos do IAM.

---

## ServiceAudience

### Proposito

Definir o conjunto canonico de audiences tecnicas aceitas entre servicos.

### Owner

`IAM`

### Formato conceitual

Enum operacional controlado pelo IAM.

### Campos obrigatorios

- `audience_key`

### Invariantes obrigatorias

- Valor deve pertencer ao conjunto aprovado.
- Nao existe audience wildcard.

### Propagacao

Definida em tokens tecnicos e tokens humanos.

### Lifecycle

Evolui por adicao controlada de novas audiences.

### Regras de seguranca

- Toda chamada valida audience.

### Observabilidade

- Erros de audience devem ser metricas e logs tecnicos.

### Requisitos de auditoria

- Alteracao do conjunto de audiences e auditavel em nivel de plataforma.

### Failure semantics

- Audience desconhecida falha.

### Quem pode emitir

- IAM

### Quem pode consumir

- todos os verificadores de token

### O que e explicitamente proibido

- Audience generica como `internal`.

### Exemplo valido

```json
["iam", "saas-api", "secret-service", "worker-runtime", "analytics-pipeline", "legacy-bridge"]
```

### Exemplo invalido

```json
["*"]
```

Invalido porque audience wildcard e proibida.

### Compatibilidade com multi-tenancy

Nao substitui escopo de tenant.

### Compatibilidade com workers

Workers usam audiences explicitas por servico consumidor.

### Compatibilidade com analytics

Analytics usa `analytics-pipeline` ou audience equivalente explicita.

### Compatibilidade com IAM

Governado exclusivamente pelo IAM.

---

## SecretRef

### Proposito

Referenciar um segredo sem transportar seu valor.

### Owner

`Secret Service`

### Formato conceitual

Ponteiro tipado para segredo tenant-specific ou global.

### Campos obrigatorios

- `scope`
- `tenant_id` quando `scope=tenant`
- `integration_key`
- `secret_name`
- `version`

### Invariantes obrigatorias

- Nunca contem plaintext.
- `scope=tenant` exige `tenant_id`.
- `version` obrigatoria.

### Propagacao

- onboarding
- config service
- worker runtime
- integracoes

### Lifecycle

Criado na configuracao, referenciado por consumidores, versionado a cada rotacao.

### Regras de seguranca

- Resolucao so via secret service.
- Proibido logar valor ou armazenar valor em texto puro fora do store oficial.

### Observabilidade

- Falha de resolucao e latencia de leitura devem ser metricas.

### Requisitos de auditoria

- Leitura, criacao, alteracao e rotacao sao auditaveis.

### Failure semantics

- Segredo ausente, revogado ou inacessivel falha a operacao dependente.

### Quem pode emitir

- secret service
- onboarding/control plane ao registrar a referencia

### Quem pode consumir

- runtime web quando necessario
- worker runtime
- pipelines de integracao

### O que e explicitamente proibido

- Resolver segredo via SQL direto.
- Persistir plaintext em cache, logs ou payload de job.

### Exemplo valido

```json
{
  "scope": "tenant",
  "tenant_id": "ten_123",
  "integration_key": "feegow",
  "secret_name": "api_token",
  "version": 3
}
```

### Exemplo invalido

```json
{
  "scope": "tenant",
  "integration_key": "feegow",
  "secret_name": "api_token",
  "version": 3
}
```

Invalido porque `scope=tenant` exige `tenant_id`.

### Compatibilidade com multi-tenancy

Nativa para segredos por tenant.

### Compatibilidade com workers

Workers devem receber referencia, nunca plaintext.

### Compatibilidade com analytics

Analytics so consome quando houver pipeline que realmente exija integracao externa.

### Compatibilidade com IAM

Leitura depende de `MachineIdentity` ou grant humano autorizado.

---

## JobEnvelope

### Proposito

Definir o contrato canonico de execucao assincrona no worker runtime.

### Owner

`Worker Runtime`

### Formato conceitual

Envelope persistivel e reexecutavel para job tenant-scoped ou global controlado.

### Campos obrigatorios

- `job_id`
- `job_type`
- `tenant_id` quando o job for tenant-scoped
- `correlation_id`
- `idempotency_key`
- `dedupe_key`
- `concurrency_key`
- `scheduled_at`
- `attempt`
- `max_attempts`
- `payload_schema_version`

### Invariantes obrigatorias

- Job tenant-scoped nao existe sem `tenant_id`.
- Side effect externo exige `idempotency_key`.
- `attempt` inicia em `1`.
- `max_attempts` default de foundation e `5`.

### Propagacao

- queue
- DLQ
- replay
- audit

### Lifecycle

Criado por runtime ou pipeline, enfileirado, executado, reprocessado se necessario e encerrado em sucesso ou DLQ.

### Regras de seguranca

- Payload nao pode carregar secret em texto puro.
- Job nao pode depender de user token como identidade de servico.

### Observabilidade

- `job_id`, `job_type`, `tenant_id`, `attempt`, `correlation_id` obrigatorios em logs.
- Idade de fila e falha por tipo devem ser metricas.

### Requisitos de auditoria

- Jobs sensiveis ou administrativos devem gerar `AuditEvent`.

### Failure semantics

- Retry com backoff + jitter.
- Excedendo `max_attempts`, mover para DLQ.
- Replay apenas para jobs idempotentes e auditados.

### Quem pode emitir

- runtime web
- scheduler
- worker runtime
- pipelines internos

### Quem pode consumir

- worker runtime

### O que e explicitamente proibido

- Job tenant-scoped sem `tenant_id`.
- Job com segredo em plaintext no payload.
- Job externo sem `idempotency_key`.

### Exemplo valido

```json
{
  "job_id": "job_001",
  "job_type": "sync_feegow",
  "tenant_id": "ten_123",
  "correlation_id": "corr_abc123",
  "idempotency_key": "idem_sync_feegow_ten_123_20270101",
  "dedupe_key": "dedupe_sync_feegow_ten_123_20270101",
  "concurrency_key": "feegow_ten_123",
  "scheduled_at": "2027-01-01T12:00:00Z",
  "attempt": 1,
  "max_attempts": 5,
  "payload_schema_version": 1
}
```

### Exemplo invalido

```json
{
  "job_id": "job_001",
  "job_type": "sync_feegow",
  "correlation_id": "corr_abc123",
  "attempt": 1
}
```

Invalido porque faltam `tenant_id`, chaves de controle e campos minimos do envelope.

### Compatibilidade com multi-tenancy

Obrigatorio para isolamento de fila.

### Compatibilidade com workers

Contrato primario de runtime.

### Compatibilidade com analytics

Jobs analiticos usam envelope proprio, com tenant ou grant global conforme fluxo.

### Compatibilidade com IAM

Pode carregar referencia ao ator de origem, mas execucao usa `MachineIdentity`.

---

## AuditEvent

### Proposito

Definir o evento canonico de auditoria de negocio.

### Owner

`Platform Audit`

### Formato conceitual

Registro append-only logico de evento sensivel ou relevante de negocio.

### Campos obrigatorios

- `event_id`
- `occurred_at`
- `tenant_id` ou `scope_kind=global`
- `actor_type`
- `actor_id`
- `action`
- `entity_type`
- `entity_id`
- `status`
- `origin`
- `correlation_id`

### Invariantes obrigatorias

- Append-only logico.
- Segredos e PII nao entram sem redaction.
- `origin` deve distinguir `web`, `worker`, `admin`, `iam`, `bridge`.

### Propagacao

- audit store
- exportacao controlada
- consulta administrativa autorizada

### Lifecycle

Emitido no evento, persistido de forma canonica, exportado conforme retention class.

### Regras de seguranca

- Before/after bruto com segredos e proibido.
- Consulta cross-tenant so por fluxo administrativo autorizado.

### Observabilidade

- Falha de emissao deve ser detectavel.
- Volume, erro de persistencia e latencia devem ter metricas.

### Requisitos de auditoria

O proprio contrato e a trilha oficial de auditoria.

### Failure semantics

- Evento critico nao pode ser silenciosamente descartado.
- Falha de persistencia deve disparar erro operacional e reconciliacao.

### Quem pode emitir

- runtime web
- worker runtime
- IAM
- admin platform
- legacy bridge quando houver acao auditavel de controle

### Quem pode consumir

- audit store
- admin platform
- exportador autorizado

### O que e explicitamente proibido

- Tratar log tecnico como substituto de `AuditEvent`.
- Persistir valores secretos ou token bruto.

### Exemplo valido

```json
{
  "event_id": "aud_001",
  "occurred_at": "2027-01-01T12:00:00Z",
  "tenant_id": "ten_123",
  "actor_type": "user",
  "actor_id": "usr_456",
  "action": "secret.rotated",
  "entity_type": "tenant_secret",
  "entity_id": "sec_789",
  "status": "success",
  "origin": "admin-platform",
  "correlation_id": "corr_abc123"
}
```

### Exemplo invalido

```json
{
  "event_id": "aud_001",
  "action": "secret.rotated",
  "entity_type": "tenant_secret",
  "entity_id": "sec_789",
  "before": "old-secret-value"
}
```

Invalido porque falta contexto minimo e expoe valor secreto.

### Compatibilidade com multi-tenancy

Tenant admin so enxerga eventos do proprio tenant.

### Compatibilidade com workers

Jobs e replays relevantes devem produzir auditoria.

### Compatibilidade com analytics

Nao e fonte analitica generica; analytics pode usar agregados derivados e aprovados.

### Compatibilidade com IAM

Eventos de login, refresh, acesso negado e revogacao precisam ser compativeis.

---

## OutboxEvent

### Proposito

Representar a intencao persistida de disparar processamento assincrono ou integracao.

### Owner

`Platform Core / Integrations`

### Formato conceitual

Evento persistido na mesma transacao da mudanca de dominio relevante.

### Campos obrigatorios

- `outbox_event_id`
- `tenant_id` quando o agregado for tenant-scoped
- `aggregate_type`
- `aggregate_id`
- `event_type`
- `schema_version`
- `occurred_at`
- `correlation_id`
- `dispatch_state`

### Invariantes obrigatorias

- Persistido na mesma transacao da mudanca que o originou.
- `dispatch_state` deve distinguir pendente, processado, falho e descartado por politica.
- Evento tenant-scoped exige `tenant_id`.

### Propagacao

- dispatcher
- worker runtime
- analytics pipeline
- reconciliacao

### Lifecycle

Criado na transacao, lido por dispatcher, entregue a consumidores, marcado conforme resultado e reprocessavel por reconciliacao.

### Regras de seguranca

- Nao conter segredo em plaintext.
- Nao carregar payload livre sem schema version.

### Observabilidade

- Dispatch lag, pending count e falha de entrega sao metricas obrigatorias.

### Requisitos de auditoria

- Alteracoes administrativas em politicas de dispatch ou replay sao auditaveis.

### Failure semantics

- Falha de dispatch nao invalida a transacao original.
- Dispatcher deve permitir replay seguro.

### Quem pode emitir

- dominios transacionais aprovados

### Quem pode consumir

- dispatcher
- worker runtime
- analytics materializer
- reconciliacao

### O que e explicitamente proibido

- Side effect critico sem outbox.
- Outbox sem schema version ou sem `correlation_id`.

### Exemplo valido

```json
{
  "outbox_event_id": "out_001",
  "tenant_id": "ten_123",
  "aggregate_type": "appointment",
  "aggregate_id": "apt_001",
  "event_type": "appointment.created",
  "schema_version": 1,
  "occurred_at": "2027-01-01T12:00:00Z",
  "correlation_id": "corr_abc123",
  "dispatch_state": "pending"
}
```

### Exemplo invalido

```json
{
  "aggregate_type": "appointment",
  "event_type": "appointment.created"
}
```

Invalido porque faltam identidade, versao, tempo, correlacao e estado de dispatch.

### Compatibilidade com multi-tenancy

Eventos tenant-scoped levam `tenant_id`.

### Compatibilidade com workers

Dispatcher cria `JobEnvelope` quando o consumidor for assincrono.

### Compatibilidade com analytics

Pode alimentar materializacoes e reconciliacao.

### Compatibilidade com IAM

Pode carregar referencia indireta a ator humano via correlacao, nao via token.

---

## InboxEvent

### Proposito

Registrar o consumo idempotente de um evento ou webhook recebido.

### Owner

`Worker Runtime / Integrations`

### Formato conceitual

Registro de deduplicacao e replay seguro por consumidor.

### Campos obrigatorios

- `consumer_name`
- `source_event_id`
- `source_system`
- `tenant_id` quando aplicavel
- `first_seen_at`
- `status`
- `retry_count`

### Invariantes obrigatorias

- Chave de unicidade logica: `consumer_name + source_event_id`.
- `retry_count` inicia em `0`.
- Webhook ou evento externo relevante nao e processado sem controle de inbox ou idempotencia equivalente.

### Propagacao

- consumidores de webhook
- consumers de outbox externo
- replay

### Lifecycle

Criado na primeira recepcao, atualizado no controle de consumo, mantido ate expirar a janela operacional de replay.

### Regras de seguranca

- Nao carregar secret em payload persistido.
- Source externa deve ser validada antes do consumo.

### Observabilidade

- Replay failures, duplicados e consumo com erro devem ser metricas.

### Requisitos de auditoria

- Replays manuais ou administrativos relevantes devem ser auditaveis.

### Failure semantics

- Duplicado detectado nao deve reexecutar side effect.
- Falha de consumo incrementa `retry_count` e segue politica de replay.

### Quem pode emitir

- consumers aprovados

### Quem pode consumir

- consumers
- reconciliacao
- operacao autorizada de replay

### O que e explicitamente proibido

- Consumir webhook critico sem idempotencia.
- Ignorar estado anterior de consumo.

### Exemplo valido

```json
{
  "consumer_name": "feegow-sync-consumer",
  "source_event_id": "evt_ext_001",
  "source_system": "feegow",
  "tenant_id": "ten_123",
  "first_seen_at": "2027-01-01T12:00:00Z",
  "status": "processed",
  "retry_count": 0
}
```

### Exemplo invalido

```json
{
  "source_event_id": "evt_ext_001",
  "status": "processed"
}
```

Invalido porque faltam identificacao do consumidor, origem e controle minimo de replay.

### Compatibilidade com multi-tenancy

Mantem isolamento por `tenant_id` quando aplicavel.

### Compatibilidade com workers

Contrato central para consumers de eventos.

### Compatibilidade com analytics

Pode registrar ingestao externa de pipelines analiticos quando necessario.

### Compatibilidade com IAM

Nao depende diretamente do IAM; depende de `MachineIdentity` do consumer quando houver chamadas internas.

---

## EntitlementGrant

### Proposito

Representar a liberacao tecnica canonica de uma capability por tenant.

### Owner

`Platform Control Plane / Entitlements`

### Formato conceitual

Grant persistido e consultavel no backend, separado de flag operacional e do provedor de cobranca.

### Campos obrigatorios

- `entitlement_grant_id`
- `tenant_id`
- `capability_key`
- `state`
- `source`
- `effective_from`

### Invariantes obrigatorias

- Capability comercial ou tecnica nao pode ser liberada apenas por UI.
- `state` deve distinguir ativo, suspenso, expirado ou revogado.
- `source` deve distinguir plano, override administrativo ou migracao controlada.

### Propagacao

- onboarding
- admin platform
- runtime backend
- usage metering

### Lifecycle

Provisionado no onboarding, alterado por admin autorizado, consultado em runtime e historizavel via auditoria.

### Regras de seguranca

- Override manual exige trilha de auditoria.
- Nao pode ser substituido por `FeatureFlag`.

### Observabilidade

- Falhas de resolucao e descompasso entre grant e runtime devem ser monitoraveis.

### Requisitos de auditoria

- Criacao, revogacao, suspensao e override manual sao auditaveis.

### Failure semantics

- Grant ausente implica capability negada por padrao.
- Estado suspenso ou revogado bloqueia uso imediatamente apos propagacao do runtime.

### Quem pode emitir

- onboarding/control plane
- admin global autorizado

### Quem pode consumir

- backend de produto
- admin platform
- medicao de uso

### O que e explicitamente proibido

- Liberar capability comercial apenas por `FeatureFlag`.
- Fallback permissivo na ausencia de grant.

### Exemplo valido

```json
{
  "entitlement_grant_id": "ent_001",
  "tenant_id": "ten_123",
  "capability_key": "dashboard.advanced",
  "state": "active",
  "source": "plan",
  "effective_from": "2027-01-01T00:00:00Z"
}
```

### Exemplo invalido

```json
{
  "tenant_id": "ten_123",
  "capability_key": "dashboard.advanced"
}
```

Invalido porque faltam identidade do grant, estado, origem e vigencia.

### Compatibilidade com multi-tenancy

Sempre tenant-scoped.

### Compatibilidade com workers

Workers que executam capability controlada devem consultar grant quando aplicavel.

### Compatibilidade com analytics

Uso analitico de capability deve respeitar o grant vigente, nao apenas a UI.

### Compatibilidade com IAM

Complementa IAM: IAM governa identidade e grants de acesso; `EntitlementGrant` governa capability comercial/tecnica do tenant.
