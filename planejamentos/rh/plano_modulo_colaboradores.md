# Plano de Implementacao - Modulo de Colaboradores

## Resumo
Criar o modulo `/colaboradores` para o Departamento Pessoal, com o mesmo padrao visual e operacional de `/profissionais`.

Escopo do V1:
- pagina principal com tabela, filtros e paginacao
- cadastro/edicao em modal grande com abas
- CRUD de colaboradores
- gestao de documentos com upload em massa
- controle de uniforme e armario
- controle de recessos
- status e alertas do ASO

## Decisoes fechadas
- rota do modulo: `/colaboradores`
- grupo na sidebar: `PESSOAL`
- sem exclusao fisica no V1; desligamento via status e dados de demissao
- `Supervisor`, `Cargo/Função`, `Setor` e `Centro de Custo` ficam texto livre no V1
- `Conta Bancaria` sera modelada como dados estruturados no cadastro
- `ASO` tera arquivo + data de emissao + data de vencimento

## Estrutura funcional

### Pagina principal
- tabela de colaboradores
- filtros por:
  - busca por nome/CPF/e-mail
  - status
  - regime contratual
  - unidade
  - status do ASO
  - pendencia documental
- acoes:
  - recarregar lista
  - novo colaborador
  - editar cadastro

### Colunas da tabela
- colaborador
- regime contratual
- cargo/função
- setor
- unidades
- data de admissao
- status
- status do ASO
- progresso/pedencia documental
- acoes

## Modal de cadastro/edicao

### Aba 01 - Cadastro
Grupos:
- Identificacao
- Contato
- Endereco
- Vinculo contratual
- Estagio
- Lotacao e gestao
- Familia e dependentes
- Bancario
- Demissao

Campos:
- regime contratual
- nome completo
- RG
- CPF
- e-mail
- telefone
- data de nascimento
- logradouro
- numero
- complemento
- bairro
- cidade
- UF
- CEP
- instituicao de ensino
- nivel
- curso
- semestre atual
- jornada de trabalho
- salario/bolsa
- duracao do contrato
- data de admissao
- data de fim
- unidade (multiselect)
- cargo/função
- setor
- supervisor
- centro de custo
- estado civil
- possui filhos
- quantidade de filhos
- banco
- agencia
- conta
- chave PIX
- data de demissao
- motivo da demissao
- observacoes

### Aba 02 - Beneficios
- adicional de insalubridade
- vale transporte por dia
- vale refeicao por dia
- seguro de vida

### Aba 03 - Uniforme & Armario
- data de retirada
- descricao do item
- quantidade
- assinou documento
- tipo de entrega
- responsavel pela entrega
- status

### Aba 04 - Recesso
- periodo aquisitivo inicial
- periodo aquisitivo final
- dias devidos
- dias quitados
- saldo calculado
- situacao calculada
- data limite para sair
- data de inicio das ferias
- duracao em dias
- data final calculada
- venda de 10 dias
- 13o nas ferias

### Aba 05 - Documentos
Tipos documentais do V1:
1. Curriculo
2. Foto 3x4
3. CTPS
4. Cartao PIS / Cartao cidadao
5. RG e CPF
6. CNH
7. Certidao de nascimento
8. Carteira de vacinacao
9. Titulo de eleitor
10. Ultimo protocolo de votacao
11. Reservista / Alistamento militar
12. Comprovante de endereco
13. Comprovante de escolaridade / cursos extracurriculares
14. Certificados de cursos e treinamentos
15. Antecedentes criminais
16. Comprovante de vacinacao Covid-19 e gripe
17. ASO
18. Certidao de casamento / declaracao de uniao
19. RG e CPF do conjuge
20. Certidao de nascimento dos filhos
21. Carteira de vacinacao dos filhos menores de 14 anos
22. CPF dos filhos
23. Comprovante de matricula (estagio)
24. Relatorio semestral (estagio)

Fluxo de upload:
- selecao multipla de arquivos
- classificacao do tipo de cada arquivo antes do save
- envio final em lote

## Status e alertas

### ASO
- `PENDENTE`: sem ASO ativo
- `OK`: vencimento acima de 30 dias
- `VENCENDO`: vencimento entre hoje e 30 dias
- `VENCIDO`: vencimento passado

### Pendencia documental
Calculo baseado em:
- documentos obrigatorios esperados conforme perfil
- documentos presentes
- documentos faltantes

## Modelo de dados

### Tabela `employees`
Campos principais:
- identificacao, contato, endereco
- dados de vinculo, estagio e lotacao
- beneficios
- familia
- bancario
- demissao
- auditoria

### Tabela `employee_documents`
- metadados do arquivo
- tipo documental
- issue_date
- expires_at
- ativo/inativo

### Tabela `employee_uniform_items`
- movimentacoes de uniforme

### Tabela `employee_recess_periods`
- periodos aquisitivos e ferias

### Tabela `employee_audit_log`
- trilha de auditoria

## APIs previstas
- `GET /api/admin/colaboradores`
- `POST /api/admin/colaboradores`
- `GET /api/admin/colaboradores/[id]`
- `PUT /api/admin/colaboradores/[id]`
- `GET /api/admin/colaboradores/options`
- `GET /api/admin/colaboradores/[id]/documentos`
- `POST /api/admin/colaboradores/[id]/documentos`
- `GET /api/admin/colaboradores/documentos/[documentId]/download`
- `GET /api/admin/colaboradores/[id]/uniformes`
- `POST /api/admin/colaboradores/[id]/uniformes`
- `PUT /api/admin/colaboradores/[id]/uniformes/[entryId]`
- `DELETE /api/admin/colaboradores/[id]/uniformes/[entryId]`
- `GET /api/admin/colaboradores/[id]/recessos`
- `POST /api/admin/colaboradores/[id]/recessos`
- `PUT /api/admin/colaboradores/[id]/recessos/[entryId]`
- `DELETE /api/admin/colaboradores/[id]/recessos/[entryId]`

## Permissoes
- novo `pageKey`: `colaboradores`
- `view`: acesso ao modulo
- `edit`: cadastrar e editar colaborador, documentos, uniforme e recesso
- `refresh`: mantido por consistencia do modelo

## Sidebar
- novo grupo `PESSOAL`
- item `Colaboradores`

## Testes de aceite
- pagina carrega com filtros, tabela e paginacao
- cadastro CLT, PJ e Estagio salva corretamente
- status desligado exige data e motivo
- unidades multiselect persistem corretamente
- beneficios salvam e reabrem
- uniforme cria, edita e remove
- recesso calcula saldo, data final e situacao
- upload unico e em massa funciona
- download de documentos funciona
- regras condicionais respeitam estagio, conjuge e filhos
- ASO mostra status correto na tabela e no modal
- colaborador desligado continua auditavel
