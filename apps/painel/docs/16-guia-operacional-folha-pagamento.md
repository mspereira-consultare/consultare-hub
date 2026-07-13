# Guia Operacional — `/folha-pagamento`

Este manual explica, de forma simples, como usar a página de fechamento da folha no painel.

Ele foi pensado para quem precisa operar o fechamento mensal no dia a dia, mesmo sem conhecimento técnico.

## 1. O que é esta página

A página `/folha-pagamento` é o local onde o RH revisa e fecha a folha operacional de uma competência.

Nesta tela, o sistema combina dois grupos de dados:

- dados vindos da **Sólides**: ponto do período, banco de horas, férias sincronizadas e assinaturas quando existirem;
- dados vindos do **Painel**: cadastro do colaborador, salário base, benefícios, descontos fixos, ajustes manuais e revisão final da competência.

Em termos simples:

- a **Sólides** informa a base de ponto;
- o **Painel** transforma essa base em fechamento mensal, prévia de planilha e exportação em XLSX.

## 2. O que é uma competência

Competência é o fechamento mensal que agrupa os dados daquele período.

Exemplo:

- competência `julho de 2026`
- período operacional `21/06/2026 a 20/07/2026`

Cada competência tem um status próprio, como:

- `Aberta`
- `Em revisão`
- `Aprovada`
- `Enviada`

## 3. Quem entra na folha

Nesta fase do projeto, entram na folha apenas colaboradores que atendem às duas regras abaixo:

- estão com status **ATIVO** no painel;
- não são do regime **PJ**.

Isso significa que:

- colaboradores `PJ` ficam fora da folha por padrão;
- colaboradores `DESLIGADO` e `PRÉ-ADMISSÃO` não entram no fechamento;
- mesmo que exista ponto na Sólides, a regra final de elegibilidade da folha é definida pelo cadastro do **Painel**.

## 4. Antes de começar

Antes de gerar a folha, vale conferir estes pontos:

1. A competência correta está selecionada.
2. O cadastro dos colaboradores elegíveis está atualizado no painel.
3. A sincronização da Sólides foi executada para trazer os dados mais recentes.
4. Os avisos de prontidão da competência foram revisados.

Se a sincronização ainda estiver rodando, aguarde a conclusão antes de gerar, recalcular, aprovar ou excluir a competência.

## 5. Visão geral da tela

A página é dividida em blocos principais.

### 5.1 Cabeçalho

No topo ficam:

- título da página;
- botão `Fontes e regras`;
- botão `Atualizar dados`;
- botão `Exportar XLSX`;
- botão `Nova competência`.

### 5.2 Filtros da competência

Neste bloco você escolhe:

- a competência;
- colaborador;
- centro de custo;
- unidade;
- regime contratual;
- status da linha.

Os filtros servem para facilitar a revisão. Eles não mudam a competência em si, apenas o que aparece na tela.

### 5.3 Prontidão da competência

Este bloco resume se a competência está pronta para seguir.

Ele mostra:

- status geral da competência;
- resumo separado para `Gerar` e `Aprovar`;
- lista de pendências quando você abre `Ver pendências`.

Os estados principais são:

- `Pronta`: pode seguir;
- `Atenção`: pode exigir revisão;
- `Bloqueada`: existe algo que impede avançar.

### 5.4 Indicadores-resumo

Os cards abaixo da prontidão mostram números rápidos, como:

- elegíveis para a folha;
- proventos;
- descontos;
- líquido operacional.

Eles ajudam a validar se o fechamento faz sentido antes da exportação final.

### 5.5 Abas da página

As abas principais são:

- `Fechamento`
- `Benefícios`
- `Prévia da planilha`

## 6. O que cada aba faz

### 6.1 Aba `Fechamento`

É a aba principal da revisão.

Ela mostra uma linha por colaborador com informações como:

- salário base;
- insalubridade;
- dias;
- faltas;
- atrasos;
- VT;
- D.V.T.;
- Totalpass;
- outros descontos;
- proventos;
- descontos;
- líquido;
- status da linha.

Também é nesta aba que aparecem:

- as caixas de seleção das linhas;
- o botão `Aprovar selecionados`;
- o botão `Recalcular selecionados`.

### 6.2 Aba `Benefícios`

Mostra a memória mensal de benefícios da competência.

Aqui você acompanha, por exemplo:

- VR a comprar;
- VT pago em folha;
- descontos em folha;
- pendências e alertas ligados a benefícios.

Use essa aba para validar o impacto operacional dos benefícios antes de aprovar a competência.

### 6.3 Aba `Prévia da planilha`

Mostra a mesma estrutura da planilha que será exportada em XLSX.

É a aba ideal para conferir o formato final que será entregue ao RH, financeiro ou gerência.

## 7. Explicação de todos os botões da página

### 7.1 Botões do cabeçalho

#### `Fontes e regras`

Abre um modal com ajuda contextual.

Use este botão quando quiser entender:

- o que vem da Sólides;
- o que continua vindo do painel;
- como interpretar os badges de origem;
- quando a competência fica apta para geração e aprovação.

#### `Atualizar dados`

Aciona a sincronização da **Sólides** para a competência selecionada.

Em termos práticos, este botão:

- busca a base de ponto mais recente;
- atualiza a leitura local usada no fechamento;
- mantém os dados atuais visíveis enquanto a sincronização roda em segundo plano.

Ao passar o mouse sobre o botão, o painel mostra o heartbeat da última sincronização, com status e detalhes da execução.

#### `Exportar XLSX`

Baixa a planilha operacional da competência no formato Excel.

Use este botão quando a revisão já estiver concluída e você quiser gerar o arquivo final da competência.

#### `Nova competência`

Cria uma nova competência para fechamento.

Normalmente é usada no início do ciclo mensal.

### 7.2 Botões do bloco de filtros

#### `Expandir filtros` / `Recolher filtros`

Mostra ou esconde a área de filtros da página.

Serve apenas para organizar a tela. Não altera dados.

#### `Limpar filtros`

Volta os filtros para o padrão da página.

Use quando a tela estiver muito filtrada e você quiser recomeçar a análise.

#### `Aplicar filtros`

Recarrega a visualização com base nos filtros atuais.

Use depois de mudar competência, colaborador, centro de custo, unidade, regime contratual ou status da linha.

### 7.3 Botões das ações da competência

#### `Gerar folha`

Monta ou remonta as linhas da competência com base em:

- dados sincronizados da Sólides;
- cadastro atual do painel;
- regras da competência;
- benefícios e descontos locais.

Use esse botão:

- depois da sincronização;
- depois de corrigir cadastros;
- depois de corrigir ponto;
- quando quiser recalcular a competência inteira.

Se houver apenas pendências cadastrais contornáveis, o sistema pode pedir uma confirmação antes de seguir.

#### `Aprovar competência`

Fecha a revisão mensal da competência.

Esse botão só deve ser usado depois que:

- as linhas elegíveis estiverem revisadas;
- as pendências tiverem sido tratadas;
- os colaboradores que precisam de aprovação individual já tiverem sido aprovados.

Se o botão estiver bloqueado, normalmente significa que ainda existem linhas não aprovadas individualmente ou alguma pendência que impede o fechamento final.

#### `Reabrir competência`

Volta a competência para edição e revisão.

Use quando uma competência que já avançou no fluxo precisa ser ajustada novamente.

Em termos práticos, este botão permite reabrir o fechamento para nova conferência, correção ou regeneração.

#### `Excluir competência`

Remove a competência da folha.

Importante:

- competências `Enviada` não podem ser excluídas;
- não é possível excluir enquanto existir sincronização em andamento;
- a exclusão remove os dados do fechamento daquela competência, mas não apaga a base operacional compartilhada de ponto.

Use essa ação com cuidado.

### 7.4 Botões de ação em massa da aba `Fechamento`

#### `Aprovar selecionados`

Aprova apenas as linhas marcadas na tabela.

Use quando:

- alguns colaboradores já foram revisados;
- você quer avançar por partes;
- ainda não deseja aprovar a competência inteira.

Esse botão atua somente nas linhas selecionadas da aba `Fechamento`.

#### `Recalcular selecionados`

Recalcula apenas as linhas marcadas na tabela.

Ele usa:

- a sync já existente da Sólides;
- o cadastro local atual do painel.

Esse botão é útil quando você corrigiu informações de alguns colaboradores específicos e não quer regenerar a competência inteira.

### 7.5 Ações dentro do detalhe do colaborador

Ao clicar em uma linha da aba `Fechamento`, a página abre o detalhe daquele colaborador.

Dentro desse detalhe, o principal botão é:

#### `Salvar ajustes`

Salva alterações manuais feitas naquela linha, como:

- valor do ajuste;
- observações do ajuste;
- observações da folha;
- status da linha.

## 8. Como funciona o detalhe do colaborador

O detalhe do colaborador é uma memória operacional da linha.

Ele ajuda a responder a pergunta:

**“Por que esse colaborador está com esse valor na folha?”**

### 8.1 Indicadores do topo

No topo do detalhe aparecem:

- `Salário base`
- `Proventos`
- `Líquido operacional`

Em resumo:

- `Salário base`: valor salarial cadastrado no painel;
- `Proventos`: soma do que compõe o lado positivo da linha;
- `Líquido operacional`: resultado final da linha depois de considerar proventos e descontos operacionais.

### 8.2 Campo `Valor do ajuste`

Esse campo é um ajuste manual sobre a linha já calculada.

Ele **não substitui** o valor total do colaborador.

Funciona assim:

- valor **positivo**: acrescenta aos proventos;
- valor **negativo**: aumenta os descontos.

Exemplo simples:

- se a linha precisa receber um complemento manual de `R$ 100,00`, o ajuste pode ser positivo;
- se a linha precisa receber um desconto manual de `R$ 50,00`, o ajuste pode ser negativo.

### 8.3 `Observações do ajuste`

Campo para explicar por que o ajuste manual foi lançado.

Exemplo:

- “Complemento acordado do período”
- “Desconto manual por correção interna”

### 8.4 `Observações da folha`

Campo livre para registrar anotações operacionais sobre aquela linha.

É útil para deixar contexto para outra pessoa do RH ou para auditoria posterior.

### 8.5 `Status da linha`

Representa o estágio de revisão daquela linha.

Os status podem variar conforme a situação da linha, como:

- `Rascunho`
- `Em revisão`
- `Pendência cadastral`
- `Aprovado`

Quando a linha está com pendência cadastral, o próprio sistema pode travar a mudança de status até a regularização.

### 8.6 Blocos informativos do detalhe

Além dos ajustes manuais, o drawer também pode mostrar:

- `Prévia da linha exportada`
- `Banco de horas`
- `Assinatura`
- `Ocorrências da competência`
- `Ponto do período`

Isso ajuda a cruzar, no mesmo lugar, o cálculo local com os dados sincronizados da Sólides.

## 9. O que significam os badges e indicadores

### `Sólides`

Indica que aquela informação veio da integração de ponto.

### `Painel`

Indica que aquela informação veio do cadastro local, do cálculo local ou da revisão operacional do painel.

### `Pronta`

Indica que aquele bloco ou etapa está liberado para seguir.

### `Atenção`

Indica que existe algo que deve ser revisado, mas nem sempre é um bloqueio total.

### `Bloqueada`

Indica que existe algo impedindo avançar naquela etapa.

### Contadores nos cards e nos avisos

Os números exibidos servem para mostrar volume.

Exemplos:

- quantos colaboradores estão elegíveis;
- quantos bloqueios ou alertas existem;
- quantas linhas estão na tabela;
- quantos colaboradores foram afetados por determinado aviso.

## 10. Fluxo operacional completo

Este é o fluxo recomendado para usar a página no dia a dia.

### Etapa 1. Criar ou selecionar a competência

1. Abra a página `/folha-pagamento`.
2. Se a competência já existir, selecione no filtro `Competência`.
3. Se ainda não existir, use `Nova competência`.

### Etapa 2. Atualizar os dados da Sólides

1. Clique em `Atualizar dados`.
2. Aguarde a sincronização finalizar.
3. Se quiser acompanhar a execução, passe o mouse sobre o botão para ver os detalhes da sincronização.

### Etapa 3. Revisar a prontidão

1. Leia o bloco `Prontidão da competência`.
2. Se houver alerta ou bloqueio, abra `Ver pendências`.
3. Entenda quais problemas precisam ser resolvidos antes de seguir.

### Etapa 4. Gerar a folha

1. Clique em `Gerar folha`.
2. Aguarde a montagem das linhas da competência.
3. Se o sistema alertar sobre pendências cadastrais contornáveis, revise a mensagem e confirme apenas se fizer sentido continuar.

### Etapa 5. Revisar os colaboradores

1. Vá para a aba `Fechamento`.
2. Analise as linhas dos colaboradores.
3. Abra o detalhe dos casos que exigirem conferência.
4. Faça ajustes manuais quando necessário.
5. Salve os ajustes.

### Etapa 6. Recalcular casos específicos, se necessário

Se você corrigiu cadastro, benefício ou alguma informação local de poucos colaboradores:

1. marque os colaboradores na tabela;
2. clique em `Recalcular selecionados`.

Se a correção afetar a competência como um todo, use `Gerar folha` novamente.

### Etapa 7. Aprovar colaboradores revisados

Se a operação for feita em etapas:

1. marque as linhas já revisadas;
2. clique em `Aprovar selecionados`.

Isso ajuda a preparar a competência para a aprovação final.

### Etapa 8. Validar benefícios e prévia

1. Abra a aba `Benefícios`.
2. Confirme os valores de VR, VT e descontos.
3. Depois abra `Prévia da planilha`.
4. Revise se a estrutura da planilha final está coerente.

### Etapa 9. Aprovar a competência

Quando tudo estiver revisado:

1. confirme se não existem pendências impeditivas;
2. garanta que os colaboradores elegíveis necessários já foram aprovados;
3. clique em `Aprovar competência`.

### Etapa 10. Exportar o arquivo final

1. Clique em `Exportar XLSX`.
2. Baixe a planilha final da competência.
3. Faça a conferência final do arquivo antes do envio ao RH, financeiro ou gerência.

## 11. Mensagens e bloqueios comuns

### `Competência bloqueada`

Significa que existe uma pendência importante impedindo seguir para a próxima etapa.

O caminho é abrir `Ver pendências` e entender o motivo.

### `Aprovação bloqueada`

Em geral significa que:

- ainda existem linhas não aprovadas;
- ainda existem pendências cadastrais;
- ainda existem alertas ou bloqueios que impedem o fechamento final.

### `Pendência cadastral`

Indica que o sistema conseguiu gerar a linha, mas ainda falta algum dado importante para considerar a linha regularizada.

Essas linhas podem aparecer com campos em branco ou status específico de pendência.

### `Sync em andamento`

Enquanto a sincronização estiver rodando:

- aguarde antes de excluir a competência;
- aguarde antes de recalcular ou aprovar;
- não considere o fechamento como finalizado.

### `Competência enviada não pode ser excluída`

É uma trava de segurança.

Depois que a competência chegou ao estágio `Enviada`, ela não pode mais ser apagada por esse fluxo.

## 12. Checklist final antes de aprovar

Antes de clicar em `Aprovar competência`, revise:

1. A competência selecionada está correta.
2. A sync da Sólides já terminou.
3. Os avisos do bloco de prontidão foram lidos.
4. As linhas que exigiam revisão foram tratadas.
5. Os ajustes manuais necessários foram salvos.
6. Os benefícios foram conferidos.
7. A prévia da planilha está coerente.
8. Os colaboradores elegíveis que precisavam de aprovação já foram aprovados.

## 13. Checklist final antes de exportar o XLSX

Antes de clicar em `Exportar XLSX`, confira:

1. A competência já foi revisada por completo.
2. Não existem pendências impeditivas abertas.
3. Os valores principais dos cards fazem sentido.
4. A aba `Prévia da planilha` bate com o esperado.
5. O arquivo será exportado da competência correta.

## 14. Resumo rápido do fluxo ideal

Se quiser guardar apenas a sequência principal, use esta:

1. Selecionar a competência.
2. Clicar em `Atualizar dados`.
3. Aguardar a sync terminar.
4. Revisar a `Prontidão da competência`.
5. Clicar em `Gerar folha`.
6. Revisar linhas, benefícios e prévia.
7. Aprovar colaboradores quando necessário.
8. Clicar em `Aprovar competência`.
9. Exportar o `XLSX` final.

---

Se este manual ficar desatualizado por alguma mudança na tela, o ideal é revisá-lo junto com a próxima alteração funcional da página.
