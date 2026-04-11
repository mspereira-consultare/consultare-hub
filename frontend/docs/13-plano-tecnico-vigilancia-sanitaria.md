# Plano Técnico — Vigilância Sanitária

## Objetivo

Criar o módulo `/qualidade/vigilancia-sanitaria` para controle manual de licenças, documentos regulatórios, anexos e vencimentos por unidade.

## Escopo do V1

- três abas: `Gerencial`, `Licenças` e `Documentos`;
- cadastro, edição e exclusão lógica de licenças e documentos;
- upload, download, visualização e exclusão de anexos;
- status de vencimento calculado automaticamente;
- alertas visuais para itens vencidos e vencendo;
- exportação XLSX conforme filtros aplicados;
- sem workflow de aprovação, lembretes automáticos ou worker.

## Regras de Vencimento

- `Vencido`: validade menor que hoje;
- `Vence hoje`: validade igual a hoje;
- `Vencendo`: validade entre hoje e 60 dias;
- `Em dia`: validade maior que 60 dias;
- `Sem validade`: documentos sem validade informada.

## Modelo de Dados

- `health_surveillance_licenses`: cadastro mestre das licenças.
- `health_surveillance_documents`: documentos regulatórios, com campos próprios e vínculo legado opcional em `license_id`.
- `health_surveillance_document_licenses`: vínculo N:N entre documentos e licenças.
- `health_surveillance_files`: anexos de licença ou documento, usando o storage padrão do painel.

### Relação documento x licença

- o vínculo oficial passa a ser múltiplo;
- um documento pode ficar sem licença, com uma licença ou com várias licenças;
- o campo antigo `health_surveillance_documents.license_id` permanece apenas para compatibilidade transitória e guarda o primeiro vínculo quando existir;
- o backfill do relacionamento legado acontece em `ensureSurveillanceTables`, migrando `license_id` para `health_surveillance_document_licenses`.

## APIs

- `GET /api/admin/vigilancia-sanitaria/summary`
- `GET/POST /api/admin/vigilancia-sanitaria/licenses`
- `GET/PUT/DELETE /api/admin/vigilancia-sanitaria/licenses/[id]`
- `GET/POST /api/admin/vigilancia-sanitaria/documents`
- `GET/PUT/DELETE /api/admin/vigilancia-sanitaria/documents/[id]`
- `POST /api/admin/vigilancia-sanitaria/files`
- `DELETE /api/admin/vigilancia-sanitaria/files/[id]`
- `GET /api/admin/vigilancia-sanitaria/files/[id]/download`
- `GET /api/admin/vigilancia-sanitaria/export?type=licenses|documents|all`

### Contrato dos documentos

- `GET /documents` e `GET /documents/[id]` retornam:
  - `linkedLicenses`
  - `linkedLicenseIds`
  - `linkedLicenseNamesLabel`
  - `hasInactiveLinkedLicense`
- `POST /documents` e `PUT /documents/[id]` aceitam `licenseIds?: string[]`.

### Interface do módulo

- o modal de documentos usa multi-select pesquisável para `Licenças vinculadas`;
- a aba `Documentos` mantém filtro de uma licença por vez, agora também com busca digitável;
- a tabela de documentos resume múltiplas licenças e sinaliza vínculos inativos.

## Dashboard

- o `/dashboard` passou a casar metas de faturamento por unidade usando o resolvedor canônico de `financial_units`;
- isso corrige o pareamento entre nomes como `SHOPPING CAMPINAS` e `Campinas Shopping`;
- a seção diária exibe a mensagem `Sem meta diária cadastrada para faturamento` quando não houver meta `daily` ativa.

## Permissões

Novo `PageKey`: `vigilancia_sanitaria`.

- `ADMIN`: `view`, `edit`, `refresh`
- `GESTOR`: `view`, `edit`, `refresh`
- `OPERADOR`: `view`

`refresh` existe por compatibilidade da matriz, mas o módulo não possui worker no V1.
