# Open Questions

## Objetivo deste documento

Este documento registra ambiguidades remanescentes que ainda exigem decisao, sem reabrir as ADRs ja aprovadas.

Ele foi reduzido apos o foundation freeze complementar. As perguntas abaixo nao suspendem as ADRs congeladas; elas refinam operacao, governanca e parametros finais da foundation.

---

## P1

Os antigos bloqueadores `P0` foram resolvidos e migrados para `CONTRACT-PACK.md`, `OPERATIONAL-BASELINE.md` e `FOUNDATION-GATES.md`.

### SSO e SAML

**Contexto**  
A ADR de IAM ja exige readiness para OIDC, SSO e SAML, mas nao exige federacao no day-1.

**Por que ainda esta aberto**  
Depende da estrategia comercial e do perfil dos clientes alvo.

**Impacto se adiar**  
Baixo se o servico nascer com arquitetura compativel. Alto se contratos internos travarem federacao futura.

**Recomendacao inicial**  
Tratar como readiness estrutural agora e feature posterior, salvo exigencia comercial imediata.

### Impersonation

**Contexto**  
Suporte e operacao global podem demandar impersonation futuro para troubleshooting tenant-aware.

**Por que ainda esta aberto**  
O tema envolve alto risco de auditoria, LGPD e abuso operacional.

**Impacto se adiar**  
Baixo para foundation, desde que IAM e auditoria prevejam ator primario, ator delegado e motivo operacional.

**Recomendacao inicial**  
Nao incluir no day-1. Fechar politica, escopo e trilha obrigatoria antes de qualquer implementacao.

### Tenants premium isolados

**Contexto**  
A estrategia padrao aprovada e row-level tenancy, com possibilidade futura de excecao para clientes premium.

**Por que ainda esta aberto**  
Ainda nao ha criterio comercial, regulatorio e tecnico formal para acionar a excecao.

**Impacto se adiar**  
Baixo no curto prazo. Medio se aparecer cliente com requisito de segregacao fisica antes do criterio estar definido.

**Recomendacao inicial**  
Definir criterios objetivos de elegibilidade antes do primeiro caso premium.

### Duracoes numericas de retencao por classe

**Contexto**  
A ADR de data governance pode congelar classes de retencao e lifecycle, mas os numeros finais por classe ainda podem variar.

**Por que ainda esta aberto**  
Depende de compliance, custo de storage, exigencias contratuais e politica de export.

**Impacto se adiar**  
Medio. Pode gerar reindexacao ou ajuste de storage se a parametrizacao vier tarde demais.

**Recomendacao inicial**  
Fechar os valores numericos por classe antes da implementacao da store canonica de auditoria e das rotinas de purge/anonimizacao.
