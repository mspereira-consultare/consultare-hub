# Plano — Módulo `/folha-pagamento`

## Resumo
Criar o módulo `/folha-pagamento` para automatizar o fechamento mensal recorrente da folha operacional do RH por competência.

O fluxo do V1 passa a depender de:
- cadastro do colaborador;
- relatório de ponto em PDF;
- ocorrências e ajustes do RH.

A planilha manual do RH deixa de ser enviada pelo usuário e passa a ser tratada como **modelo oficial da exportação XLSX**, versionado em código.

## Decisões fechadas
- rota: `/folha-pagamento`
- grupo da sidebar: `Gestão de Pessoas`
- page key: `folha_pagamento`
- unidade operacional do módulo: **competência mensal**
- período automático: `21` do mês anterior até `20` do mês selecionado
- aba `Comparação` substituída por `Prévia da planilha`
- upload de `REFERENCE_XLSX` removido do fluxo
- exportação XLSX segue o layout operacional padrão do RH
- memória de cálculo continua disponível para auditoria

## Estrutura funcional

### Abas da página
- `Fechamento`
- `Prévia da planilha`
- `Importações`

### Fechamento
Tabela principal por colaborador com:
- salário base
- insalubridade
- dias trabalhados
- faltas
- atrasos
- VT
- D.V.T.
- Totalpass
- outros descontos
- proventos
- descontos
- líquido operacional
- status da linha

### Prévia da planilha
Lista a mesma estrutura do XLSX final, com colunas:
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

### Importações
Aceita apenas:
- `Relatório de ponto (PDF)`

## Cálculo do V1
- chave principal de cruzamento: CPF
- fallback: nome normalizado
- cálculo da linha considera:
  - salário base
  - insalubridade
  - faltas
  - desconto de faltas
  - atrasos
  - desconto de atrasos
  - VT provisionado
  - D.V.T.
  - Totalpass
  - outros descontos fixos
  - ajustes manuais
  - total de proventos
  - total de descontos
  - líquido operacional

## Persistência

### Tabelas ativas
- `payroll_periods`
- `payroll_import_files`
- `payroll_point_daily`
- `payroll_occurrences`
- `payroll_lines`
- `payroll_rules`

### Legado mantido sem uso ativo
- `payroll_reference_rows`

## APIs do fluxo
- `GET /api/admin/folha-pagamento/options`
- `GET /api/admin/folha-pagamento/periods`
- `POST /api/admin/folha-pagamento/periods`
- `GET /api/admin/folha-pagamento/periods/[id]`
- `POST /api/admin/folha-pagamento/periods/[id]/imports/point`
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

## Testes de aceitação
- o módulo funciona sem upload de planilha manual;
- a aba `Importações` aceita apenas PDF de ponto;
- a aba `Prévia da planilha` replica o recorte do XLSX exportado;
- o export sai no layout operacional padrão do RH;
- o drawer da linha continua mostrando memória de cálculo, ponto, ocorrências e prévia;
- competências antigas não quebram mesmo com dados legados no banco;
- frontend em PT-BR correto;
- `tsc` e `next build` passam.
