# Plano T?cnico ? M?dulo `/equipamentos`

## Objetivo

Substituir a planilha manual de equipamentos da cl?nica por um m?dulo estruturado no painel, com vis?o gerencial, cadastro padronizado, hist?rico de manuten??o e anexos.

## Escopo do V1

- rota `/equipamentos`
- grupo `QUALIDADE` na sidebar
- filtros por unidade, status de calibra??o, status operacional e busca textual
- cards gerenciais:
  - total de equipamentos
  - calibra??o em dia
  - vencendo
  - vencidos
  - em manuten??o
- tabela operacional com pagina??o
- modal de cadastro/edi??o em abas:
  - `Cadastro`
  - `Calibra??o`
  - `Manuten??o`
  - `Arquivos`
- exporta??o XLSX

## Modelo funcional

### Cadastro principal

Cada linha representa **um equipamento f?sico**.

Campos principais do cadastro:

- unidade
- descri??o do equipamento
- n?mero de identifica??o
- c?digo de barras / QR opcional
- categoria
- fabricante
- modelo
- n?mero de s?rie
- localiza??o / setor
- status operacional
- observa??es gerais

### Calibra??o

Campos:

- exige calibra??o (`sim/n?o`)
- periodicidade em dias
- data da ?ltima calibra??o
- data da pr?xima calibra??o
- respons?vel pela calibra??o
- observa??es da calibra??o

O status de calibra??o ? calculado automaticamente:

- `EM_DIA`
- `VENCENDO`
- `VENCIDO`
- `SEM_PROGRAMACAO`
- `NAO_APLICAVEL`

### Manuten??o

Hist?rico de eventos por equipamento:

- manuten??o preventiva
- manuten??o corretiva
- ocorr?ncia
- calibra??o

Cada evento registra:

- data
- tipo
- descri??o
- respons?vel / fornecedor
- status
- observa??es

### Arquivos

Suporte a anexos por equipamento:

- foto
- certificado
- manual
- outro

## Backend

### Tabelas

- `clinic_equipment`
- `clinic_equipment_events`
- `clinic_equipment_files`

### APIs

- `GET /api/admin/equipamentos`
- `POST /api/admin/equipamentos`
- `GET /api/admin/equipamentos/[id]`
- `PUT /api/admin/equipamentos/[id]`
- `GET /api/admin/equipamentos/options`
- `GET /api/admin/equipamentos/[id]/eventos`
- `POST /api/admin/equipamentos/[id]/eventos`
- `PUT /api/admin/equipamentos/[id]/eventos/[eventId]`
- `DELETE /api/admin/equipamentos/[id]/eventos/[eventId]`
- `GET /api/admin/equipamentos/[id]/arquivos`
- `POST /api/admin/equipamentos/[id]/arquivos`
- `GET /api/admin/equipamentos/arquivos/[fileId]/download`
- `GET /api/admin/equipamentos/export`

## Permiss?es

Novo `pageKey`:

- `equipamentos`

Comportamento padr?o:

- `ADMIN`: view/edit/refresh
- `GESTOR`: view/edit/refresh
- `OPERADOR`: view/refresh

## Valida??o m?nima da entrega

- p?gina carrega com tabela, cards e filtros
- cadastro e edi??o de equipamento funcionam
- status de calibra??o ? derivado corretamente
- eventos de manuten??o podem ser criados, editados e exclu?dos
- upload e download de arquivos funcionam
- exporta??o XLSX respeita os filtros aplicados
- frontend em PT-BR, sem mojibake
