# Documentação do Hub Consultare

Este diretório centraliza a documentação funcional e técnica do projeto.

## Índice


1. [`docs/01-visao-funcional-e-indicadores.md`](docs/01-visao-funcional-e-indicadores.md)
   Descreve cada página do painel, seus filtros, fontes de dados e fórmulas dos indicadores.
   Inclui a página de Agendamentos, com visão histórica, filtros detalhados e taxa de confirmação.

2. [`docs/02-matriz-de-permissoes.md`](docs/02-matriz-de-permissoes.md)
   Documenta o modelo de acesso por página (`view`, `edit`, `refresh`) e a regra por perfil.

3. [`docs/03-arquitetura-tecnica.md`](docs/03-arquitetura-tecnica.md)
   Arquitetura da aplicação (frontend, APIs, workers, orquestrador, cache, autenticação e banco).

4. [`docs/04-dicionario-de-dados.md`](docs/04-dicionario-de-dados.md)
   Dicionário das principais tabelas, chaves e responsáveis pela atualização de cada uma.

5. [`docs/05-runbook-operacional.md`](docs/05-runbook-operacional.md)
   Procedimentos operacionais: deploy, variáveis de ambiente, validação pós-deploy e troubleshooting.

## Convenções

- Datas: padrão `YYYY-MM-DD` no banco e filtros internos.
- Timezone operacional: `America/Sao_Paulo`.
- Heartbeat de workers: tabela `system_status`.
- Fonte de verdade para métricas:
  - Financeiro e Dashboard financeiro: `faturamento_resumo_*` com fallback em `faturamento_analitico`.
  - Relatório Geral Financeiro (PDF/XLSX): `faturamento_analitico`.
  - Filas: `espera_medica`, `recepcao_historico`, `clinia_group_snapshots`.
  - Produtividade/agendamentos: `feegow_appointments`.
  - Catalogo de procedimentos: `feegow_procedures_catalog`.
  - Procedimentos por profissional: `professional_procedure_rates`.
  - Propostas: `feegow_proposals`.
  - Resolvesaúde: `feegow_contracts`.

## Público-alvo

- Gestão/Operação: `01` e `05`.
- Produto/BI: `01` e `04`.
- Engenharia/Manutenção: `02`, `03`, `04` e `05`.

## Atualizacao recente

- Modulo `/profissionais` iniciado com APIs e UI base para cadastro da carteira medica.
- O dicionario e a arquitetura ja incluem as novas tabelas `professional_*`.
- Fluxo documental em modo hibrido (checklist manual + upload S3 ativo).
- Modulo `/profissionais`: APIs de documentos com `download` e `visualizacao inline` documentadas.
- Pagina `/modelos-contrato`: `download` e `visualizacao` de templates adicionados ao fluxo tecnico.
- Modal de profissional: aba `Contratos` com geracao em `PDF + Word`, `Gerar novo`, `Reprocessar`, `Visualizar PDF`, `Baixar PDF` e `Baixar Word`.
- Modal de profissional: aba `Procedimentos` com vinculo de procedimentos e valores por profissional.
- Novo plano tecnico do modulo de Qualidade e Treinamentos em `docs/06-plano-tecnico-qualidade-treinamentos.md`.
- Sprint 1 iniciado para Qualidade: pagina `/qualidade/documentos` e APIs `qms/documentos` entregues.
- Sprint 2 iniciado para Qualidade: pagina `/qualidade/treinamentos` e APIs `qms/treinamentos` entregues.
- Sprint 3 iniciado para Qualidade: pagina `/qualidade/auditorias` e APIs `qms/auditorias` entregues.
- Sprint 4 iniciado para Qualidade: indicadores consolidados, refresh em lote e hardening de validacoes.
- Novo plano tecnico do modulo de Repasses em `docs/07-plano-tecnico-repasses.md`.
- Sprint 1 de Repasses iniciado: base de schema, permissoes, APIs de jobs manuais e pagina `/repasses`.
- Sprint 2 de Repasses iniciado: worker de scraping (`worker_repasse_consolidado.py`) com `NO_DATA` e `UPSERT` por hash.

## Atualizacao adicional (2026-03)

- [`docs/08-agenda-ocupacao.md`](docs/08-agenda-ocupacao.md): modulo de ocupacao da agenda por especialidade/unidade, com snapshot diario, jobs manuais e exportacoes.
