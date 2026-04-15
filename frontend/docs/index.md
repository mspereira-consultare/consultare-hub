# Documentação do Hub Consultare

Este diretório centraliza a documentação funcional e técnica do projeto.

## Índice

1. [`docs/01-visao-funcional-e-indicadores.md`](docs/01-visao-funcional-e-indicadores.md)  
   Descreve páginas do painel, filtros, fontes e fórmulas dos indicadores.

2. [`docs/02-matriz-de-permissoes.md`](docs/02-matriz-de-permissoes.md)  
   Modelo de acesso por página (`view`, `edit`, `refresh`) e regras por perfil.

3. [`docs/03-arquitetura-tecnica.md`](docs/03-arquitetura-tecnica.md)  
   Arquitetura da aplicação: frontend, APIs, autenticação, workers, orquestrador e banco.

4. [`docs/04-dicionario-de-dados.md`](docs/04-dicionario-de-dados.md)  
   Dicionário das tabelas, chaves e responsáveis pela atualização.

5. [`docs/05-runbook-operacional.md`](docs/05-runbook-operacional.md)  
   Procedimentos operacionais: deploy, variáveis de ambiente, validação pós-deploy e troubleshooting.

6. [`docs/06-plano-tecnico-qualidade-treinamentos.md`](docs/06-plano-tecnico-qualidade-treinamentos.md)  
   Plano técnico e execução do módulo de Qualidade e Treinamentos.

7. [`docs/07-plano-tecnico-repasses.md`](docs/07-plano-tecnico-repasses.md)  
   Plano técnico e evolução do módulo de Repasses.

8. [`docs/08-agenda-ocupacao.md`](docs/08-agenda-ocupacao.md)  
   Documentação funcional e técnica do módulo de Ocupação de Agenda.

9. [`docs/09-plano-tecnico-marketing-funil.md`](docs/09-plano-tecnico-marketing-funil.md)  
   Plano técnico detalhado do módulo `/marketing/funil`, incluindo Google Ads, GA4, Clinia Ads, agenda e faturamento.

10. [`docs/10-plano-tecnico-colaboradores.md`](docs/10-plano-tecnico-colaboradores.md)  
    Plano técnico e implementação do módulo `/colaboradores` para o Departamento Pessoal.

11. [`docs/11-plano-tecnico-equipamentos.md`](docs/11-plano-tecnico-equipamentos.md)  
    Plano técnico e implementação do módulo `/equipamentos`, incluindo cadastro, calibração, manutenção e anexos.

12. [`docs/12-plano-tecnico-marketing-controle.md`](docs/12-plano-tecnico-marketing-controle.md)  
    Plano técnico e implementação do módulo `/marketing/controle`, com cockpit mensal executivo por marca e exportação XLSX.

13. [`docs/13-plano-tecnico-vigilancia-sanitaria.md`](docs/13-plano-tecnico-vigilancia-sanitaria.md)  
    Plano técnico e implementação do módulo `/qualidade/vigilancia-sanitaria`, com licenças, documentos regulatórios, anexos e vencimentos.

14. [`docs/14-plano-tecnico-folha-pagamento.md`](docs/14-plano-tecnico-folha-pagamento.md)  
    Plano técnico e implementação do módulo `/folha-pagamento`, com fechamento mensal recorrente, importação de ponto, prévia da planilha operacional e exportação XLSX.

15. [`docs/database/README.md`](docs/database/README.md)  
    Base dedicada de documentação do MySQL vivo do painel, com inventário do schema real, relacionamentos lógicos e dicionário completo de tabelas/colunas.

## Convenções

- Datas: padrão `YYYY-MM-DD` no banco e nos filtros internos.
- Timezone operacional: `America/Sao_Paulo`.
- Heartbeat de workers: tabela `system_status`.
- A persistência principal atual do painel é MySQL.
- A documentação canônica do banco MySQL agora está consolidada em `docs/database/`.

## Atualizações recentes

- Módulo `/propostas` separado entre base operacional e visão gerencial, com follow-up persistente e exportação enriquecida.
- Módulos de Qualidade consolidados com cadastros, anexos, alertas e documentação técnica própria.
- Módulo `/folha-pagamento` adicionado como fluxo mensal recorrente do RH, integrado ao cadastro de colaboradores e à geração da planilha operacional padrão em XLSX.
