# Resumo — Refatoração de `/ponto` + API Sólides

## Status

### O que foi implementado

- `/ponto` foi desacoplada da competência de folha na experiência principal.
- A página agora trabalha com:
  - `data inicial`
  - `data final`
  - leitura da base sincronizada de ponto
- Foi criado um domínio próprio de ponto em:
  - `apps/painel/src/lib/point/types.ts`
  - `apps/painel/src/lib/point/filters.ts`
  - `apps/painel/src/lib/point/repository.ts`
- Foram criadas rotas novas de leitura para `/ponto`, agora ligadas ao domínio `point`:
  - `GET /api/admin/ponto/options`
  - `GET /api/admin/ponto/overview`
  - `GET /api/admin/ponto/daily`
  - `GET /api/admin/ponto/hours-balance`
  - `GET /api/admin/ponto/vacations`
  - `GET /api/admin/ponto/signatures`
  - `POST /api/admin/ponto/sync`
- Foi criado um worker novo, separado da folha:
  - `workers/worker_point_sync.py`
- O orquestrador dos workers passou a reconhecer:
  - `point_sync`
- O worker legado da folha foi corrigido em dois pontos críticos:
  - parou de usar `showFired=1` em `/employee/find-all`
  - passou a entender datas `DD/MM/YYYY` do `daily-activity`

### O que foi validado

- `pnpm exec tsc -p apps/painel/tsconfig.json --noEmit --pretty false`
- `python3 -m py_compile workers/worker_point_sync.py workers/worker_payroll_point_sync.py workers/main.py`
- Sync real de `1 dia` na base nova de ponto:
  - `59` colaboradores sincronizados
  - `59` registros diários
  - `58` snapshots de banco de horas
  - `0` não vinculados
- Amostras reais persistidas:
  - `Vitoria Gabriely Ribeiro Dos Reis Emiliano` com `609 min`
  - `Leticia Campos Altafin` com `576 min`
  - `Sara Nascimento Teodorio` com `557 min`

### O que ainda merece evolução

- A sync nova já funciona, mas ainda não foi rodada na janela cheia de `30 dias`.
- O endpoint de espelho oficial continua indisponível com o token atual:
  - tentativas em `/`, `/report`, `/time-sheet/report`
  - retorno observado: `404`
- Assinatura digital apareceu como desabilitada no empregador neste token:
  - `gedSignature: false`
- A recorrência “quase real-time” de pendências/atrasos/extras ainda deve virar um desenho próprio de produção:
  - sync quente do dia atual
  - reconciliação maior em segundo plano

## Diagnóstico da API

### Conclusão principal

O token atual parece estar correto para a empresa certa.

O erro principal não era o vínculo entre Sólides e painel.

O problema estava no endpoint/parâmetro usados anteriormente para montar a base de colaboradores:

- caminho antigo problemático:
  - `GET /employee/find-all?showFired=1`
  - retornou apenas `3` desligados
- caminho correto para base ativa:
  - `GET /employee/find-all`
  - retornou `59` ativos
- complemento do relógio:
  - `GET /electronic-watch/employees`
  - retornou `62` registros
  - na prática: `59` ativos + `3` desligados

Validação de vínculo por CPF:

- `59` colaboradores ativos da Sólides
- `59` batendo com o cadastro local do painel por CPF
- portanto, o token não parece “errado”; o consumo anterior é que estava truncando a base

## Schema resumido dos endpoints usados

### `GET /api/employer/employee/find-all`

Uso:

- base ativa de colaboradores
- melhor fonte principal para montar o roster da integração

Exemplo real de campos:

```json
{
  "id": 6560266,
  "name": "Rubia Garcia Ravides",
  "email": "rubiagarcia17@icloud.com",
  "cpf": "22814386867",
  "admissionDate": 1535763600000,
  "currentWorkSchedule": {
    "id": 2802229,
    "startDate": 1781924400000,
    "inactive": false
  },
  "company": { "id": 2509741 },
  "jobRoleDTO": { "id": 3045471 },
  "fired": false,
  "recordsPunch": true
}
```

Observações:

- `showFired=1` trouxe só `3` desligados
- sem `showFired`, ou com `showFired=false`, veio a base ativa `59`

### `GET /api/employer/electronic-watch/employees`

Uso:

- complemento operacional do relógio
- útil para ver quem está no módulo de ponto, inclusive desligados recentes

Exemplo real de campos:

```json
{
  "admin": false,
  "name": "Priscila Roberta De Oliveira Matos",
  "externalId": "",
  "cpf": "33037589809",
  "code": 6561342,
  "demitido": false
}
```

Observações:

- trouxe `62` registros
- serviu para confirmar a diferença entre “ativos do employer” e “base do relógio”

### `GET /api/employer/employee/find?tangerinoId=...`

Uso:

- enriquecer colaborador do relógio com detalhes completos
- resolve jornada atual, cargo, gestores etc.

Exemplo real de campos:

```json
{
  "id": 6560266,
  "name": "Rubia Garcia Ravides",
  "email": "rubiagarcia17@icloud.com",
  "birthDate": "1995-08-28",
  "phone": "(19) 93005-5370",
  "cpf": "22814386867",
  "admissionDate": "2018-09-01",
  "currentWorkSchedule": {
    "id": 2802229,
    "inactive": false
  },
  "jobRoleDTO": {
    "id": 3045471,
    "description": "Auxiliar de apoio clínico"
  },
  "managers": [
    {
      "id": 2593142,
      "employee": {
        "id": 6560220,
        "name": "Alice Pereira De Jesus"
      }
    }
  ]
}
```

Observações:

- este endpoint funcionou bem com `tangerinoId`
- outras variações como `id`, `employeeId` e `code` não serviram

### `GET /api/punch/daily-activity`

Uso:

- principal fonte para:
  - marcações
  - pendências de batida
  - marcação aprovada/pendente
  - texto bruto do dia
  - cálculo diário de atraso/pausa/saldo

Parâmetros usados com sucesso:

- `employeeId`
- `startDate`
- `endDate`
- `punchList=true`
- `adjustmentList=true`
- `pendingList=true`
- `showFired=true|false`

Exemplo real de payload:

```json
[
  {
    "id": 6560266,
    "name": "Rubia Garcia Ravides",
    "email": "rubiagarcia17@icloud.com",
    "punchs": [
      {
        "date": "06/07/2026",
        "markingsCount": 4,
        "markings": "08:00 - 12:30, 13:30 - 17:00",
        "pendingsCount": 0,
        "totalWorkedHoursInSeconds": 28800.0,
        "totalWorkedHours": "08:00",
        "records": [
          {
            "id": 1690116337,
            "date": "06/07/2026",
            "startDate": "06/07/2026 08:00",
            "startDateLong": 1783335600000,
            "endDate": "06/07/2026 12:30",
            "status": "APPROVED",
            "workedHours": "04:30",
            "workedHoursInSeconds": 16200.0
          }
        ],
        "adjustments": [],
        "holiday": false
      }
    ],
    "pendingPunchs": [],
    "adjustments": []
  }
]
```

Pontos importantes observados:

- consulta com intervalo maior que `1 dia` retorna erro `400`
- o worker precisava quebrar o range por dia
- o payload usa datas em `DD/MM/YYYY`, o que exigiu correção do parser
- sem `employeeId`, o endpoint retornou apenas um subconjunto com atividade, e a paginação não se comportou conforme o Swagger

### `GET /api/punch/workData`

Uso:

- visão diária agregada de jornada por colaborador
- útil como apoio para sincronização operacional mais frequente

Exemplo real:

```json
[
  {
    "employeeId": 6560266,
    "employerId": 6545836,
    "plannedWorkingDay": 28800.0,
    "fulfilledWorkingDay": 0.0,
    "hoursBalance": 0.0
  }
]
```

Observações:

- sem `employeeId`, trouxe `59` colaboradores no dia
- é promissor para sync quente do dia atual
- sozinho não substitui o `daily-activity`, porque não traz marcações e pendências detalhadas

### `GET /api/punch/hoursBalance`

Uso:

- saldo de banco de horas

Exemplo real:

```json
[
  {
    "employeeId": 6560259,
    "hoursBalanceInMinutes": -6278,
    "name": "Sara Nascimento Teodorio",
    "email": "saranascimentoteodorio@gmail.com"
  }
]
```

Observações:

- funcionou com `employeeId`, `startDate`, `endDate`
- no teste de 1 dia, `58` colaboradores retornaram snapshot

### `GET /api/employer/v2/adjustments/employees/{employeeId}`

Uso:

- ajustes e ocorrências aprovadas
- férias, ajustes de batida e ausências justificadas

Comportamento observado:

- no recorte testado, retornou `null` para os exemplos usados
- por isso a sync validada não persistiu ocorrências nem férias reais ainda

### `GET /api/employer/digital-signature/get-last-pending`

Uso:

- consulta de pendência de assinatura mensal

Comportamento observado:

- não gerou registros no teste
- o empregador respondeu com `gedSignature: false` em `/employer/params`

### Tentativas de espelho oficial

Tentativas:

- `GET /api/time-sheet`
- `GET /api/time-sheet/report`
- variantes em `/report`

Resultado observado:

- `404`

Conclusão:

- o artefato de espelho não pode ser considerado disponível com o token atual

## Estratégia recomendada para recorrência quase real-time

### Para produção

- manter uma sync quente do dia atual:
  - a cada `5` ou `10` minutos
  - foco em pendências, marcações, atrasos e saldo do dia
- manter uma sync curta de reconciliação:
  - hoje + ontem
  - para corrigir ajustes tardios
- manter uma reconciliação maior:
  - últimos `30` dias
  - em janela noturna ou sob ação manual

### Melhor combinação de endpoints

- `employee/find-all`
  - roster ativo
- `workData`
  - cobertura diária agregada do dia
- `daily-activity`
  - detalhe fino de marcação, pendência e pausas
- `hoursBalance`
  - snapshots mensais de banco
- `adjustments`
  - férias e ajustes aprovados

## Arquivos alterados nesta rodada

- `apps/painel/src/app/(admin)/ponto/page.tsx`
- `apps/painel/src/app/api/admin/ponto/daily/route.ts`
- `apps/painel/src/app/api/admin/ponto/hours-balance/route.ts`
- `apps/painel/src/app/api/admin/ponto/imports/[fileId]/download/route.ts`
- `apps/painel/src/app/api/admin/ponto/options/route.ts`
- `apps/painel/src/app/api/admin/ponto/overview/route.ts`
- `apps/painel/src/app/api/admin/ponto/signatures/route.ts`
- `apps/painel/src/app/api/admin/ponto/vacations/route.ts`
- `apps/painel/src/app/api/admin/ponto/sync/route.ts`
- `apps/painel/src/lib/point/types.ts`
- `apps/painel/src/lib/point/filters.ts`
- `apps/painel/src/lib/point/repository.ts`
- `workers/main.py`
- `workers/worker_payroll_point_sync.py`
- `workers/worker_point_sync.py`

## Próximo passo sugerido

- evoluir o worker `point_sync` para uma estratégia híbrida:
  - sync quente do dia atual
  - reconciliação curta
  - reconciliação longa
- investigar mais a fundo o comportamento real de paginação do `daily-activity`
- verificar se existe endpoint alternativo de resumo diário no `docs.tangerino.com.br` com cobertura melhor que a observada no Swagger público
