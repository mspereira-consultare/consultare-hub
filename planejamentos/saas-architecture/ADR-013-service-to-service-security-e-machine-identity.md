# ADR-013 - Service-to-Service Security e Machine Identity

- Status: Aprovada
- Prioridade: P0
- Relacoes: Complementa ADR-001. Tem dependencia forte com ADR-003, ADR-004, ADR-007 e ADR-010.

## Contexto

O novo ecossistema tera multiplos componentes distribuidos: IAM, web runtime, workers, analytics, secret service e bridge legada. Se esses componentes nascerem confiando apenas em rede privada, secrets estaticos ou tokens de usuario reaproveitados, o isolamento de plataforma ficara fragil desde a origem.

## Problema

Sem uma politica formal de identidade entre servicos:

- servicos podem aceitar chamadas com autenticacao fraca;
- user tokens podem ser reutilizados fora do contexto apropriado;
- segredos estaticos viram identidade permanente de runtime;
- revogacao, auditoria e escopo de maquina ficam difusos;
- blast radius de comprometimento tecnico aumenta.

## Opcoes consideradas

### 1. Confiar principalmente na rede privada e secrets estaticos

Usar isolamento de rede e chaves long-lived como principal mecanismo entre servicos.

### 2. Reaproveitar user tokens para integracoes internas

Usar JWTs de usuario e sessao como autenticacao de workers e servicos internos.

### 3. Machine identity dedicada com token interno de curta duracao

Cada deployable relevante possui identidade propria e autentica chamadas internas por token emitido pelo IAM.

## Decisao

Foi aprovada uma politica de `Service-to-Service Security e Machine Identity` com:

- `MachineIdentity` propria por deployable relevante;
- autenticacao interna por JWT de curta duracao emitido pelo IAM;
- `ServiceAudience` explicita por consumidor interno;
- proibicao de confiar apenas na rede privada do Railway como controle principal;
- proibicao de usar user token como identidade permanente de servico, worker, bridge ou analytics;
- uso de credencial estatica apenas como bootstrap para obter credencial curta, nunca como identidade operacional de longo prazo;
- compatibilidade futura com mTLS, sem exigir mTLS no day-1.

## Justificativa

O ecossistema precisa de fronteiras claras entre identidade humana e identidade de maquina. Adotar token interno curto no day-1 reduz acoplamento operacional, melhora auditabilidade e prepara o terreno para endurecimento futuro sem travar a foundation.

## Trade-offs

- Introduz mais contratos e passos no bootstrap de servicos.
- Exige operacao mais madura do IAM.
- Melhora rastreabilidade e least privilege entre servicos.
- Evita confiar em segredos estaticos como mecanismo principal.

## Enforcement operacional

- Todo endpoint interno deve declarar se aceita `user token`, `service token` ou ambos.
- Toda chamada service-to-service deve validar `issuer`, `audience`, expiracao e identidade emissora.
- Cada servico relevante deve ter identidade propria e escopo proprio; nao existe token tecnico generico compartilhado.
- Chaves long-lived usadas no bootstrap devem ter rotacao clara e escopo minimo.
- Delegacao de acao de usuario para worker ou job deve carregar referencia explicita ao ator de origem, sem substituir a identidade da maquina executora.

## Contratos envolvidos

- `MachineIdentity`: identidade tecnica canonica de um deployable ou componente de plataforma.
- `ServiceTokenClaims`: claims minimas do token interno usado entre servicos.
- `ServiceAudience`: audiences aceitas por cada servico consumidor.
- `ClientCredential`: credencial de bootstrap usada para emissao de token curto.
- `DelegationPolicy`: regra que define quando um servico pode agir em nome de um ator humano sem perder a trilha da identidade tecnica.

## Riscos

- IAM indisponivel bloquear emissao de token interno.
- Servicos aceitarem token com audience ampla demais.
- Bootstrap secreto ser tratado como credencial definitiva.
- User token ser reaproveitado por conveniencia em jobs e integracoes.
- Delegacao mal desenhada confundir ator humano com ator tecnico.

## Reversibilidade

Media.

O mecanismo pode endurecer com mTLS, introspeccao ou novos fluxos, mas misturar identidades humanas e tecnicas cedo demais gera acoplamento dificil de desfazer.

## Criterios obrigatorios de validacao

- Nenhum servico interno critico aceita chamada apenas por network trust.
- Nenhum worker ou bridge usa user token como identidade permanente.
- Tokens internos possuem `audience` e expiracao curta.
- Cada deployable relevante possui `MachineIdentity` propria.
- Delegacao de usuario para processamento assincrono preserva identidade tecnica e ator de origem.
