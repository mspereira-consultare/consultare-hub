# ADR-003 - Secrets por Tenant

- Status: Aprovada
- Prioridade: P0
- Relacoes: Depende de ADR-000 e ADR-002. Tem dependencia forte com ADR-004 e ADR-005.

## Contexto

O sistema atual usa combinacao de env vars, valores fixos e configuracoes operacionais que servem a uma unica operacao. No novo SaaS, credenciais de Feegow, Google, WhatsApp e outras integracoes passam a variar por tenant e precisam ser tratadas como ativos sensiveis de plataforma.

## Problema

Env vars por ambiente e tabelas simples nao resolvem bem:

- segregacao entre tenants;
- auditoria de alteracao e leitura;
- rotacao segura;
- masking na interface;
- consumo seguro por workers;
- futura evolucao para KMS ou Vault.

## Opcoes consideradas

### 1. Variaveis de ambiente por ambiente

Manter secrets em Railway variables, mesmo para configuracoes tenant-specific.

### 2. Tabela simples no banco

Persistir credenciais tenant-specific em tabela comum, sem camada dedicada de secret management.

### 3. Vault externo

Delegar o armazenamento e acesso de secrets a um servico externo especializado.

### 4. Secret service proprio com criptografia

Criar uma camada propria de secret management no novo SaaS, com armazenamento criptografado e acesso mediado por SDK.

## Decisao

Foi aprovado um `Secret Service` proprio no novo SaaS, com:

- armazenamento ciphertext-only em banco novo;
- envelope encryption;
- KEK global por ambiente em secret do Railway;
- versionamento por secret;
- rotacao controlada;
- masking na interface;
- auditoria de leitura e alteracao;
- consumo via `SecretRef` e SDK, nunca por SQL direto em servicos consumidores.

Secrets globais de plataforma continuarao separados dos secrets por tenant.

## Justificativa

Esta decisao equilibra seguranca, controle operacional e simplicidade de stack. Ela evita que o novo SaaS dependa cedo de mais um vendor, mas prepara a arquitetura para migracao futura a KMS ou Vault sem reescrever os consumidores.

Tambem impede que workers e APIs espalhem logica de descriptografia ou acesso livre ao armazenamento.

## Trade-offs

- Exige engenharia cuidadosa de criptografia, versionamento e rotacao.
- Reduz dependencia externa no curto prazo.
- Introduz camada adicional entre aplicacoes e secrets.
- Cria base mais segura e governavel para integracoes por tenant.

## Riscos

- KEK global mal protegida comprometer todo o sistema.
- Rotacao mal desenhada quebrar integracoes em producao.
- SQL direto ser reintroduzido por scripts ou atalhos operacionais.
- Logs ou auditoria vazarem metadados sensiveis em excesso.

## Reversibilidade

Media.

Se a abstracao de `SecretRef` e `SecretProvider` for mantida limpa, a implementacao interna pode evoluir para KMS ou Vault. O que nao pode ser revertido com facilidade e espalhar acesso direto a segredos por varios componentes.

## Impactos operacionais

- Necessidade de politica clara de rotacao.
- Procedimentos de restore precisam considerar consistencia de chaves e ciphertexts.
- Equipe de suporte precisara de permissao separada para ver, editar ou testar credenciais.
- Caminho futuro para KMS ou Vault deve ser validado sem alterar contratos de consumo.

## Criterios de validacao

- Nenhum secret tenant-specific fica em texto puro no banco.
- Nenhum servico consumidor le segredos por SQL direto.
- Toda leitura e alteracao de secret gera trilha de auditoria.
- A interface mostra masking por padrao e nao expoe valores sem autorizacao explicita.
- Existe versao de secret e mecanismo de rotacao sem downtime obrigatorio.
