# Roadmap de Paridade e Migracao

## Objetivo

Sair do `consultare-hub` como referencia e chegar a um novo produto Magic IA pronto para operar como SaaS multi-tenant, sem transformar o legado em base arquitetural.

## Fase 0 - Blueprint e congelamento de escopo

Entrega:

- pacote `planejamentos/magic-ia`;
- inventario de apps, modulos, dados, integracoes e workers;
- matriz Feegow Bridge vs Magic Core;
- taxonomia inicial de modulos contrataveis.

Gate:

- produto e engenharia concordam que o legado e referencia funcional, nao arquitetura alvo;
- Feegow Bridge e opcional por tenant;
- Magic Core e objetivo principal.

## Fase 1 - Foundation do novo repositorio

Entrega:

- repo novo criado;
- monorepo interno;
- app admin minimo;
- runtime de workers;
- `TenantContext`;
- `IdentityContext`;
- `EntitlementContext`;
- `DataAccessContext`;
- `AuditEvent`;
- `OutboxEvent`;
- `JobEnvelope`;
- `SecretRef`;
- health checks;
- logging com `correlation_id`.

Gate:

- nenhuma tabela de negocio sem `tenant_id`;
- nenhuma query de negocio sem contexto de tenant;
- nenhum worker sem envelope tenant-aware;
- nenhuma integracao com segredo global.

## Fase 2 - Administracao de tenant e acessos

Entrega:

- cadastro de tenants;
- onboarding minimo;
- unidades/organizacoes;
- usuarios e memberships;
- perfis e grupos por tenant;
- entitlements por modulo;
- data scopes iniciais;
- support/admin global com grant auditado.

Gate:

- admin de um tenant nao enxerga outro tenant;
- usuario com dois tenants precisa selecionar contexto;
- modulo nao contratado retorna bloqueio server-side;
- alteracoes sensiveis geram auditoria.

## Fase 3 - Cadastros mestres Magic Core

Entrega:

- unidades;
- profissionais;
- especialidades;
- procedimentos;
- pacientes;
- colaboradores;
- documentos basicos;
- importadores iniciais.

Gate:

- entidades possuem ids internos proprios;
- ids externos ficam em tabela de mapeamento;
- dados podem ser criados sem Feegow;
- importacao Feegow nao sobrescreve campo manual sem politica.

## Fase 4 - Feegow Bridge v1

Entrega:

- conexao Feegow por tenant;
- SecretRef por tenant;
- sync de pacientes, profissionais, procedimentos, agenda e propostas;
- health por tenant;
- job runs e logs;
- mapa de ids externos;
- relatorio de cobertura e divergencias.

Gate:

- dois tenants com Feegow nao compartilham credenciais, cache ou dados;
- bridge pode ser desabilitado por tenant;
- falha de um tenant nao derruba jobs de outro;
- dados importados ficam rastreaveis por origem.

## Fase 5 - Comercial e atendimento

Entrega:

- agenda nativa minima;
- agendamentos;
- propostas;
- follow-up;
- pos-consulta;
- checklists operacionais;
- monitor operacional baseado em dados Magic Core ou bridge;
- exportacoes basicas.

Gate:

- cliente sem Feegow consegue operar fluxo basico;
- cliente com Feegow consegue operar usando dados sincronizados;
- permissoes e data scopes funcionam por unidade/equipe;
- eventos alimentam analytics.

## Fase 6 - Financeiro e contratos

Entrega:

- contratos;
- faturamento/resumos;
- repasses;
- PDFs e artefatos;
- envio transacional;
- modelos de contrato;
- conciliacao com Feegow Bridge.

Gate:

- financeiro distingue valor capturado, calculado e importado;
- repasse tem idempotencia por periodo/profissional;
- emails possuem status de provider e trilha;
- downloads validam permissao e escopo.

## Fase 7 - Pessoas, RH, qualidade e intranet

Entrega:

- colaboradores;
- portal colaborador;
- folha operacional;
- recrutamento;
- equipamentos;
- QMS;
- vigilancia sanitaria;
- intranet;
- tarefas/projetos.

Gate:

- dados sensiveis de RH exigem permissoes fortes;
- documentos usam prefixo/metadata de tenant;
- intranet isola conteudo e chatbot por tenant;
- tarefas respeitam escopo de projeto, equipe e tenant.

## Fase 8 - Marketing e analytics executivo

Entrega:

- conectores Google Ads/GA4;
- Clinia/Clinia Ads opcional;
- funil de marketing;
- controle de marketing;
- dashboards executivos;
- analytics serving separado do OLTP;
- camada de IA sobre snapshots governados.

Gate:

- fatos analiticos sao tenant-aware;
- dashboard executivo respeita escopo executivo;
- IA nao acessa dados fora do tenant/corpus autorizado;
- dashboards pesados nao pressionam o OLTP principal.

## Fase 9 - Migracao assistida e paridade

Entrega:

- scripts/importadores por dominio;
- relatorios de divergencia;
- dry-run por tenant;
- migracao incremental;
- guias de operacao;
- criterios de desligamento de bridge por dominio.

Gate:

- cliente consegue operar sem regressao funcional critica;
- dados importados possuem reconciliacao;
- suporte sabe diagnosticar fonte de cada numero;
- Feegow Bridge pode ser reduzido dominio a dominio.

## MVP tecnico recomendado

Antes de qualquer modulo pesado:

- foundation multi-tenant;
- admin de tenant;
- entitlements;
- IAM/membership;
- data access;
- jobs;
- audit;
- secrets;
- health.

Nao escolher primeiro:

- dashboard pesado;
- analytics first;
- integracao Feegow completa;
- repasses;
- financeiro completo.

## Primeiro MVP de produto recomendado

Modulo:

- Administracao de tenant, onboarding minimo e configuracao inicial.

Por que:

- valida tenancy;
- valida entitlements;
- valida usuarios e grupos;
- valida secrets;
- valida audit;
- valida support/admin global;
- evita comecar pelo dominio mais acoplado ao Feegow.

## Ordem de paridade funcional

1. Plataforma/admin.
2. Cadastros mestres.
3. Feegow Bridge v1.
4. Comercial/atendimento.
5. Agenda Magic Core.
6. Financeiro basico.
7. Repasses.
8. Pessoas/RH.
9. Intranet/tarefas.
10. Qualidade/regulatorio.
11. Marketing.
12. Dashboard executivo/IA.

## Criterios finais para producao

- Tenant isolation testado.
- Permissoes e data scopes testados em backend.
- Entitlements bloqueiam backend, nao apenas UI.
- Jobs tenant-aware com idempotencia.
- Secrets por tenant.
- Auditoria append-only.
- Storage particionado por tenant.
- Analytics separado ou isolado por carga.
- Feegow Bridge opcional.
- Plano de rollback por tenant.
- Documentacao operacional por modulo.
