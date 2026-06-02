# ADR-004 - Workers Multi-tenant

- Status: Aprovada
- Prioridade: P0
- Relacoes: Depende de ADR-000, ADR-002 e ADR-003. Tem dependencia forte com ADR-005 e ADR-007.

## Contexto

O ecossistema atual depende de diversos workers Python e rotinas operacionais globais. No novo SaaS, jobs, integracoes e agendas precisam funcionar para multiplos tenants com credenciais e limites distintos, sem misturar execucoes nem usar o banco transacional como fila principal.

## Problema

Sem uma estrategia formal de workers multi-tenant:

- jobs podem vazar contexto entre tenants;
- concorrencia descontrolada pode derrubar integracoes externas;
- retentativas podem duplicar efeitos;
- scheduler pode ficar acoplado ao processo web;
- MySQL pode virar broker improvisado e gargalo operacional.

## Opcoes consideradas

### 1. MySQL-only

Usar apenas tabelas no MySQL novo para fila, estado e controle de scheduler.

### 2. Valkey/Redis + MySQL

Usar fila dedicada em Valkey/Redis e manter estado, auditoria e historico de jobs no MySQL novo.

### 3. Orquestrador externo especializado

Adotar plataforma externa de workflow e job orchestration.

## Decisao

Foi aprovada a arquitetura com:

- fila dedicada em Valkey/Redis no Railway;
- estado, historico e auditoria de execucao no MySQL novo;
- scheduler dedicado, separado do runtime web;
- jobs tenant-aware com `tenant_id`, `integration_key`, `dedupe_key`, `concurrency_key`, `correlation_id` e politica de retry;
- DLQ para falhas finais;
- idempotencia como requisito estrutural;
- deploy separado de web e workers.

## Justificativa

Valkey/Redis entrega um equilibrio adequado entre simplicidade operacional e desacoplamento do OLTP. MySQL-only reduziria componentes, mas transferiria ao banco um papel de broker que ele nao deve assumir como padrao.

Ao mesmo tempo, o estado persistido dos jobs precisa ficar em storage relacional para auditoria, suporte e visibilidade administrativa.

## Trade-offs

- Introduz mais um componente operacional no Railway.
- Melhora escalabilidade horizontal de workers e isolamento de execucao.
- Exige disciplina para diferenciar fila efemera de historico persistente.
- Impoe desenho cuidadoso de scheduler, retries e DLQ.

## Riscos

- Scheduler mal desenhado disparar jobs duplicados.
- Concurrency key insuficiente causar disputa entre tenants ou integracoes.
- Falhas de Valkey impactarem enfileiramento e retentativa.
- Workers consumirem secrets ou grants sem contexto consistente.

## Reversibilidade

Media.

O modelo de fila e runtime pode evoluir, mas espalhar logica de job acoplada ao web runtime ou ao MySQL seria muito mais caro de desfazer depois.

## Impactos operacionais

- Necessidade de monitorar profundidade de fila, idade de job e DLQ.
- Cuidado com limites de conexao e throughput no Railway.
- Deploy e restart de workers nao podem depender do deploy web.
- Recuperacao de fila e reconciliacao de estado precisam de runbook proprio.

## Criterios de validacao

- Nenhum job executa sem tenant context explicito.
- Toda execucao registra correlation_id, tentativa, status e timestamps.
- Existe DLQ e politica clara de retry com backoff.
- O scheduler e separado do runtime web.
- Jobs sensiveis usam idempotency key e dedupe key.
- O MySQL novo nao e usado como broker principal da fila.
