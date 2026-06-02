# Risks

## Objetivo deste documento

Este documento consolida os principais riscos tecnicos, arquiteturais e operacionais do novo SaaS, em coerencia com as ADRs aprovadas.

---

## Separacao fisica e legado

### Risco: separacao parcial na pratica

- **Descricao:** o novo SaaS ser documentado como separado, mas compartilhar algum banco, pipeline, credencial ou projeto com o legado.
- **Causa provavel:** tentativa de acelerar bootstrap ou reduzir custo inicial.
- **Impacto:** alto.
- **Probabilidade:** media.
- **Mitigacao arquitetural:** aplicar ADR-000 sem excecoes estruturais.
- **ADR relacionada:** ADR-000.

### Risco: bridge read-only virar dependencia permanente

- **Descricao:** a ACL legada continuar sendo usada como fonte operacional principal.
- **Causa provavel:** bootstrap sem prazo de expiracao e ausencia de ownership para remover a ponte.
- **Impacto:** alto.
- **Probabilidade:** media.
- **Mitigacao arquitetural:** contratos versionados, escopo por dominio, revisao periodica e staging nao canonico.
- **ADR relacionada:** ADR-010.

---

## IAM compartilhado

### Risco: blast radius do IAM

- **Descricao:** falha no IAM afetar mais de um sistema ao mesmo tempo.
- **Causa provavel:** o servico se torna dependencia central de login, refresh e grants.
- **Impacto:** alto.
- **Probabilidade:** media.
- **Mitigacao arquitetural:** SLA definido, observabilidade propria, revogacao clara e contracts estaveis.
- **ADR relacionada:** ADR-001.

### Risco: stale authorization

- **Descricao:** grants e memberships cacheados permitirem acesso indevido apos mudanca.
- **Causa provavel:** cache agressivo sem invalidacao ou versionamento.
- **Impacto:** alto.
- **Probabilidade:** media.
- **Mitigacao arquitetural:** membership version, TTL curto e estrategia explicita de revogacao.
- **ADR relacionada:** ADR-001.

---

## Multi-tenancy

### Risco: vazamento cross-tenant

- **Descricao:** leitura, escrita, cache ou job retornarem dados de tenant incorreto.
- **Causa provavel:** query sem tenant context, indice inadequado, cache compartilhado ou job mal assinado.
- **Impacto:** critico.
- **Probabilidade:** media.
- **Mitigacao arquitetural:** tenant_id obrigatorio, testes negativos, dedupe/concurrency key e revisao de query.
- **ADR relacionada:** ADR-002, ADR-004, ADR-007.

---

## Secrets

### Risco: segredo acessado fora da camada oficial

- **Descricao:** scripts, workers ou APIs consultarem secrets diretamente por SQL.
- **Causa provavel:** atalhos operacionais ou pressa de integracao.
- **Impacto:** alto.
- **Probabilidade:** media.
- **Mitigacao arquitetural:** SecretRef obrigatorio, auditoria de leitura e bloqueio de acesso direto no desenho da aplicacao.
- **ADR relacionada:** ADR-003.

### Risco: rotacao quebrar integracoes

- **Descricao:** troca de versao de credencial causar indisponibilidade.
- **Causa provavel:** ausencia de versionamento, teste de conexao ou rollout controlado.
- **Impacto:** alto.
- **Probabilidade:** media.
- **Mitigacao arquitetural:** versionamento por secret, validacao antes de ativacao e trilha de alteracao.
- **ADR relacionada:** ADR-003.

---

## Workers e filas

### Risco: duplicacao de jobs ou efeitos colaterais

- **Descricao:** mesma execucao gerar efeitos repetidos ou disputar recursos do mesmo tenant.
- **Causa provavel:** ausencia de idempotencia, dedupe key ou scheduler consistente.
- **Impacto:** alto.
- **Probabilidade:** media.
- **Mitigacao arquitetural:** idempotency key, dedupe key, DLQ e concurrency key por tenant/integracao.
- **ADR relacionada:** ADR-004.

### Risco: fila e scheduler mal operados no Railway

- **Descricao:** restart, redispatch ou perda parcial de fila comprometer processamento.
- **Causa provavel:** runbook insuficiente, monitoramento fraco ou dependencia do runtime web.
- **Impacto:** alto.
- **Probabilidade:** media.
- **Mitigacao arquitetural:** scheduler separado, observabilidade de fila, DLQ e deploy isolado de workers.
- **ADR relacionada:** ADR-004.

---

## Auditoria

### Risco: auditoria virar log tecnico disfarcado

- **Descricao:** eventos de negocio perderem consistencia e dependerem de logs gerais para investigacao.
- **Causa provavel:** falta de contrato padronizado de evento.
- **Impacto:** alto.
- **Probabilidade:** media.
- **Mitigacao arquitetural:** storage canonico append-only e contrato auditavel por evento.
- **ADR relacionada:** ADR-005.

### Risco: payloads de auditoria conterem dados sensiveis em excesso

- **Descricao:** valores sensiveis serem gravados sem redaction adequada.
- **Causa provavel:** captura indiscriminada de before/after e payload bruto.
- **Impacto:** alto.
- **Probabilidade:** media.
- **Mitigacao arquitetural:** politicas de redaction e classes de evento com schema controlado.
- **ADR relacionada:** ADR-005.

---

## Analytics

### Risco: dashboards degradarem o OLTP

- **Descricao:** consultas gerenciais pesadas impactarem fluxo operacional.
- **Causa provavel:** leitura direta no banco transacional ou falta de agregados aprovados.
- **Impacto:** alto.
- **Probabilidade:** media.
- **Mitigacao arquitetural:** analytics serving separado e proibicao de query pesada no OLTP como padrao.
- **ADR relacionada:** ADR-007.

### Risco: divergencia temporal entre OLTP e analytics

- **Descricao:** indicador analitico apresentar atraso ou valor divergente do operacional recente.
- **Causa provavel:** ETL atrasado ou falha parcial de sincronizacao.
- **Impacto:** medio.
- **Probabilidade:** media.
- **Mitigacao arquitetural:** monitoramento de atraso, reconciliacao e comunicacao explicita de freshness.
- **ADR relacionada:** ADR-007.

---

## Railway operacao

### Risco: limites operacionais subestimados

- **Descricao:** conexoes, fila, logs ou restore no Railway ficarem abaixo da necessidade da plataforma.
- **Causa provavel:** desenho sem considerar multiplicacao de servicos e tenants.
- **Impacto:** alto.
- **Probabilidade:** media.
- **Mitigacao arquitetural:** separar componentes, definir RPO/RTO e baseline de observabilidade antes do go-live.
- **ADR relacionada:** ADR-000, ADR-004, ADR-007.

---

## Organizacionais e governanca

### Risco: o time reabrir ADRs na implementacao

- **Descricao:** decisoes congeladas serem ignoradas por conveniencia durante a foundation.
- **Causa provavel:** pressao de prazo e ausencia de governance tecnica.
- **Impacto:** alto.
- **Probabilidade:** media.
- **Mitigacao arquitetural:** usar este pacote como referencia obrigatoria e exigir review de arquitetura para excecoes.
- **ADR relacionada:** todas.

---

## Acoplamentos invisiveis a evitar

- Reutilizar IDs do legado como chave canonica do novo SaaS.
- Copiar enums, status e regras Consultare-especificas para o core do novo produto.
- Criar scripts fora da ACL acessando o legado diretamente.
- Validar feature flags apenas na UI, sem enforcement server-side.
- Permitir que workers leiam secrets por SQL direto.
