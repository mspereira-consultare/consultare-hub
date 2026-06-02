# ADR-006 - Monorepo Interno

- Status: Aprovada
- Prioridade: P0
- Relacoes: Depende de ADR-000. Tem tensao controlada com ADR-001 porque o IAM nao fara parte deste monorepo.

## Contexto

O novo SaaS precisa de consistencia entre apps, pacotes compartilhados, design system e contratos internos. Ao mesmo tempo, o produto nao pode compartilhar o repositorio do legado nem engolir o IAM dentro do mesmo ciclo de vida.

## Problema

Sem uma decisao clara sobre repositorio e boundaries:

- o SaaS pode nascer misturado ao legado;
- pacotes compartilhados podem vazar dependencias entre apps;
- ownership fica difuso;
- o custo de consistencia entre front, backend e packages cresce rapidamente.

## Opcoes consideradas

### 1. Continuar no repo legado

Manter o novo SaaS dentro do repositorio atual.

### 2. Varios repos novos

Separar cada app ou servico do novo SaaS em repositorios distintos desde o inicio.

### 3. Repo novo com monorepo interno

Criar um novo repositorio exclusivo do SaaS, com apps e packages internos bem delimitados.

## Decisao

Foi aprovado um `repo novo com monorepo interno` para o novo SaaS.

Essa decisao inclui:

- repositorio exclusivo do novo SaaS;
- apps e packages compartilhados apenas dentro do ecossistema do novo produto;
- IAM fora deste repo, em repositorio e ciclo proprios;
- regras de dependencia `app -> package`, nunca `package -> app`;
- ownership explicito por bounded context;
- pipelines por deployable, nao um unico pipeline monolitico.

## Justificativa

Essa estrutura preserva separacao fisica do legado, mas ainda permite consistencia e velocidade de desenvolvimento no novo produto. Criar muitos repositorios cedo demais adicionaria friccao desnecessaria para contracts, shared UI, tenancy e auditoria.

## Trade-offs

- Exige disciplina de boundary e governanca de dependencias.
- Facilita evolucao de packages compartilhados internos.
- Reduz friccao entre apps comparado ao multirepo total.
- Exige estrategia clara de CI para nao recompilar e redeployar tudo a cada mudanca.

## Riscos

- Monorepo virar monolito modular falso.
- Packages compartilhados concentrarem logica demais e perderem ownership.
- Apps passarem a acessar detalhes internos uns dos outros.
- Pipeline unico recriar acoplamento operacional entre deployables.

## Reversibilidade

Media-alta.

Se os boundaries forem mantidos com disciplina, o monorepo pode ser fatiado no futuro. O que nao deve acontecer e o novo SaaS nascer no repo legado ou sem regras de dependencia.

## Impactos operacionais

- Necessidade de politica clara de ownership.
- Necessidade de filtros de CI por caminho e por deployable.
- Necessidade de convencoes de package e contratos internos.
- Necessidade de SDKs internos bem versionados para tenancy, auth, audit e integrations.

## Criterios de validacao

- O novo SaaS vive em repositorio separado do legado.
- O IAM nao vive no mesmo repositorio do SaaS.
- Existe regra formal de dependencia entre apps e packages.
- Pipelines podem rodar por deployable sem obrigar rebuild completo de tudo.
- Nenhum package depende de implementacao privada de app.
