# ADR-012 - Data Governance, LGPD e Lifecycle

- Status: Aprovada
- Prioridade: P0
- Relacoes: Complementa ADR-003 e ADR-005. Tem dependencia forte com ADR-011 e impacto direto sobre ADR-007 e ADR-010.

## Contexto

O novo SaaS lidara com dados operacionais, credenciais, auditoria, integracoes e potencialmente dados pessoais e sensiveis. Se o schema nascer sem classificacao, retencao e politica de lifecycle, a plataforma herdara improviso regulatorio e operacional desde o primeiro commit.

## Problema

Sem uma politica formal de governanca de dados:

- tabelas e campos nascem sem classificacao;
- retention e purge ficam arbitrarios;
- pedidos de delecao, anonimizacao e legal hold nao encontram base comum;
- auditoria, analytics e exportacao podem persistir dados em excesso;
- restore e backup ficam desalinhados com LGPD e seguranca.

## Opcoes consideradas

### 1. Definir governanca depois da modelagem

Criar schema e fluxos primeiro, deixando classificacao, retention e lifecycle para fase posterior.

### 2. Governanca minima por modulo

Cada dominio define sua propria regra de retention e dados sensiveis conforme necessidade local.

### 3. Politica transversal de classificacao, retention e delecao

Congelar um modelo minimo de governanca antes do schema novo, aplicavel a todos os dominios.

## Decisao

Foi aprovada uma politica transversal de `Data Governance, LGPD e Lifecycle`.

Essa politica inclui:

- todo dataset novo deve nascer com `owner`, `DataClassification`, `RetentionClass` e `DeletionMode`;
- dados pessoais, dados sensiveis e segredos devem seguir principio de minimizacao;
- `soft delete` so e permitido quando houver justificativa funcional clara;
- secrets nao usam delete logico comum e seguem inutilizacao criptografica quando removidos;
- auditoria e exportacoes devem usar redaction e schema controlado, nunca payload livre por padrao;
- `LegalHold` suspende purge quando houver exigencia legal ou investigativa;
- backups e restores seguem politica propria e nao sao tratados como mecanismo de delecao seletiva.

## Justificativa

Governanca de dados nao pode ser uma iniciativa tardia em um SaaS multi-tenant com auditoria, analytics e integracoes. Esta ADR cria um vocabulario minimo comum para schema, exportacao, suporte e compliance.

## Trade-offs

- Exige mais disciplina antes de criar tabelas e exports.
- Reduz liberdade de persistir payloads arbitrarios.
- Melhora seguranca, compliance e previsibilidade operacional.
- Aumenta o custo inicial de modelagem, mas reduz retrabalho regulatorio.

## Enforcement operacional

- Nenhuma tabela nova entra sem owner, classificacao, retention class e deletion mode documentados.
- Nenhum campo sensivel pode ser exposto em export, auditoria ou logs tecnicos sem politica de masking/redaction.
- Nenhum fluxo de purge ou anonimizacao pode nascer fora da taxonomia oficial de lifecycle.
- Pedidos ligados a LGPD devem ser registrados e rastreaveis, mesmo quando a execucao operacional for posterior.
- Staging, snapshots e espelhos analiticos devem obedecer a mesma classificacao do dado de origem.

## Contratos envolvidos

- `DataClassification`: classe minima de sensibilidade do dado.
- `RetentionClass`: classe de retencao usada por auditoria, OLTP, analytics e exportacao.
- `DeletionMode`: modo oficial de remocao, anonimizacao, soft delete ou inutilizacao criptografica.
- `LegalHold`: bloqueio formal de purge para preservar dado por exigencia legal ou investigativa.
- `DataSubjectRequest`: registro auditavel de pedido ligado a LGPD, como acesso, correcao ou delecao.

## Riscos

- Classificacao virar checklist formal sem aplicacao pratica.
- Times usarem soft delete como padrao universal.
- Auditoria e analytics manterem mais dado sensivel do que o necessario.
- Restore reintroduzir dados ja anonimizados sem politica clara.
- Ausencia de ownership real por dataset enfraquecer a governanca.

## Reversibilidade

Media-baixa.

Classes e numeros podem evoluir, mas permitir que dados nascam sem classificacao e lifecycle definido tende a gerar retrabalho profundo em schema, exports e auditoria.

## Criterios obrigatorios de validacao

- Existe matriz minima de `DataClassification`, `RetentionClass` e `DeletionMode`.
- Nenhum dataset novo entra sem owner e lifecycle definidos.
- Secrets, auditoria e exportacoes possuem politica de redaction ou masking coerente.
- Existe tratamento formal para `LegalHold` e `DataSubjectRequest`.
- Backups, restores e espelhos analiticos nao contradizem a politica de lifecycle aprovada.
