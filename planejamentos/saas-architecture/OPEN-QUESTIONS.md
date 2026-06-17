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

### Catalogo comercial final de modulos do Magic IA

**Contexto**
`CONTRACT-PACK.md` ja define a separacao entre modulos contratados, permissoes e escopo de dados, e `planejamentos/magic-ia/` traz uma taxonomia inicial.

**Por que ainda esta aberto**
A nomenclatura comercial, empacotamento, limites e combinacoes vendaveis ainda dependem da estrategia de produto.

**Impacto se adiar**
Baixo para foundation, desde que `EntitlementGrant` seja generico o suficiente para representar modulos, conectores e limites. Medio se telas ou tabelas nascerem acopladas a nomes comerciais ainda instaveis.

**Recomendacao inicial**
Implementar capabilities estaveis por dominio e manter nomes comerciais como configuracao/metadata, nao como chaves canonicas de autorizacao.

### Politica de desligamento do Feegow Bridge por tenant

**Contexto**
O Magic IA deve suportar clientes com Feegow via `Feegow Bridge`, mas o produto principal e o `Magic Core`.

**Por que ainda esta aberto**
Ainda falta decidir criterios operacionais para migrar um tenant do modo bridge para o modo core, incluindo historico, conciliacao e janela de corte.

**Impacto se adiar**
Baixo para foundation. Alto se o bridge virar dependencia estrutural ou se cada tenant migrar por processo manual sem trilha auditavel.

**Recomendacao inicial**
Tratar o bridge como capability contratada e tenant-scoped, com readiness, health, data freshness, plano de cutover e rollback documentados antes da primeira migracao real.

### Sequencia de internalizacao do Magic Core

**Contexto**
O blueprint funcional indica que o Magic Core deve substituir progressivamente dependencias operacionais externas, incluindo Feegow.

**Por que ainda esta aberto**
A ordem exata de internalizacao por dominio depende de valor comercial, risco operacional e dependencia de dados.

**Impacto se adiar**
Baixo para foundation. Medio se times iniciarem modulos grandes antes dos contratos base de tenant, auditoria, jobs e dados canonicos.

**Recomendacao inicial**
Usar `ROADMAP-DE-PARIDADE-E-MIGRACAO.md` como guia de produto, mas exigir os gates de foundation antes de implementar dominios operacionais amplos.
