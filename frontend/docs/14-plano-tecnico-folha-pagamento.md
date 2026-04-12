# Plano Técnico — Folha de Pagamento

## Objetivo
O módulo `/folha-pagamento` automatiza o fechamento mensal recorrente do RH por competência, usando o cadastro de colaboradores como base mestre e cruzando as informações com o relatório de ponto em PDF e a planilha XLSX atualmente usada pela equipe.

O V1 foi desenhado como **folha operacional auditável**, não como motor completo de DP/eSocial. O foco é reproduzir e profissionalizar o fechamento mensal que hoje é feito manualmente em planilha.

## Estrutura do módulo
- rota: `/folha-pagamento`;
- page key: `folha_pagamento`;
- grupo da sidebar: `Gestão de Pessoas`;
- abas principais:
  - `Fechamento`
  - `Comparação`
  - `Importações`

## Competência mensal
Cada fechamento é organizado por uma única competência mensal (`YYYY-MM`).

Regra operacional fixa:
- início do período: dia `21` do mês anterior;
- fim do período: dia `20` do mês selecionado.

Exemplo:
- competência `2026-04`;
- período operacional: `2026-03-21` até `2026-04-20`.

Status suportados:
- `ABERTA`
- `EM_REVISAO`
- `APROVADA`
- `ENVIADA`

## Integração com colaboradores
O módulo reutiliza o cadastro de `/colaboradores` e passou a depender também destes campos adicionais:
- `transportVoucherMode`
- `transportVoucherMonthlyFixed`
- `totalpassDiscountFixed`
- `otherFixedDiscountAmount`
- `otherFixedDiscountDescription`
- `payrollNotes`

Esses campos ficam no cadastro do colaborador e são copiados para snapshot em cada competência, garantindo auditabilidade histórica mesmo se o cadastro mudar no futuro.

## Modelo de dados
### `payroll_rules`
Regras versionadas por competência:
- salário mínimo da competência;
- tolerância padrão de atraso;
- teto percentual para desconto de vale-transporte.

### `payroll_periods`
Cabeçalho da competência mensal:
- competência (`month_ref`);
- período inicial/final;
- status;
- vínculo com as regras vigentes;
- auditoria básica.

### `payroll_import_files`
Histórico dos arquivos importados na competência:
- tipo (`POINT_PDF`, `REFERENCE_XLSX`);
- nome do arquivo;
- storage;
- status de processamento;
- log resumido.

### `payroll_point_daily`
Base diária derivada do relatório de ponto:
- colaborador;
- data;
- marcações;
- horário/jornada;
- minutos trabalhados;
- atraso;
- falta;
- inconsistência;
- justificativa textual capturada do PDF.

### `payroll_occurrences`
Ocorrências e exceções do RH por competência:
- colaborador;
- tipo da ocorrência;
- data inicial/final;
- observação;
- auditoria.

### `payroll_lines`
Linha final da folha operacional por colaborador e competência:
- snapshot do cadastro;
- componentes calculados;
- ajustes manuais;
- totais;
- status da linha;
- memória de cálculo em JSON.

### `payroll_reference_rows`
Linhas normalizadas da planilha manual do RH, usadas somente para comparação e auditoria.

## Regras de cálculo do V1
### Base salarial
- salário base vem do cadastro do colaborador;
- insalubridade = percentual cadastrado sobre o salário mínimo da competência.

### Faltas
- desconto em base de `30` avos para mensalistas;
- faltas justificadas por ocorrência ou férias/recesso cadastrado não entram como falta indevida.

### Atrasos
- atraso diário acima da tolerância da competência entra como débito;
- o valor-hora usa divisor mensal padrão derivado da jornada quando disponível, com fallback de mercado para `220` horas em CLT e `150` horas em estágio quando a jornada não puder ser inferida.

### Vale-transporte
- modo `PER_DAY`: provisiona por dia trabalhado;
- modo `MONTHLY_FIXED`: usa valor mensal fixo cadastrado;
- modo `NONE`: zera o benefício;
- desconto do empregado limitado ao menor valor entre o custo provisionado e `6%` do salário básico;
- estágio não aplica desconto automático de `6%` no V1.

### Outros componentes
- `totalpassDiscountFixed` entra como desconto fixo;
- `otherFixedDiscountAmount` entra como desconto fixo;
- `adjustmentsAmount` pode ser positivo ou negativo e afeta proventos/descontos;
- `payrollNotes` registra contexto recorrente do RH.

## Importações
### Relatório de ponto em PDF
O parser do V1 lê o layout atual do relatório enviado pelo RH e extrai:
- código do colaborador;
- nome;
- CPF;
- departamento;
- horário/jornada;
- linhas diárias com marcações;
- atrasos;
- faltas;
- inconsistências;
- textos como `ATESTADO MEDICO` e `F A L T O U`.

Implementação:
- parser Python: `frontend/scripts/payroll_parse_point_pdf.py`;
- orquestração server-side: `frontend/src/lib/payroll/parsers.ts`.

### Planilha XLSX de referência
A importação lê as abas mensais do arquivo modelo e normaliza as colunas principais:
- nome;
- CPF;
- centro de custo;
- função;
- contrato;
- salário base;
- insalubridade;
- VT diário e mensal;
- D.V.T.;
- outros descontos;
- Totalpass;
- observação.

## APIs principais
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

## Permissões padrão
- `ADMIN`: `view`, `edit`, `refresh`
- `GESTOR`: `view`, `edit`, `refresh`
- `OPERADOR`: sem acesso por padrão no V1

## Exportação
O módulo exporta XLSX com três abas:
- `Folha`
- `Memória de cálculo`
- `Divergências`

A exportação respeita o mesmo recorte filtrado da interface.

## Observações de operação
- o V1 não tem worker nem heartbeat;
- o processamento dos arquivos é síncrono;
- a planilha manual do RH continua sendo base de conferência, não fonte final;
- a competência aprovada fica preservada para consulta e auditoria futura.
