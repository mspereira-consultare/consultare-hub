# ADR-010 - Anti-corruption Layer

- Status: Aprovada
- Prioridade: P1
- Relacoes: Depende diretamente de ADR-000. Tem relacao forte com ADR-005 e ADR-008.

## Contexto

O legado continuara em operacao enquanto o novo SaaS e construido. Ainda assim, o novo produto nao pode depender do banco legado como extensao natural de seu runtime. Quando houver necessidade de leitura historica, bootstrap ou validacao de paridade, isso deve acontecer por ponte controlada.

## Problema

Sem uma anti-corruption layer:

- o novo SaaS tende a acessar diretamente tabelas e semanticas do legado;
- contratos legados vazam para o novo dominio;
- staging temporario vira dependencia permanente;
- suporte e times tecnicos criam atalhos fora da arquitetura oficial.

## Opcoes consideradas

### 1. Sem bridge

Nao permitir nenhuma ponte entre o novo SaaS e o legado.

### 2. Bridge read-only

Permitir leitura controlada e mediada por ACL, com contracts explicitos.

### 3. Bridge operacional com escrita cruzada

Permitir leitura e escrita entre os mundos para acelerar rollout.

## Decisao

Foi aprovada uma `anti-corruption layer` read-only, separada do core runtime do novo SaaS.

Essa decisao inclui:

- bridge read-only com credenciais segregadas;
- contratos versionados por dominio;
- staging e snapshots no ambiente novo quando necessario;
- data de expiracao ou revisao explicita por bridge;
- proibicao de join runtime do produto novo com o banco legado;
- proibicao de escrita cruzada entre novo SaaS e legado.

### Atualizacao de nomenclatura - Magic IA

Com o blueprint do Magic IA, ha duas pontes diferentes que nao devem ser confundidas:

- `anti-corruption layer do legado`: ponte read-only para consultar o `consultare-hub` como referencia historica, bootstrap ou validacao de paridade;
- `Feegow Bridge`: modulo/conector opcional por tenant para clientes que usam Feegow como sistema operacional externo.

O `Feegow Bridge` nao autoriza o runtime do Magic IA a acessar o banco legado e nao transforma Feegow em core arquitetural. Ele deve obedecer aos contratos de tenant, SecretRef, JobEnvelope, idempotencia, health e data access policy.

## Justificativa

Esta decisao permite que o legado seja usado como referencia controlada sem se tornar parte estrutural do novo SaaS. Ela tambem reduz o risco de transportar para o novo dominio as semanticas, enums e fragilidades do banco atual.

## Trade-offs

- Introduz mais uma camada para modelar e operar.
- Exige contracts e mapeamentos explicitos.
- Permite bootstrap e validacao de paridade sem contaminacao direta.
- Impede atalhos operacionais de alto risco.

## Riscos

- Bridge sobreviver mais do que deveria.
- Time usar staging legado como se fosse fonte canonica.
- Semantica do legado vazar para o novo dominio por conveniencia.
- Scripts paralelos fora da ACL recriarem o acoplamento invisivel.

## Reversibilidade

Alta, se a bridge for bem isolada.

O objetivo e exatamente permitir que esta ponte seja removivel no futuro. O que nao pode acontecer e ela se infiltrar no core runtime ou nos modelos canonicos do novo produto.

## Impactos operacionais

- Necessidade de runbooks especificos para a bridge.
- Necessidade de auditoria sobre consultas e uso da ACL.
- Necessidade de inventario por dominio do que ainda depende da bridge.
- Necessidade de revisar periodicamente se a ponte continua justificavel.

## Criterios de validacao

- O core runtime do novo SaaS nao possui acesso direto ao banco legado.
- Toda leitura do legado passa por ACL read-only segregada.
- Nenhuma bridge executa escrita cruzada.
- Contracts de leitura do legado sao explicitados por dominio e versionados.
- Staging legado no ambiente novo nao e tratado como fonte canonica de negocio.
- Feegow Bridge, quando existir, e tratado como conector tenant-scoped e nao como dependencia estrutural do Magic Core.
