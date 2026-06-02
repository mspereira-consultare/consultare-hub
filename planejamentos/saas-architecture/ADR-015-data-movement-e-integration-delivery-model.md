# ADR-015 - Data Movement e Integration Delivery Model

- Status: Aprovada
- Prioridade: P0
- Relacoes: Complementa ADR-004 e ADR-007. Tem dependencia forte com ADR-010 e impacto sobre ADR-005 e ADR-014.

## Contexto

O novo SaaS precisara mover dados e intencoes entre OLTP, workers, analytics, integracoes externas e a bridge read-only do legado. Sem um modelo dominante, cada dominio tendera a escolher sua propria combinacao de chamadas sincronas, jobs ad hoc e ETLs oportunistas.

## Problema

Sem uma politica formal de data movement:

- side effects externos podem ficar presos a transacoes web;
- consumidores podem processar mensagens duplicadas sem controle;
- analytics pode nascer com pipelines paralelos e inconsistentes;
- bootstrap e reconciliacao podem vazar para o runtime operacional;
- integracoes e jobs podem perder rastreabilidade de intencao e replay.

## Opcoes consideradas

### 1. Chamadas diretas como padrao

Acionar integracoes e efeitos colaterais principalmente por chamadas sincronas do runtime.

### 2. Batch e ETL como padrao universal

Tratar quase todo movimento de dados como carga em lote ou sincronizacao periodica.

### 3. Modelo hibrido com outbox como padrao dominante

Usar outbox transacional para mudancas criticas, inbox/idempotencia para consumo e batch apenas onde fizer sentido.

## Decisao

Foi aprovado um `Data Movement e Integration Delivery Model` hibrido com outbox como padrao dominante.

Essa decisao inclui:

- `Transactional outbox` como padrao para mudancas de dominio que precisam disparar jobs, integracoes ou pipelines internos;
- `InboxEvent` e politicas de idempotencia como padrao para consumidores, webhooks e replays;
- `IntegrationCommand` como envelope de intencao para side effects externos relevantes;
- `Batch ETL` restrito a bootstrap, backfill, refresh analitico e reconciliacao;
- proibicao de usar a bridge legada como dependencia operacional sincrona do core runtime;
- efeitos colaterais externos fora da transacao principal como padrao, salvo excecoes muito restritas e explicitamente documentadas.

## Justificativa

O modelo hibrido preserva consistencia e auditabilidade sem transformar todo o ecossistema em workflow engine. Outbox reduz o risco de perder intencao de integracao, inbox reduz duplicidade e batch continua disponivel para cenarios em que near-real-time nao e necessario.

## Trade-offs

- Exige mais contratos de evento, replay e reconciliacao.
- Aumenta a complexidade em comparacao com chamadas diretas simples.
- Reduz risco de efeitos colaterais perdidos ou duplicados.
- Cria base unica para workers, analytics e integracoes externas.

## Enforcement operacional

- Nenhuma mudanca critica de dominio que dispare processamento assincrono deve depender apenas de chamada direta sem persistencia de intencao.
- Todo consumidor de evento ou webhook deve ter estrategia de idempotencia e replay.
- Batch nao deve substituir outbox em fluxos operacionais criticos.
- A bridge do legado pode participar de bootstrap e reconciliacao, nunca de dependencia sincrona do runtime principal.
- Freshness de cada fluxo deve ser classificada para evitar misturar dado near-real-time com batch sem sinalizacao.

## Contratos envolvidos

- `OutboxEvent`: evento persistido no OLTP para disparo confiavel de processamento assincrono.
- `InboxEvent`: registro de consumo, deduplicacao e replay seguro no lado consumidor.
- `IntegrationCommand`: envelope canonico de intencao para integracoes externas ou jobs dedicados.
- `ReconciliationRun`: execucao formal de verificacao, backfill ou correcao de divergencia.
- `FreshnessClass`: classificacao minima de expectativa temporal do dado ou pipeline.

## Riscos

- Eventos sem idempotencia gerarem side effects duplicados.
- Batch opportunista competir com fluxos orientados a evento.
- Outbox virar dumping ground sem contrato de schema e ownership.
- Reconciliacao ser tratada como operacao manual eterna.
- Bridge read-only virar feed operacional mascarado.

## Reversibilidade

Media.

Implementacoes especificas podem evoluir, mas escolher cedo entre chamadas diretas, batch e outbox muda profundamente jobs, analytics e integracoes. Esta ADR precisa ser tratada como contrato estrutural.

## Criterios obrigatorios de validacao

- Mudancas criticas de dominio geram `OutboxEvent` persistido.
- Consumidores possuem estrategia de `InboxEvent` ou idempotencia equivalente.
- Nenhum fluxo operacional critico depende de batch como unico meio de propagacao.
- A bridge legada nao participa de fluxo sincrono de negocio do novo SaaS.
- Existe classificacao minima de freshness para pipelines operacionais e analiticos.
