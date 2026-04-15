# Base de Documentacao do MySQL

Esta pasta consolida a documentacao do banco MySQL efetivamente em uso pelo painel da Consultare.

## Escopo

- Schema extraido diretamente do banco MySQL em `railway`.
- Versao do servidor reportada em `information_schema`: `9.4.0`.
- Extracao/geracao desta base: `2026-04-15 00:15:25 UTC`.
- Total de tabelas encontradas: `116`.
- Total de relacionamentos fisicos (FK) encontrados: `0`.

## Arquivos desta base

1. `database/README.md`
   Indice desta base dedicada e achados principais do schema.
2. `database/01-visao-geral-do-schema-mysql.md`
   Inventario executivo do schema, dominios, fontes reaproveitadas e riscos estruturais.
3. `database/02-relacionamentos-logicos-mysql.md`
   Mapa consolidado de relacionamentos fisicos e logicos inferidos do schema/codigo.
4. `database/03-dicionario-de-dados-mysql.md`
   Dicionario completo de tabelas e colunas do MySQL vivo.
5. `database/mysql-schema-live.json`
   Extracao estruturada do `information_schema` usada como base para estes documentos.
6. `database/04-guia-de-integracao-mysql.md`
   Guia pratico para leitura, escrita, APIs e webhooks sobre o banco.
7. `database/05-matriz-de-escrita-e-consumo.md`
   Matriz de ownership, leitura permitida e escrita permitida por familia de tabelas.
8. `database/06-contratos-operacionais-por-dominio.md`
   Contratos operacionais por dominio para integracoes, APIs e webhooks.
9. `database/07-mapa-api-rotas-tabelas.md`
   Mapa consolidado das rotas atuais do projeto para tabelas lidas e escritas no MySQL.

## Fontes reaproveitadas/migradas

- `frontend/docs/03-arquitetura-tecnica.md`
- `frontend/docs/04-dicionario-de-dados.md`
- `frontend/docs/07-plano-tecnico-repasses.md`
- `frontend/docs/08-agenda-ocupacao.md`
- `frontend/docs/09-plano-tecnico-marketing-funil.md`
- `frontend/docs/10-plano-tecnico-colaboradores.md`
- `frontend/docs/11-plano-tecnico-equipamentos.md`
- `frontend/docs/13-plano-tecnico-vigilancia-sanitaria.md`
- `frontend/docs/14-plano-tecnico-folha-pagamento.md`

## Achados principais

- O schema vivo possui `116` tabelas.
- Nao ha `FOREIGN KEY` fisica declarada no banco em `information_schema`; os vinculos atuais sao majoritariamente logicos e mantidos pela aplicacao.
- Tabelas sem chave primaria detectada: `custo_analitico, faturamento_analitico, integrations_config, system_status_backup`.
- Tabelas sem indice detectado: `custo_analitico, system_status_backup`.

## Distribuicao por dominio

| Dominio | Descricao | Qtd. de tabelas |
| --- | --- | --- |
| admin | Administracao, seguranca e governanca | 8 |
| ops | Operacao online, filas e checklists | 14 |
| biz | Comercial, agenda, faturamento, custos e repasses | 29 |
| mkt | Marketing, CRM, funil e analytics | 24 |
| people | Pessoas, profissionais, RH e contratos | 24 |
| quality | Qualidade, documentos regulatorios e equipamentos | 17 |
| other | Outros / legado | 0 |

