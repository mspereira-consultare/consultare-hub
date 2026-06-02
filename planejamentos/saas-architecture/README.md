# ADR Freeze - Arquitetura Congelada do Novo SaaS

## Objetivo deste pacote

Este diretorio consolida as decisoes arquiteturais fundamentais do novo SaaS multi-tenant da Consultare.

O objetivo deste pacote e:

- registrar a fundacao arquitetural aprovada;
- reduzir ambiguidades antes do inicio da implementacao;
- impedir que o novo SaaS herde acoplamentos estruturais do legado;
- transformar decisoes de direcao em contratos operacionais;
- orientar a futura fase de foundation com base em ADRs formais.

Este pacote e exclusivamente documental. Nao descreve implementacao, scaffolding, telas nem estrutura inicial de codigo.

---

## Premissas congeladas da nova plataforma

As decisoes abaixo devem ser tratadas como congeladas nesta fase:

- o novo SaaS sera construido fora do repositorio do legado;
- o novo SaaS tera Railway project separado, banco separado, pipelines separados e CI/CD separado;
- o legado sera usado apenas como referencia funcional e operacional;
- qualquer ponte com o legado sera obrigatoriamente mediada por ACL read-only;
- o runtime do novo SaaS nao podera acessar diretamente o banco legado;
- o IAM compartilhado sera um servico de plataforma separado;
- a estrategia padrao de tenancy sera row-level no banco novo;
- tenant enforcement exigira contexto de tenant, camada de acesso aprovada e trilha formal para acessos globais;
- credenciais por tenant serao tratadas por um secret service proprio;
- workers serao tenant-aware e desacoplados do runtime web;
- auditoria de negocio sera append-only e separada de logs tecnicos;
- analytics serving sera separado do OLTP;
- onboarding de tenants sera tratado como fluxo de estado;
- o novo SaaS tera design system interno;
- a coexistencia com o legado sera tratada por anti-corruption layer read-only;
- dados terao classificacao, retencao e lifecycle definidos por classe;
- autenticacao entre servicos usara machine identity com token interno de curta duracao;
- entitlements e feature gating serao resolvidos no backend;
- data movement seguira modelo hibrido com outbox como padrao dominante.

---

## Papel do legado

O sistema atual permanece em producao e nao deve ser alterado como parte desta iniciativa.

Neste contexto, o legado serve apenas como:

- referencia funcional de negocio;
- fonte de aprendizado sobre modulos e operacao;
- insumo para paridade futura;
- origem eventual de leitura controlada via bridge read-only.

O legado nao e fonte arquitetural do novo SaaS.

---

## Inventario das ADRs

| ADR | Titulo | Prioridade | Status | Decisao central |
| --- | --- | --- | --- | --- |
| ADR-000 | Separacao fisica entre legado e novo SaaS | P0 | Aprovada | Novo SaaS fora do legado em repo, Railway project, banco e pipelines proprios |
| ADR-001 | IAM compartilhado | P0 | Aprovada | IAM como servico de plataforma separado e neutro entre sistemas |
| ADR-002 | Multi-tenancy row-level | P0 | Aprovada | Shared MySQL novo com isolamento logico por tenant_id |
| ADR-003 | Secrets por tenant | P0 | Aprovada | Secret service proprio com envelope encryption e acesso por SecretRef |
| ADR-004 | Workers multi-tenant | P0 | Aprovada | Fila dedicada com workers tenant-aware e estado em MySQL novo |
| ADR-005 | Auditoria | P0 | Aprovada | Auditoria de negocio append-only separada dos logs tecnicos |
| ADR-006 | Monorepo interno | P0 | Aprovada | Repo novo com monorepo interno para o SaaS, separado do IAM e do legado |
| ADR-007 | Analytics serving | P1 | Aprovada | Camada analitica separada do OLTP e alimentada de forma assincrona |
| ADR-008 | Onboarding de tenants | P1 | Aprovada | Onboarding como fluxo de estado auditavel |
| ADR-009 | Design system | P2 | Aprovada | Design system interno com componentes permission-aware e tenant-aware |
| ADR-010 | Anti-corruption layer | P1 | Aprovada | Bridge legada read-only, isolada do core runtime do novo SaaS |
| ADR-011 | Tenant enforcement e data access policy | P0 | Aprovada | Isolamento por tenant imposto por contexto, camada aprovada e grants globais explicitos |
| ADR-012 | Data governance, LGPD e lifecycle | P0 | Aprovada | Dados classificados por classe, retencao e modo de delecao desde a origem |
| ADR-013 | Service-to-service security e machine identity | P0 | Aprovada | Servicos autenticam por identidade propria e JWT interno de curta duracao |
| ADR-014 | Entitlements, billing e feature flags | P1 | Aprovada | Entitlements internos e gating server-side, com gateway de cobranca desacoplado |
| ADR-015 | Data movement e integration delivery model | P0 | Aprovada | Outbox como padrao, inbox/idempotencia para consumo e batch restrito a bootstrap e reconciliacao |

---

## Foundation Freeze complementar

As ADRs 011 a 015 fecham o trecho mais operacional do freeze:

- enforcement real de tenancy;
- governanca de dados e lifecycle;
- trust entre servicos e machine identity;
- contrato de entitlements e feature gating;
- modelo oficial de movimentacao de dados e disparo de integracoes.

Sem esse bloco complementar, o pacote ficaria forte em direcao arquitetural, mas fraco em enforcement.

---

## Principios estruturais ja congelados

- Separacao fisica completa do legado.
- IAM como servico de plataforma separado.
- Row-level tenancy no banco novo.
- Tenant enforcement por contexto, grants e camada de acesso aprovada.
- Secret service proprio com envelope encryption.
- Workers tenant-aware com fila dedicada.
- Auditoria append-only separada de logs tecnicos.
- Repo novo com monorepo interno.
- Analytics serving separado do OLTP.
- Onboarding como fluxo de estado.
- Design system interno.
- Anti-corruption layer read-only.
- Data governance com classificacao, retencao e lifecycle.
- Machine identity para comunicacao entre servicos.
- Entitlements internos com enforcement server-side.
- Data movement hibrido com outbox como padrao.

---

## Conflitos e tensoes entre ADRs

- IAM separado vs monorepo interno do SaaS: o SaaS tera repo proprio com monorepo interno, mas o IAM nao vive nesse repo. Isso aumenta consistencia interna do produto, porem exige contracts e SDKs bem versionados.
- Row-level tenancy vs risco de vazamento: a estrategia padrao reduz custo e melhora analytics, mas exige disciplina extrema em contexto de tenant, grants globais, filtros, cache, jobs e suporte.
- JWT interno day-1 vs mTLS futuro: o modelo aprovado acelera o bootstrap da foundation, mas exige que o day-1 nao confie apenas na rede privada do Railway.
- Analytics separado vs custo operacional: separar OLTP e analytics protege desempenho e governanca, mas adiciona banco, pipelines e monitoramento extras.
- Bridge read-only vs tentacao de bootstrap permanente: a bridge ajuda no bootstrap e na validacao, mas precisa de escopo e prazo claros para nao virar dependencia estrutural.
- Entitlements internos vs gateway futuro: a fundacao precisa tratar plano e capability como contrato tecnico proprio, sem deixar o futuro gateway redesenhar o core de autorizacao comercial.

---

## Como ler este pacote

A ordem recomendada de leitura e:

1. ADR-000
2. ADR-001
3. ADR-002
4. ADR-003
5. ADR-004
6. ADR-005
7. ADR-006
8. ADR-007
9. ADR-008
10. ADR-009
11. ADR-010
12. ADR-011
13. ADR-012
14. ADR-013
15. ADR-014
16. ADR-015
17. CONTRACT-PACK.md
18. OPERATIONAL-BASELINE.md
19. OPEN-QUESTIONS.md
20. RISKS.md
21. NEXT-STEPS.md
22. FOUNDATION-GATES.md

As ADRs P0 definem a fundacao minima para que o novo SaaS nasca sem repetir os erros estruturais do legado. `CONTRACT-PACK.md` fecha a camada de enforcement e contratos fundacionais. `OPERATIONAL-BASELINE.md` fecha a readiness operacional minima. `FOUNDATION-GATES.md` deve ser usado como criterio final antes da abertura do novo repositorio.

---

## Fora de escopo desta fase

Os itens abaixo nao fazem parte deste pacote:

- implementacao do novo SaaS;
- definicao de telas e fluxos de UX;
- criacao da estrutura real do repositorio novo;
- migracao tecnica do legado;
- scaffolding, boilerplate ou definicao de framework interno;
- definicao detalhada de roadmap de features.

---

## Uso esperado

Este pacote deve servir como referencia oficial para:

- alinhamento entre arquitetura, produto e operacao;
- revisoes futuras de foundation;
- preparo formal da entrada em engineering;
- futuras ADRs complementares de baixo impacto;
- validacao formal de readiness antes da implementacao.
