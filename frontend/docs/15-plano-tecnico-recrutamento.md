# Plano Técnico — Recrutamento

## Objetivo

O módulo `/recrutamento` organiza o processo seletivo antes da admissão oficial, mantendo o cadastro de colaboradores como fonte da verdade apenas depois da conversão para pré-admissão.

O MVP cobre:

- cadastro de vagas;
- cadastro de candidatos vinculados a vagas;
- funil com etapas fechadas;
- anexos do candidato, como currículo e arquivos de apoio;
- histórico de movimentações;
- conversão de candidato aprovado em rascunho de colaborador.

## Navegação e permissões

- Rota: `/recrutamento`
- Grupo na sidebar: `GESTÃO DE PESSOAS`
- Page key: `recrutamento`
- Permissão server-side: `requireRecrutamentoPermission`

Defaults atuais:

| Perfil | view | edit | refresh |
| --- | ---: | ---: | ---: |
| ADMIN | sim | sim | sim |
| GESTOR | sim | sim | sim |
| OPERADOR | não | não | não |

## Fluxo operacional

1. O RH cria uma vaga com título, setor, unidade, regime, responsável e observações.
2. O RH cadastra candidatos vinculados a uma vaga.
3. O candidato avança pelo funil: `Recebido`, `Triagem`, `Entrevista`, `Banco`, `Aprovado`, `Recusado` e `Contratado`.
4. Currículos e arquivos de apoio são anexados ao candidato.
5. Quando aprovado, o candidato pode ser convertido em `PRE_ADMISSAO` no cadastro oficial de colaboradores.

Após a conversão, `employees` passa a ser a fonte da verdade para documentos admissionais, benefícios, folha, admissão e demais rotinas de DP.

## Modelo de dados

As tabelas do MVP são criadas pelo repositório em runtime quando o módulo é acessado:

| Tabela | Responsabilidade |
| --- | --- |
| `recruitment_jobs` | vagas acompanhadas pelo RH |
| `recruitment_candidates` | candidatos vinculados às vagas |
| `recruitment_candidate_files` | anexos do candidato |
| `recruitment_candidate_history` | histórico de criação, edição, mudança de etapa, upload e conversão |

## APIs

| Endpoint | Método | Uso |
| --- | --- | --- |
| `/api/admin/recrutamento` | `GET` | painel com vagas, candidatos, anexos, histórico e resumo |
| `/api/admin/recrutamento/jobs` | `POST` | criar vaga |
| `/api/admin/recrutamento/jobs/[jobId]` | `PATCH` | atualizar status/dados da vaga |
| `/api/admin/recrutamento/candidates` | `POST` | criar candidato |
| `/api/admin/recrutamento/candidates/[candidateId]` | `PATCH` | editar candidato e movimentar etapa |
| `/api/admin/recrutamento/candidates/[candidateId]/files` | `POST` | anexar arquivo ao candidato |
| `/api/admin/recrutamento/files/[fileId]/download` | `GET` | visualizar ou baixar anexo |
| `/api/admin/recrutamento/candidates/[candidateId]/convert` | `POST` | converter aprovado em pré-admissão |

## Regras de conversão

- A conversão exige CPF informado.
- CPF e e-mail são validados contra `employees` e contra outros candidatos para evitar duplicidade.
- O colaborador criado recebe status `PRE_ADMISSAO`.
- Unidade, cargo, setor, regime, telefone e e-mail são herdados do candidato/vaga quando disponíveis.
- Documentos admissionais não são duplicados nesta tela; eles continuam no módulo `/colaboradores`.

## Interface

- O cabeçalho segue o padrão visual de `/folha-pagamento` e `/colaboradores`.
- A visão principal usa cards de resumo, lista de vagas e funil em colunas.
- O card do candidato é compacto; edição, anexos, histórico e conversão ficam no modal de detalhes.
- O modal `Como funciona` explica o fluxo esperado para o usuário final.

## Critérios de aceite

- Criar vaga.
- Criar candidato vinculado a uma vaga.
- Movimentar candidato no funil com histórico.
- Anexar currículo/arquivo ao candidato.
- Baixar ou visualizar anexo.
- Converter candidato aprovado em pré-admissão sem duplicar CPF/e-mail.
- Exibir o módulo na sidebar apenas para usuários com permissão `recrutamento`.
