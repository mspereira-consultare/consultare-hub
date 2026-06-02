# ADR-008 - Onboarding de Tenants

- Status: Aprovada
- Prioridade: P1
- Relacoes: Depende de ADR-001, ADR-002, ADR-003 e ADR-004. Tem relacao forte com ADR-010 para bootstrap legado read-only.

## Contexto

O novo SaaS precisa suportar entrada de novos clientes com credenciais, limites, defaults e validacoes distintas. Se o onboarding nascer manual, o produto vira dependente de operacao artesanal desde o inicio.

## Problema

Sem um fluxo formal de onboarding:

- configuracoes ficam inconsistentes;
- validacoes de integracao se tornam informais;
- tenants entram em producao sem health checks suficientes;
- suporte e comercial dependem de passos manuais de alto risco;
- defaults da Consultare podem ser copiados sem controle.

## Opcoes consideradas

### 1. Onboarding manual

Cadastrar tenant e configuracoes por processo operacional e checklist humano.

### 2. Wizard simples

Criar uma interface de cadastro sem workflow formal de estados.

### 3. Fluxo de estado auditavel

Tratar onboarding como capability de plataforma com etapas e gates definidos.

## Decisao

Foi aprovado onboarding como fluxo de estado auditavel.

O fluxo deve cobrir:

- criacao de tenant;
- definicao de plano e entitlements;
- admin inicial;
- setup de integrations e secret slots;
- validacao de credenciais;
- defaults e templates;
- health checks;
- test jobs;
- go-live gate.

Bootstrap a partir do legado, quando existir, sera opcional e sempre mediado por bridge read-only.

## Justificativa

Onboarding e uma capability central de SaaS, nao um ritual operacional. Formalizar o processo reduz erro humano, melhora rastreabilidade e transforma crescimento comercial em fluxo suportavel.

## Trade-offs

- Exige investimento antecipado em control plane.
- Reduz dependencia de playbooks manuais.
- Aumenta consistencia entre tenants.
- Pode parecer mais lento no inicio, mas reduz retrabalho operacional logo depois.

## Riscos

- Fluxo rigido demais bloquear casos especiais legitimos.
- Defaults ruins virarem padrao estrutural.
- Health checks superficiais gerarem falso senso de prontidao.
- Bootstrap via bridge read-only sobreviver como dependencia permanente.

## Reversibilidade

Media.

Etapas e UX podem evoluir. O que nao deve ser revertido e o principio de onboarding governado por estado e validacao explicita.

## Impactos operacionais

- Menos dependencia de scripts e SQL manuais.
- Mais transparencia para suporte, produto e comercial.
- Necessidade de definir claramente quem pode avancar cada etapa.
- Necessidade de checklists tecnicos formalizados por integracao.

## Criterios de validacao

- E possivel criar tenant sem integracoes e mantelo em estado nao ativo.
- Credenciais invalidas impedem avancar etapas criticas.
- Existe registro auditavel de quem criou, validou e liberou o tenant.
- Bootstrap legado, quando usado, e opcional e passa pela bridge read-only.
- Nenhum tenant entra em go-live sem health checks e gates formais.
