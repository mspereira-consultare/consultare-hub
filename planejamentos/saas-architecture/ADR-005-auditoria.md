# ADR-005 - Auditoria

- Status: Aprovada
- Prioridade: P0
- Relacoes: Depende de ADR-001, ADR-002, ADR-003 e ADR-004. Tem relacao forte com ADR-010 para rastrear uso da bridge legada.

## Contexto

O novo SaaS precisa registrar com precisao eventos de autenticacao, autorizacao, alteracao de dados, mudancas sensiveis, execucao de jobs e operacoes administrativas. O sistema atual ja possui trilhas pontuais por modulo, mas nao um modelo unificado de auditoria de plataforma.

## Problema

Misturar auditoria de negocio com logs tecnicos cria varios problemas:

- perda de rastreabilidade de negocio;
- dependencia excessiva da ferramenta de logs;
- dificuldade de exportacao por tenant;
- baixa confianca para suporte, compliance e seguranca;
- ausencia de trilha canonica para mudancas sensiveis.

## Opcoes consideradas

### 1. Logs tecnicos apenas

Usar logging operacional como registro principal de eventos relevantes.

### 2. Auditoria embutida e nao padronizada

Cada modulo mantem sua propria trilha, sem um contrato unico de evento.

### 3. Store externo como trilha principal

Delegar a auditoria de negocio a um servico externo como fonte canonica.

### 4. Auditoria de negocio append-only no banco novo

Manter uma trilha canonica de negocio em storage proprio, separada dos logs tecnicos.

## Decisao

Foi aprovada uma auditoria de negocio append-only no banco novo, separada dos logs tecnicos.

O modelo aprovado inclui:

- storage canonico proprio;
- eventos padronizados por tenant, ator, acao, entidade e correlation_id;
- trilha imutavel logica, sem update ou delete funcional de eventos;
- consulta por tenant e por admin global autorizado;
- correlacao com auth, jobs, permissions, secrets e configuracoes sensiveis;
- exportacao periodica para object storage;
- separacao clara entre auditoria de negocio e logs tecnicos.

## Justificativa

Auditoria de negocio nao pode depender de busca em log operacional. Ela precisa ser consultavel, filtravel, exportavel e desenhada como capability de plataforma. Ao manter a trilha canonica perto do dominio, o sistema preserva governanca sem depender de um vendor externo como fonte de verdade.

## Trade-offs

- Cria mais volume no banco novo e exige politica de retencao.
- Exige esquema de evento disciplinado desde o inicio.
- Facilita suporte, compliance e investigacao de incidentes.
- Evita que logs tecnicos sejam tratados como substituto de trilha de negocio.

## Riscos

- Volume crescer sem estrategia de retencao e export.
- Dados sensiveis demais serem persistidos em payloads de auditoria.
- Equipes comecarem a usar a auditoria como camada analitica generica.
- Eventos criticos deixarem de ser emitidos por inconsistencias entre modulos.

## Reversibilidade

Media-baixa.

Depois que a plataforma passa a depender do contrato de auditoria para suporte e governanca, mudar radicalmente o modelo custa caro. A implementacao pode evoluir, mas o principio de trilha canonica separada deve permanecer.

## Impactos operacionais

- Necessidade de politica de retencao por classe de evento.
- Necessidade de redaction e controle de payloads sensiveis.
- Necessidade de indexacao e exportacao planejadas.
- Necessidade de trilha clara para quem consulta ou exporta auditoria em nivel global.

## Criterios de validacao

- Login, logout, acesso negado, alteracao de permissao, alteracao de secret e execucao de job geram eventos auditaveis.
- Eventos sao append-only no storage canonico.
- Existe separacao explicita entre logs tecnicos e auditoria de negocio.
- Admin global autorizado consegue consultar eventos cross-tenant sem bypass tecnico.
- Tenant admin so enxerga eventos do proprio tenant.
