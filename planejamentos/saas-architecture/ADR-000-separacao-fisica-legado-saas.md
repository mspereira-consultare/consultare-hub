# ADR-000 - Separacao Fisica entre Legado e Novo SaaS

- Status: Aprovada
- Prioridade: P0
- Relacoes: Governa todas as demais ADRs. E pre-requisito estrutural para ADR-001 ate ADR-010.

## Contexto

O ecossistema atual da Consultare continuara operando em producao durante a construcao do novo SaaS. O sistema atual nao deve ser refatorado, migrado incrementalmente nem usado como base arquitetural do novo produto.

O risco principal desta iniciativa nao e apenas tecnico. O maior risco e transformar o novo SaaS em uma extensao do legado, reaproveitando infraestrutura, pipelines, bancos, credenciais e padroes de acoplamento que inviabilizam a nova fundacao multi-tenant.

## Problema

Sem uma separacao fisica clara, o novo SaaS tende a:

- herdar dependencias ocultas do legado;
- misturar ciclos de deploy e rollback;
- compartilhar segredos e acessos operacionais;
- abrir caminho para escrita cruzada, debugging inseguro e vazamento de dados;
- dificultar a futura governanca entre produto novo e sistema legado.

## Opcoes consideradas

### 1. Reaproveitamento no mesmo repo e no mesmo projeto operacional

Usar o repositorio atual, o mesmo Railway project, o mesmo banco e os mesmos pipelines.

### 2. Separacao parcial

Criar partes novas, mas manter algum compartilhamento estrutural, como banco, pipelines, projeto Railway ou conexao operacional direta com o legado.

### 3. Separacao total

Criar o novo SaaS com repositorio proprio, Railway project proprio, banco proprio, credenciais proprias e pipelines proprios, permitindo apenas bridge read-only controlada com o legado.

## Decisao

Foi aprovada a separacao fisica total entre legado e novo SaaS.

Isso significa:

- repositorio separado para o novo SaaS;
- Railway project separado;
- MySQL separado;
- fila, cache e storage operacionais separados;
- pipelines separados;
- CI/CD separado;
- credenciais e secrets separados por ambiente;
- proibicao de acesso direto do runtime do novo SaaS ao banco legado;
- qualquer leitura do legado somente via bridge ACL read-only, isolada do core runtime.

## Justificativa

Esta decisao e a principal barreira contra acoplamento estrutural. Ela protege:

- a nova modelagem multi-tenant;
- a seguranca de dados;
- a independencia de deploy;
- a governanca de acessos;
- a possibilidade de evolucao sem herdar compromissos do legado.

Separacao parcial parece mais barata no curto prazo, mas amplia o custo futuro de desvinculacao e faz o novo SaaS nascer comprometido.

## Trade-offs

- Aumenta o custo inicial de infraestrutura e bootstrap.
- Exige operacao paralela de mais ambientes.
- Impoe mais trabalho de setup para repositorio, observabilidade e pipelines.
- Reduz de forma significativa o risco de contaminacao arquitetural.

## Riscos

- Subestimar o esforco de operacao de multiplos ambientes no Railway.
- Criar excecoes temporarias de acesso ao legado e nunca remove-las.
- Permitir scripts de suporte fora da ACL, recriando o acoplamento por fora da arquitetura oficial.
- Reutilizar IDs, enums ou contratos do legado como se fossem canonicos.

## Reversibilidade

Baixa.

Depois que o novo SaaS nascer fisicamente misturado ao legado, a separacao posterior tende a ser cara, lenta e politicamente dificil. Esta e uma decisao fundacional e deve ser tratada como praticamente irreversivel.

## Impactos operacionais

- Provisionamento de novo Railway project e novos ambientes.
- Novo banco com politica propria de backup e restore.
- Novos pipelines e segregacao clara de deploy.
- Necessidade de ACL e credenciais read-only especificas para a bridge legada.
- Maior disciplina de suporte e troubleshooting para evitar atalhos operacionais.

## Criterios de validacao

- O novo SaaS possui repositorio proprio, sem compartilhar o repo do legado.
- O novo SaaS possui Railway project proprio e nao compartilha runtime com o legado.
- O novo SaaS nao utiliza credenciais do banco legado em nenhum servico de producao.
- Os pipelines de build, deploy e rollback sao independentes do legado.
- Qualquer ponte com o legado usa credencial read-only segregada.
- Nao existe conexao runtime direta entre o core do novo SaaS e o banco legado.
