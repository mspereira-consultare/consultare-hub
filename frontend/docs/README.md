# Documentação do Hub Consultare

Este diretório centraliza a documentação funcional e técnica do projeto.

## Índice

1. [`docs/01-visao-funcional-e-indicadores.md`](docs/01-visao-funcional-e-indicadores.md)
   Descreve cada página do painel, seus filtros, fontes de dados e fórmulas dos indicadores.

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
  - Propostas: `feegow_proposals`.
  - Resolvesaúde: `feegow_contracts`.

## Público-alvo

- Gestão/Operação: `01` e `05`.
- Produto/BI: `01` e `04`.
- Engenharia/Manutenção: `02`, `03`, `04` e `05`.
