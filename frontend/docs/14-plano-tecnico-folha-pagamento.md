# Plano Técnico — `/folha-pagamento`

## Objetivo
Automatizar o fechamento mensal recorrente da folha operacional do RH por competência, usando:

- cadastro de `/colaboradores`;
- relatório de ponto em PDF;
- ocorrências e ajustes lançados pelo RH.

No desenho atual, o módulo **não depende mais de upload da planilha de referência**. O sistema passa a gerar a planilha operacional padrão do RH em XLSX, com layout versionado em código.

## Escopo do V1

### O que o módulo faz
- organiza o fechamento por competência mensal (`YYYY-MM`);
- calcula o período operacional automático de `21` do mês anterior até `20` do mês selecionado;
- importa apenas o relatório de ponto em PDF;
- gera a folha operacional por colaborador;
- exibe a prévia da planilha final dentro da página;
- exporta o XLSX no layout padrão do RH;
- preserva memória de cálculo e histórico de ajustes por competência.

### O que fica fora do V1
- eSocial e folha legal completa de DP;
- importação manual de XLSX da folha;
- comparação contra planilha externa enviada pelo usuário;
- cálculo completo de férias, 13º, rescisão, horas extras e adicional noturno.

## Fluxo funcional

### 1. Competência
Cada fechamento nasce em uma competência mensal única.

Exemplo:
- competência: `2026-04`
- período operacional: `2026-03-21` até `2026-04-20`

Estados da competência:
- `ABERTA`
- `EM_REVISAO`
- `APROVADA`
- `ENVIADA`

Regras:
- existe apenas um fechamento por competência;
- competências anteriores permanecem consultáveis;
- reabertura é permitida apenas para perfis com permissão adequada.

### 2. Abas da página
O módulo `/folha-pagamento` é dividido em:

- `Fechamento`
- `Prévia da planilha`
- `Importações`

#### Fechamento
Mostra a linha operacional da folha por colaborador, com:
- salário base;
- insalubridade;
- dias trabalhados;
- faltas;
- atrasos em minutos;
- VT;
- D.V.T.;
- Totalpass;
- outros descontos;
- proventos;
- descontos;
- líquido operacional;
- status da linha.

Ao abrir uma linha, o drawer exibe:
- memória de cálculo;
- eventos do ponto;
- ocorrências da competência;
- ajustes manuais;
- prévia da linha exportada.

Na UI atual:
- a coluna `Atrasos` do fechamento explicita a unidade em minutos;
- uma observação abaixo do subtítulo da página descreve a forma de apuração do atraso e como o desconto é convertido.

#### Prévia da planilha
Substitui a antiga aba de comparação.

Mostra exatamente a estrutura que será exportada no XLSX padrão do RH, com as colunas:
- `Nome Funcionário`
- `E-mail`
- `CPF`
- `Centro de custo`
- `Função`
- `Contrato`
- `Salário Base`
- `Insalubridade`
- `VT a.d`
- `VT a.m`
- `D.V.T`
- `Outros Descontos`
- `Desconto Totalpass`
- `Observação`

#### Importações
Aceita apenas:
- `Relatório de ponto (PDF)`

O histórico de importações continua salvo em `payroll_import_files`.

## Estrutura técnica

### Rota da página
- `frontend/src/app/(admin)/folha-pagamento/page.tsx`

### Componentes principais
- `PayrollClosingTable.tsx`
- `PayrollPreviewTable.tsx`
- `PayrollImportsPanel.tsx`
- `PayrollLineDrawer.tsx`
- `PayrollSummaryCards.tsx`
- `PayrollTabNav.tsx`

### Domínio
- `frontend/src/lib/payroll/repository.ts`
- `frontend/src/lib/payroll/types.ts`
- `frontend/src/lib/payroll/constants.ts`
- `frontend/src/lib/payroll/filters.ts`
- `frontend/src/lib/payroll/parsers.ts`

### Parser do ponto
- `workers/payroll_parse_point_pdf.py`
- `workers/worker_payroll_point_import.py`
- `workers/storage_s3.py`

## Persistência

### Tabelas ativas do módulo
- `payroll_periods`
- `payroll_import_files`
- `payroll_point_daily`
- `payroll_occurrences`
- `payroll_lines`
- `payroll_rules`

### Tabela legada mantida por compatibilidade
- `payroll_reference_rows`

Observação:
- a tabela legada permanece no banco, mas o fluxo atual não grava nem lê mais essa base para operação da página.

## APIs

### Ativas no fluxo atual
- `GET /api/admin/folha-pagamento/options`
- `GET /api/admin/folha-pagamento/periods`
- `POST /api/admin/folha-pagamento/periods`
- `GET /api/admin/folha-pagamento/periods/[id]`
- `POST /api/admin/folha-pagamento/periods/[id]/imports/point` -> responde `202 Accepted` e enfileira o processamento
- `POST /api/admin/folha-pagamento/periods/[id]/generate`
- `GET /api/admin/folha-pagamento/periods/[id]/lines`
- `GET /api/admin/folha-pagamento/periods/[id]/preview`
- `PATCH /api/admin/folha-pagamento/lines/[lineId]`
- `POST /api/admin/folha-pagamento/occurrences`
- `PUT /api/admin/folha-pagamento/occurrences/[id]`
- `POST /api/admin/folha-pagamento/periods/[id]/approve`
- `POST /api/admin/folha-pagamento/periods/[id]/mark-sent`
- `POST /api/admin/folha-pagamento/periods/[id]/reopen`
- `GET /api/admin/folha-pagamento/periods/[id]/export`

### Removidas do fluxo ativo
- `POST /api/admin/folha-pagamento/periods/[id]/imports/reference`
- `GET /api/admin/folha-pagamento/periods/[id]/comparison`

## Cálculo operacional

### Fontes
- cadastro do colaborador;
- ponto importado;
- ocorrências da competência;
- regras vigentes da competência.

### Regras principais do V1
- salário-hora do mensalista com base no art. 64 da CLT;
- falta de mensalista em base de `30` avos;
- insalubridade calculada sobre o salário mínimo da competência;
- atraso diário apurado pela diferença entre a primeira batida do dia e o horário de entrada extraído do cabeçalho do relatório de ponto;
- atrasos consolidados exibidos no painel em minutos;
- desconto de atraso convertido de minutos para horas após aplicar a tolerância diária da competência;
- desconto de VT limitado ao menor valor entre custo do VT e `6%` do salário básico;
- estágio sem desconto automático de `6%` de VT por padrão;
- horas extras e adicional noturno ficam fora desta etapa.

### Auditabilidade
Cada competência guarda:
- arquivos importados;
- snapshots de cadastro usados na linha;
- memória de cálculo em JSON;
- ajustes manuais;
- ocorrências lançadas pelo RH.

## Exportação XLSX

### Padrão adotado
O sistema exporta o XLSX já no formato operacional do RH, inspirado no arquivo modelo homologado.

### Estrutura atual
- aba principal nomeada pelo mês da competência;
- linha superior com o período operacional;
- colunas no padrão operacional do RH;
- aba secundária `Memória de cálculo` para auditoria.

### Origem das colunas
- nome, e-mail, CPF, função, contrato e centro de custo: cadastro do colaborador;
- salário base: linha calculada da competência;
- insalubridade, VT mensal, D.V.T., Totalpass e outros descontos: cálculo da competência;
- observação: concatenação de notas da folha, ocorrências e observações relevantes do RH.

## Filtros
Filtros disponíveis na página:
- busca por nome ou CPF;
- centro de custo;
- unidade;
- contrato;
- status da linha.

Não existe mais filtro de comparação com planilha de referência.

## Permissões
`pageKey`: `folha_pagamento`

Padrão do módulo:
- `ADMIN`: `view`, `edit`, `refresh`
- `GESTOR`: `view`, `edit`, `refresh`
- `OPERADOR`: sem acesso por padrão

## Validações importantes
- a página funciona sem upload de XLSX manual;
- a aba `Importações` aceita somente PDF de ponto;
- a aba `Prévia da planilha` reflete o mesmo recorte do XLSX exportado;
- o drawer continua auditável sem depender de base externa;
- competências antigas com registros legados continuam abrindo sem quebra.
