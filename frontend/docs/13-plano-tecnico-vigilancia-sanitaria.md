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
- `health_surveillance_documents`: documentos regulatórios, com vínculo opcional a licença.
- `health_surveillance_files`: anexos de licença ou documento, usando o storage padrão do painel.

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

## Permissões

Novo `PageKey`: `vigilancia_sanitaria`.

- `ADMIN`: `view`, `edit`, `refresh`
- `GESTOR`: `view`, `edit`, `refresh`
- `OPERADOR`: `view`

`refresh` existe por compatibilidade da matriz, mas o módulo não possui worker no V1.
