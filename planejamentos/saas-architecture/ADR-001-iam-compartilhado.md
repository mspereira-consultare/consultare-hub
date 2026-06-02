# ADR-001 - IAM Compartilhado

- Status: Aprovada
- Prioridade: P0
- Relacoes: Depende de ADR-000. Tem dependencia forte com ADR-006 e tensao controlada com ADR-005 e ADR-010.

## Contexto

O novo SaaS devera compartilhar identidade e acesso com outro sistema em desenvolvimento. O objetivo nao e apenas reaproveitar login, mas evitar duplicidade de usuarios, memberships, papeis e grants entre produtos diferentes.

O ambiente atual ja demonstra reaproveitamento parcial de autenticacao entre apps, mas isso ainda nao constitui um IAM central neutro entre sistemas.

## Problema

Se cada sistema mantiver sua propria camada principal de identidade e autorizacao:

- surgira duplicidade de usuarios e permissoes;
- sessoes e grants ficarao inconsistentes;
- revogacao e auditoria se tornarao dificeis;
- integracao futura com SSO e federacao ficara mais cara;
- um dos produtos acabara se tornando dependencia oculta do outro.

## Opcoes consideradas

### 1. Modulo interno do SaaS

Manter IAM como modulo dentro do novo SaaS e expor APIs para o outro sistema consumir.

### 2. IAM no outro sistema

Centralizar identidade no outro sistema e fazer o novo SaaS depender dele.

### 3. Servico separado de plataforma

Criar um IAM independente, com deploy, banco e ciclo proprios, consumido pelos dois sistemas.

### 4. Provider externo como nucleo

Usar um provedor externo como fonte primaria de auth e manter so um subconjunto de grants localmente.

## Decisao

Foi aprovado um IAM como servico de plataforma separado, fora do repositorio do novo SaaS e fora do repositorio do outro sistema.

Esse servico sera responsavel por:

- autenticacao primaria;
- sessao central;
- emissao de access JWT curto;
- refresh token opaco com rotacao e persistencia server-side;
- memberships usuario x organizacao x tenant x sistema x unidade/departamento;
- RBAC e grants por recurso;
- audiences distintas por sistema consumidor;
- exposicao de JWKS;
- readiness para OIDC, SSO e SAML em fase futura.

## Justificativa

O IAM precisa ser neutro entre sistemas para evitar que um produto se torne dono informal da identidade do outro. A separacao tambem reduz o risco de uma mudanca local de auth quebrar todos os consumidores.

Provider externo pode continuar sendo considerado como componente de autenticacao no futuro, mas nao deve substituir a camada de memberships, grants e autorizacao multi-sistema que e especifica do negocio.

## Trade-offs

- Aumenta o custo inicial de modelagem, contratos e operacao.
- Exige SDKs e versionamento de integracao entre sistemas.
- Melhora governanca, revogacao, rastreabilidade e capacidade futura de federacao.
- Reduz retrabalho estrutural em comparacao com auth embutida em um produto.

## Riscos

- Blast radius maior em caso de falha do IAM.
- Stale authorization por cache inadequado de grants.
- Revogacao mal desenhada gerar acessos persistentes indevidos.
- Dependencia excessiva de contratos de token e claims entre sistemas.
- Impersonation futuro ser introduzido sem rastreabilidade suficiente.

## Reversibilidade

Baixa.

Depois que os sistemas passarem a depender de claims, audiences e memberships do IAM, trocar o modelo central fica caro. Por isso esta ADR precisa ser tratada como fundacional.

## Impactos operacionais

- Novo servico para operar, monitorar e restaurar.
- Necessidade de politicas claras de disponibilidade e rotacao de chaves.
- Necessidade de monitorar login, refresh, revogacao e erro de autorizacao como fluxos criticos.
- Contratos de SDK e compatibilidade entre sistemas passam a ser ativos de plataforma.

## Criterios de validacao

- O IAM possui repositorio, deploy e banco proprios.
- O novo SaaS e o outro sistema autenticam contra o mesmo servico.
- Access tokens possuem audience explicita por sistema.
- Refresh tokens sao rotacionados e revogaveis server-side.
- Memberships e grants sao resolvidos no IAM, sem duplicidade canonica em cada sistema.
- O modelo permite evolucao futura para OIDC/SSO/SAML sem ruptura do core.
