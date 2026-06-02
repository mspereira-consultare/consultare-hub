# ADR-007 - Analytics Serving

- Status: Aprovada
- Prioridade: P1
- Relacoes: Depende de ADR-002 e ADR-004. Tem tensao direta com custo operacional e com risco de vazamento cross-tenant.

## Contexto

O novo SaaS tera dashboards, indicadores, agregacoes e relatorios por tenant e, em alguns casos, visoes globais autorizadas. O uso direto do OLTP para analytics pesado compromete desempenho, previsibilidade de consulta e governanca.

## Problema

Sem uma estrategia formal de analytics serving:

- queries pesadas disputam recurso com fluxos transacionais;
- relatorios ficam imprevisiveis;
- aumenta o risco de query cross-tenant mal controlada;
- dashboards passam a depender de joins complexos e lentos em runtime.

## Opcoes consideradas

### 1. Tudo no OLTP

Executar dashboards e relatorios diretamente no banco transacional principal.

### 2. Agregados no mesmo banco

Manter o OLTP e as tabelas analiticas no mesmo MySQL, com materializacoes locais.

### 3. Banco analitico proprio no Railway

Separar a camada analitica em um banco proprio, alimentado assincronamente.

## Decisao

Foi aprovada a separacao entre `OLTP` e `analytics serving`.

Isso inclui:

- MySQL transacional proprio do SaaS;
- banco analitico proprio no Railway para serving de dashboards e relatorios;
- alimentacao por ETL ou eventos internos assincronos;
- consumo de dashboards apenas sobre agregados e materializacoes aprovadas;
- proibicao de query analitica pesada diretamente no OLTP principal como padrao.

## Justificativa

Separar o serving analitico protege o OLTP, melhora previsibilidade de desempenho e reduz a tentacao de criar consultas ad hoc perigosas. A opcao por um banco analitico proprio no Railway mantem a postura de poucos vendors sem sacrificar separacao de responsabilidade.

## Trade-offs

- Adiciona mais um banco para operar.
- Exige pipelines de sincronizacao e reconciliacao.
- Melhora escalabilidade de dashboards e relatorios.
- Reduz o risco de analytics prejudicar o fluxo operacional.

## Riscos

- ETL atrasado gerar divergencia temporal.
- Pipeline analitico propagar dados sem tenant context correto.
- Custo adicional de storage e manutencao no Railway.
- Materializacoes mal desenhadas ficarem caras ou insuficientes.

## Reversibilidade

Media.

E possivel evoluir para warehouse externo no futuro, mas a separacao entre OLTP e serving analitico deve permanecer. Reverter para analytics pesado no OLTP seria retrocesso estrutural.

## Impactos operacionais

- Mais um banco para monitorar, restaurar e versionar.
- Necessidade de SLOs para atraso maximo aceitavel do ETL.
- Necessidade de validacao de consistencia entre fato operacional e fato analitico.
- Necessidade de governanca de quem pode consumir visoes globais.

## Criterios de validacao

- Dashboards nao executam queries pesadas diretamente no OLTP principal.
- Existe pipeline assincrono formal para alimentar o serving analitico.
- Todas as agregacoes carregam tenant context ou grant global explicito.
- Existe monitoramento de atraso e falha dos jobs analiticos.
