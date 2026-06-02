# ADR-009 - Design System

- Status: Aprovada
- Prioridade: P2
- Relacoes: Depende de ADR-006. Tem relacao forte com ADR-001 e ADR-002 por causa de componentes permission-aware e tenant-aware.

## Contexto

O novo SaaS tera multiplos modulos administrativos, operacionais e gerenciais. Sem um sistema visual e tecnico consistente, cada modulo tende a recriar tabelas, formularios, filtros e regras de permissao localmente.

## Problema

Ausencia de design system gera:

- inconsistencia visual;
- duplicacao de componentes;
- regras de permissao espalhadas na UI;
- retrabalho entre apps e modulos;
- manutencao mais cara no medio prazo.

## Opcoes consideradas

### 1. Componentes locais por app

Cada app e modulo mantem seus proprios componentes, sem camada compartilhada estruturada.

### 2. Pacote UI simples

Compartilhar apenas um pequeno conjunto de componentes basicos.

### 3. Design system estruturado

Manter tokens, primitives, componentes compostos e patterns de produto em uma camada interna padronizada.

## Decisao

Foi aprovado um design system interno para o novo SaaS, com:

- tokens visuais;
- UI primitives;
- app shell;
- formularios;
- tabelas;
- filtros;
- dashboard blocks;
- estados de loading, erro e vazio;
- componentes permission-aware;
- componentes tenant-aware quando o contexto visual depender do tenant ativo.

## Justificativa

Mesmo nao sendo a primeira capacidade de foundation, o design system evita que o novo SaaS replique fragmentacao de UI e autorizacao. Ele tambem reduz a chance de cada modulo implementar sua propria interpretacao de layout, tabela e permissao.

## Trade-offs

- Pode atrasar entregas se virar iniciativa grande demais cedo.
- Exige ownership claro e criterio para promover componentes.
- Melhora consistencia, velocidade de manutencao e experiencia do usuario.
- Reduz o custo futuro de expandir o produto em mais apps e modulos.

## Riscos

- Over-engineering antes de haver uso real.
- Biblioteca inflar com componentes pouco reutilizados.
- Equipes burlarem o sistema e recriarem componentes paralelos.
- Componentes permission-aware assumirem logica de autorizacao que deveria estar no backend.

## Reversibilidade

Alta.

Tokens, componentes e patterns podem evoluir sem romper a fundacao, desde que os contratos de uso permanecam claros. O risco principal nao esta em escolher esta estrategia, mas em executa-la sem disciplina.

## Impactos operacionais

- Necessidade de ownership claro de UI e review de consistencia.
- Necessidade de catalogo interno de componentes aprovados.
- Necessidade de padrao de acessibilidade, loading e tratamento de erro reutilizavel.
- Necessidade de separar logica visual de logica de autorizacao server-side.

## Criterios de validacao

- Formularios, tabelas e filtros seguem primitives compartilhadas.
- Componentes visuais nao dependem de implementacoes privadas de app.
- Existe padrao comum para estados vazios, loading e erro.
- Permissao na UI complementa, mas nao substitui, autorizacao server-side.
