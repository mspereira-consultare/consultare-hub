# Plano — Módulo `/folha-pagamento` (fechamento mensal recorrente do RH)

## Resumo
Criar o módulo **`/folha-pagamento`** no grupo **`Gestão de Pessoas`**, vinculado ao cadastro de `/colaboradores`, para executar o **fechamento mensal da folha** competência a competência.

O V1 gera a **folha operacional mensal** cruzando:
- cadastro do colaborador;
- relatório de ponto em PDF;
- ocorrências e ajustes do RH;
- planilha XLSX atual do RH como base de comparação e auditoria.

A unidade central do módulo é a **competência mensal** (`YYYY-MM`), com histórico preservado e repetição do processo mês a mês.

## Decisões fechadas
- rota: `/folha-pagamento`;
- grupo da sidebar: `Gestão de Pessoas`;
- page key: `folha_pagamento`;
- módulo mensal e recorrente por competência;
- período operacional automático: `21` do mês anterior até `20` do mês selecionado;
- V1 manual e auditável, sem worker e sem heartbeat;
- processamento síncrono dos uploads no V1;
- XLSX do RH como base de comparação, não como fonte final;
- fonte final da competência aprovada: `payroll_lines`.

## Escopo funcional do V1
### Aba `Fechamento`
- tabela operacional por colaborador;
- cálculo da folha com salário base, insalubridade, faltas, atrasos, VT, D.V.T., Totalpass, descontos fixos e ajustes manuais;
- drawer com memória de cálculo, dias do ponto e comparação com a base de referência.

### Aba `Comparação`
- comparação entre a folha gerada e a planilha manual do RH;
- status por linha:
  - `IGUAL`
  - `DIVERGENTE`
  - `SEM_BASE`
  - `SO_NA_BASE`

### Aba `Importações`
- upload do relatório de ponto em PDF;
- upload da planilha XLSX de referência;
- histórico das importações da competência;
- log resumido de processamento.

## Vínculo com `/colaboradores`
Campos reaproveitados:
- nome;
- CPF;
- e-mail;
- cargo/função;
- centro de custo;
- unidade(s);
- tipo de contrato;
- salário base;
- percentual de insalubridade;
- VT por dia;
- admissão;
- desligamento;
- observações;
- recessos/férias já cadastrados.

Campos complementares adicionados ao cadastro:
- `transportVoucherMode`;
- `transportVoucherMonthlyFixed`;
- `totalpassDiscountFixed`;
- `otherFixedDiscountAmount`;
- `otherFixedDiscountDescription`;
- `payrollNotes`.

## Modelo de dados do módulo
- `payroll_periods`
- `payroll_import_files`
- `payroll_point_daily`
- `payroll_occurrences`
- `payroll_lines`
- `payroll_reference_rows`
- `payroll_rules`

## Regras de cálculo adotadas no V1
- competência fechada por mês selecionado;
- cruzamento principal por `CPF`, com fallback por nome normalizado;
- mensalista com base horária derivada do padrão de mercado documentado;
- desconto de faltas de mensalista em base de `30` avos;
- insalubridade sobre o salário mínimo vigente da competência;
- desconto de vale-transporte limitado ao menor valor entre o custo do VT e `6%` do salário básico;
- estagiário sem desconto automático de `6%` de VT por padrão;
- horas extras e adicional noturno fora do V1.

## APIs previstas
- `GET /api/admin/folha-pagamento/options`
- `GET /api/admin/folha-pagamento/periods`
- `POST /api/admin/folha-pagamento/periods`
- `GET /api/admin/folha-pagamento/periods/[id]`
- `POST /api/admin/folha-pagamento/periods/[id]/imports/point`
- `POST /api/admin/folha-pagamento/periods/[id]/imports/reference`
- `POST /api/admin/folha-pagamento/periods/[id]/generate`
- `GET /api/admin/folha-pagamento/periods/[id]/lines`
- `GET /api/admin/folha-pagamento/lines/[lineId]`
- `PATCH /api/admin/folha-pagamento/lines/[lineId]`
- `GET /api/admin/folha-pagamento/periods/[id]/comparison`
- `POST /api/admin/folha-pagamento/occurrences`
- `PUT /api/admin/folha-pagamento/occurrences/[id]`
- `POST /api/admin/folha-pagamento/periods/[id]/approve`
- `POST /api/admin/folha-pagamento/periods/[id]/mark-sent`
- `POST /api/admin/folha-pagamento/periods/[id]/reopen`
- `GET /api/admin/folha-pagamento/periods/[id]/export`

## Testes e aceite
- criar competência mensal gera o período `21 -> 20` corretamente;
- não é possível duplicar competência do mesmo mês;
- upload do PDF de ponto processa o layout atual do RH;
- upload do XLSX importa as colunas mesmo com variações entre abas;
- folha é gerada para os colaboradores válidos do período;
- recessos/férias cadastrados em `/colaboradores` não viram falta indevida;
- ajustes manuais ficam salvos e auditáveis;
- exportação XLSX replica o recorte visível;
- frontend em PT-BR correto;
- `tsc` e `next build` passam.
