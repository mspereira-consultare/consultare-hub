# Matriz Feegow Bridge vs Magic Core

## Objetivo

Classificar cada dominio do legado entre:

- `Feegow Bridge`: precisa consumir Feegow para clientes que usam Feegow;
- `Magic Core`: deve nascer como funcionalidade nativa do Magic IA;
- `Hibrido`: comeca usando Feegow, mas deve migrar para entidade nativa;
- `Conector opcional`: integracao externa que nao substitui core.

## Regras

- Feegow Bridge nao e o produto principal.
- Magic Core e o objetivo final.
- Todo cliente pode contratar modulos sem necessariamente contratar Feegow Bridge.
- Nenhuma decisao de dominio novo deve depender de acesso direto ao banco legado.

## Matriz por dominio

| Dominio | Legado atual | Classificacao | Direcao Magic IA |
| --- | --- | --- | --- |
| Pacientes | `feegow_patients`, contatos por cache | Hibrido | Criar paciente Magic Core; Feegow vira origem externa com mapa de ids. |
| Agenda | `feegow_appointments`, ocupacao via Feegow API | Hibrido | Criar agenda, slots, bloqueios e status nativos; Feegow Bridge sincroniza. |
| Procedimentos | `feegow_procedures_catalog` | Hibrido | Catalogo Magic Core com preco, especialidade e regras; Feegow importa/atualiza quando contratado. |
| Profissionais | `professionals` + sync Feegow | Magic Core com bridge | Cadastro interno vira fonte; Feegow Bridge hidrata e concilia. |
| Propostas | `feegow_proposals` + `proposal_followup_control` | Hibrido | Pipeline comercial nativo; Feegow importa propostas existentes. |
| Pos-consulta | Feegow proposals/appointments + follow-up local | Hibrido | Jornada nativa ligada a atendimento, paciente e proposta. |
| Contratos ResolveSaude | `feegow_contracts` | Hibrido | Contratos/assinaturas do Magic Core; Feegow Bridge importa carteira. |
| Faturamento | scraping e resumos de Feegow | Hibrido | Receita nativa nasce de atendimento, contrato e recebimento; Feegow alimenta snapshots em bridge. |
| Custo | worker Feegow/custo | Hibrido | Custos devem virar dominio financeiro interno ou conector. |
| Repasses | scraping Feegow + jobs locais | Hibrido | Motor nativo de repasse por contrato/procedimento/profissional. |
| Monitor medico | scraping/Feegow web | Hibrido | Fila e atendimento devem ser entidades Magic Core. |
| Recepcao | monitor local/scraping | Hibrido | Check-in e fila devem ser Magic Core. |
| Clinia/WhatsApp | Clinia API/cookie | Conector opcional | Integracao de comunicacao; nao deve ser core obrigatorio. |
| Marketing Google/GA4 | Google Ads + GA4 | Conector opcional | Conector por tenant para analytics de marketing. |
| Clinia Ads | Clinia Ads | Conector opcional | Fonte complementar de lead/contato. |
| Marketing controle | Google/fatos + blocos planejados | Magic Core + conectores | Cockpit do Magic IA alimentado por conectores. |
| Colaboradores | `employees` | Magic Core | Nativo desde o inicio. |
| Portal colaborador | token/cpf/data | Magic Core | Nativo, tenant-aware e com escopo de convite. |
| Folha operacional | `payroll_*` + PDF ponto | Magic Core | Nativo, com imports por tenant. |
| Recrutamento | `recruitment_*` + Indeed/IA | Magic Core + conector | ATS nativo; Indeed e OpenAI opcionais. |
| Equipamentos | `clinic_equipment*` | Magic Core | Nativo. |
| QMS | `qms_*` | Magic Core | Nativo. |
| Vigilancia sanitaria | `health_surveillance_*` | Magic Core | Nativo. |
| Intranet | `intranet_*` | Magic Core | Nativo e contratavel. |
| Tarefas/projetos | core tasks | Magic Core | Modulo horizontal nativo. |
| Dashboard executivo | agregacao local + governanca | Magic Core | Analytics tenant-aware com escopo executivo. |
| Usuarios/permissoes | `users`, perfis, matriz | Foundation | IAM/membership/permission service, nao modulo comum. |
| Settings/integracoes | `integrations_config` | Foundation | `integration_connections` + SecretRef por tenant. |

## Feegow Bridge

### Responsabilidade

Permitir que clientes que usam Feegow aproveitem o Magic IA sem migrar tudo no primeiro dia.

O bridge deve:

- ler dados Feegow por API/scraping autorizado;
- manter estado de sincronizacao por tenant;
- preservar ids externos;
- registrar health e cobertura historica;
- gravar staging e/ou entidades canonicas;
- permitir reconciliacao e backfill.

### Nao responsabilidade

O bridge nao deve:

- ser fonte arquitetural do Magic IA;
- resolver IAM;
- armazenar segredo global;
- misturar dados de tenants;
- forcar todos os modulos a depender de Feegow;
- escrever no Feegow sem contrato explicito de produto.

## Magic Core

### Entidades principais esperadas

Para substituir Feegow, o Magic Core precisa de entidades nativas para:

- paciente;
- responsavel/contato;
- unidade;
- profissional;
- especialidade;
- procedimento;
- agenda;
- slot;
- bloqueio;
- agendamento;
- atendimento;
- proposta;
- contrato;
- recebimento/faturamento;
- repasse;
- documento;
- tarefa;
- colaborador;
- campanha/lead.

### Dependencias internas

O Magic Core deve emitir eventos para:

- analytics;
- auditoria;
- notificacoes;
- tarefas;
- financeiro;
- marketing;
- intranet, quando houver publicacao de conteudo.

## Estrategia por tipo de cliente

### Cliente com Feegow

Pacote inicial recomendado:

- Platform Admin;
- Feegow Bridge;
- BI e Gestao;
- Comercial e Atendimento;
- Financeiro;
- Marketing, se houver conectores;
- Intranet/Tarefas/RH conforme contratacao.

Funcionamento:

- Feegow continua como origem de agenda, pacientes, procedimentos e faturamento;
- Magic IA controla follow-up, tarefas, dashboards, intranet, permissoes e workflows;
- migracao para Magic Core acontece por ondas.

### Cliente sem Feegow

Pacote inicial recomendado:

- Platform Admin;
- Magic Core operacional;
- cadastro de unidades, profissionais, pacientes e procedimentos;
- agenda nativa;
- atendimento/comercial;
- financeiro basico;
- modulos adicionais conforme contrato.

Funcionamento:

- Magic IA e fonte da verdade desde o inicio;
- conectores externos entram apenas como complementos.

## Sequencia sugerida de internalizacao

1. Usuarios, tenants, unidades, permissoes e entitlements.
2. Cadastros mestres: unidades, profissionais, especialidades, procedimentos, pacientes.
3. Agenda: slots, bloqueios, agendamentos e status.
4. Comercial: propostas, follow-up, pos-consulta e conversao.
5. Financeiro: faturamento, contratos, recebimentos e resumos.
6. Repasses: regras, calculo, fechamento e comunicacao.
7. Analytics executivo.
8. Automacoes e IA sobre dados nativos.

## Riscos

- tratar Feegow Bridge como core permanente;
- importar ids externos como ids internos;
- construir permissoes apenas por pagina;
- esquecer data scope por unidade/profissional;
- misturar staging com entidades canonicas;
- acoplar workers a variaveis de ambiente globais;
- permitir que analytics consulte OLTP de alto volume sem camada servidora.

