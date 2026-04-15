# Documentação do Hub Consultare

Este diretório centraliza a documentação funcional e técnica do projeto.

## Índice

1. [`01-visao-funcional-e-indicadores.md`](01-visao-funcional-e-indicadores.md)  
   Descreve páginas do painel, filtros, fontes e fórmulas dos indicadores.

2. [`02-matriz-de-permissoes.md`](02-matriz-de-permissoes.md)  
   Modelo de acesso por página (`view`, `edit`, `refresh`) e regras por perfil.

3. [`03-arquitetura-tecnica.md`](03-arquitetura-tecnica.md)  
   Arquitetura da aplicação: frontend, APIs, autenticação, workers, orquestrador e banco.

4. [`04-dicionario-de-dados.md`](04-dicionario-de-dados.md)  
   Dicionário das tabelas, chaves e responsáveis pela atualização.

5. [`05-runbook-operacional.md`](05-runbook-operacional.md)  
   Procedimentos operacionais: deploy, variáveis de ambiente, validação pós-deploy e troubleshooting.

6. [`06-plano-tecnico-qualidade-treinamentos.md`](06-plano-tecnico-qualidade-treinamentos.md)  
   Plano técnico e execução do módulo de Qualidade e Treinamentos.

7. [`07-plano-tecnico-repasses.md`](07-plano-tecnico-repasses.md)  
   Plano técnico e evolução do módulo de Repasses.

8. [`08-agenda-ocupacao.md`](08-agenda-ocupacao.md)  
   Documentação funcional e técnica do módulo de Ocupação de Agenda.

9. [`09-plano-tecnico-marketing-funil.md`](09-plano-tecnico-marketing-funil.md)  
   Plano técnico detalhado do módulo `/marketing/funil`, incluindo Google Ads, GA4, Clinia Ads, agenda e faturamento.

10. [`10-plano-tecnico-colaboradores.md`](10-plano-tecnico-colaboradores.md)  
    Plano técnico e implementação do módulo `/colaboradores` para o Departamento Pessoal.

11. [`11-plano-tecnico-equipamentos.md`](11-plano-tecnico-equipamentos.md)  
    Plano técnico e implementação do módulo `/equipamentos`, incluindo cadastro, calibração, manutenção e anexos.

12. [`12-plano-tecnico-marketing-controle.md`](12-plano-tecnico-marketing-controle.md)  
    Plano técnico e implementação do módulo `/marketing/controle`, com cockpit mensal executivo por marca e exportação XLSX.

13. [`13-plano-tecnico-vigilancia-sanitaria.md`](13-plano-tecnico-vigilancia-sanitaria.md)  
    Plano técnico e implementação do módulo `/qualidade/vigilancia-sanitaria`, com licenças, documentos regulatórios, anexos e vencimentos.

14. [`14-plano-tecnico-folha-pagamento.md`](14-plano-tecnico-folha-pagamento.md)  
    Plano técnico e implementação do módulo `/folha-pagamento`, com fechamento mensal recorrente, importação de ponto, prévia da planilha operacional e exportação XLSX.

15. [`database/README.md`](database/README.md)  
    Base dedicada de documentação do MySQL vivo do painel, com inventário do schema real, relacionamentos lógicos e dicionário completo de tabelas/colunas.

## Convenções

- Datas: padrão `YYYY-MM-DD` no banco e nos filtros internos.
- Timezone operacional: `America/Sao_Paulo`.
- Heartbeat de workers: tabela `system_status`.
- A persistência principal atual do painel é MySQL.
- A documentação canônica do banco MySQL agora está consolidada em `database/`.