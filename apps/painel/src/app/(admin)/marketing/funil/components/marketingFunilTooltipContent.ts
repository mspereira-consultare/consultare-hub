import type { MarketingFunilSummary } from './types';
import type { MarketingFunilTooltipSection } from './MarketingFunilInfoTooltip';
import { formatCompactCurrency, formatCurrency, formatNumber, formatPercent } from './formatters';

const scopeLabel = (summary: MarketingFunilSummary | null) =>
  summary?.performanceFunnel.scopeLabel || 'Origem Google no Clinia Ads';

export const buildOverviewTooltipSections = (summary: MarketingFunilSummary | null) => {
  const performance = summary?.performanceFunnel;
  const diagnostics = summary?.diagnostics;
  const operational = summary?.operationalContext;

  return {
    investimento: [
      {
        title: 'O que é',
        content: 'Total investido no Google Ads no período selecionado.',
      },
      {
        title: 'Como calculamos',
        content: `Somamos o campo de investimento diário das campanhas do Google Ads. No filtro atual, o valor consolidado é ${formatCurrency(
          performance?.googleSpend || 0
        )}.`,
      },
      {
        title: 'Fonte dos dados',
        content: 'Google Ads, consolidado em fact_marketing_funnel_daily pelo worker de marketing.',
      },
      {
        title: 'Escopo do filtro',
        content: 'Respeita período, marca e os filtros aplicados de campanha, origem, mídia e grupo de canal.',
      },
      {
        title: 'Limitação importante',
        content: 'Esse card mostra apenas o investimento do Google Ads. Não inclui outras origens do Clinia Ads.',
      },
    ] satisfies MarketingFunilTooltipSection[],
    novosContatosCliniaGoogle: [
      {
        title: 'O que é',
        content: 'Lead operacional principal do módulo: novos contatos do Clinia Ads atribuídos à origem Google.',
      },
      {
        title: 'Como calculamos',
        content: `Contamos DISTINCT jid nos registros INTERESTED do Clinia Ads. No filtro atual, são ${formatNumber(
          performance?.googleNewContacts || 0
        )} novos contatos.`,
      },
      {
        title: 'Fonte dos dados',
        content: 'raw_clinia_ads_contacts e fact_clinia_ads_daily, sincronizados pelo worker clinia_ads.',
      },
      {
        title: 'Escopo do filtro',
        content: `Escopo vigente: ${scopeLabel(summary)}.`,
      },
      {
        title: 'Limitação importante',
        content: `Quando há registros Google não mapeados ao naming das campanhas, eles ficam separados para auditoria. No filtro atual, o bloco técnico soma ${formatNumber(
          diagnostics?.googleUnmappedNewContacts || 0
        )} novos contatos não mapeados.`,
      },
    ] satisfies MarketingFunilTooltipSection[],
    contatosCliniaGoogle: [
      {
        title: 'O que é',
        content: 'Total de contatos recebidos no Clinia Ads com origem Google, incluindo repetições do mesmo jid.',
      },
      {
        title: 'Como calculamos',
        content: `Somamos os registros com stage INTERESTED. No filtro atual, são ${formatNumber(
          performance?.googleContactsReceived || 0
        )} contatos.`,
      },
      {
        title: 'Fonte dos dados',
        content: 'raw_clinia_ads_contacts, filtrado por origin = google.',
      },
      {
        title: 'Escopo do filtro',
        content: `Escopo vigente: ${scopeLabel(summary)}.`,
      },
      {
        title: 'Limitação importante',
        content: 'Esse número pode ser maior que “Novos contatos” porque um mesmo contato pode aparecer mais de uma vez.',
      },
    ] satisfies MarketingFunilTooltipSection[],
    agendamentosCliniaGoogle: [
      {
        title: 'O que é',
        content: 'Contatos do Clinia Ads que chegaram ao estágio APPOINTMENT com origem Google.',
      },
      {
        title: 'Como calculamos',
        content: `Somamos os registros com stage APPOINTMENT. No filtro atual, são ${formatNumber(
          performance?.googleAppointmentsConverted || 0
        )} agendamentos Clinia.`,
      },
      {
        title: 'Fonte dos dados',
        content: 'raw_clinia_ads_contacts e fact_clinia_ads_daily.',
      },
      {
        title: 'Escopo do filtro',
        content: `Escopo vigente: ${scopeLabel(summary)}.`,
      },
      {
        title: 'Limitação importante',
        content: `Os registros Google ainda não mapeados continuam fora da tabela principal de campanhas. No filtro atual, existem ${formatNumber(
          diagnostics?.googleUnmappedAppointments || 0
        )} agendamentos não mapeados.`,
      },
    ] satisfies MarketingFunilTooltipSection[],
    taxaConversao: [
      {
        title: 'O que é',
        content: 'Taxa de avanço de novos contatos Clinia (Google) para agendamentos Clinia.',
      },
      {
        title: 'Como calculamos',
        content: `Aplicamos a fórmula Agendamentos Clinia ÷ Novos contatos Clinia. No filtro atual, a taxa é ${formatPercent(
          performance?.contactToAppointmentRate || 0
        )}.`,
      },
      {
        title: 'Fonte dos dados',
        content: 'Camada analítica do Clinia Ads, combinando estágios INTERESTED e APPOINTMENT.',
      },
      {
        title: 'Escopo do filtro',
        content: `Usa o mesmo recorte de ${scopeLabel(summary).toLowerCase()}.`,
      },
      {
        title: 'Limitação importante',
        content: 'É uma taxa operacional do Clinia Ads. Não representa ainda agendamento validado no Feegow.',
      },
    ] satisfies MarketingFunilTooltipSection[],
    custoPorNovoContato: [
      {
        title: 'O que é',
        content: 'Quanto o Google Ads custou, em média, para gerar um novo contato Clinia com origem Google.',
      },
      {
        title: 'Como calculamos',
        content: `Investimento Google Ads ÷ Novos contatos Clinia (Google). No filtro atual, o custo é ${formatCurrency(
          performance?.costPerNewContact || 0
        )}.`,
      },
      {
        title: 'Fonte dos dados',
        content: 'Cruza spend do Google Ads com novos contatos do Clinia Ads.',
      },
      {
        title: 'Escopo do filtro',
        content: 'Usa o período e a marca selecionados. Quando há filtros de campanha, considera apenas campanhas mapeadas.',
      },
      {
        title: 'Limitação importante',
        content: 'Se não houver novos contatos no recorte, o indicador fica zerado para evitar divisão por zero.',
      },
    ] satisfies MarketingFunilTooltipSection[],
    custoPorAgendamento: [
      {
        title: 'O que é',
        content: 'Quanto o Google Ads custou, em média, para gerar um agendamento Clinia com origem Google.',
      },
      {
        title: 'Como calculamos',
        content: `Investimento Google Ads ÷ Agendamentos Clinia (Google). No filtro atual, o custo é ${formatCurrency(
          performance?.costPerAppointment || 0
        )}.`,
      },
      {
        title: 'Fonte dos dados',
        content: 'Cruza spend do Google Ads com registros APPOINTMENT do Clinia Ads.',
      },
      {
        title: 'Escopo do filtro',
        content: 'Usa o período e a marca selecionados. Quando há filtros de campanha, considera apenas campanhas mapeadas.',
      },
      {
        title: 'Limitação importante',
        content: 'Ainda não é o custo por consulta realizada. É custo por agendamento convertido no Clinia.',
      },
    ] satisfies MarketingFunilTooltipSection[],
    cliquesWhatsapp: [
      {
        title: 'O que é',
        content: 'Indicador auxiliar de intenção no site: cliques em CTAs que levam ao WhatsApp da clínica.',
      },
      {
        title: 'Como calculamos',
        content: `Somamos os eventos configurados no GA4 para URLs do WhatsApp. No filtro atual, são ${formatNumber(
          diagnostics?.whatsappClicks || 0
        )} cliques, com custo médio de ${formatCurrency(diagnostics?.whatsappCostPerClick || 0)} por clique.`,
      },
      {
        title: 'Fonte dos dados',
        content: 'GA4 consolidado pelo worker de marketing, usando a regra vigente de cliques para WhatsApp.',
      },
      {
        title: 'Escopo do filtro',
        content: 'Respeita período, marca e os filtros aplicados na camada Google.',
      },
      {
        title: 'Limitação importante',
        content: 'Esse número não é mais o lead principal do funil. Ele mede intenção no site e não contato confirmado no Clinia.',
      },
    ] satisfies MarketingFunilTooltipSection[],
    agendamentosValidos: [
      {
        title: 'O que é',
        content: 'Contexto operacional da clínica: total de agendamentos válidos no período.',
      },
      {
        title: 'Como calculamos',
        content: `Contamos os registros de feegow_appointments com status 1, 2, 3, 4 e 7 usando scheduled_at. No filtro atual, são ${formatNumber(
          operational?.appointmentsValid || 0
        )} agendamentos válidos, dos quais ${formatNumber(
          operational?.appointmentsConfirmedOrRealized || 0
        )} estão confirmados ou realizados.`,
      },
      {
        title: 'Fonte dos dados',
        content: 'feegow_appointments.',
      },
      {
        title: 'Escopo do filtro',
        content: 'Respeita período e marca. Não é atribuído por campanha.',
      },
      {
        title: 'Limitação importante',
        content: 'Esse card mostra o total operacional da clínica, não apenas agendamentos oriundos do Google Ads.',
      },
    ] satisfies MarketingFunilTooltipSection[],
    faturamento: [
      {
        title: 'O que é',
        content: 'Contexto operacional e financeiro da clínica no período.',
      },
      {
        title: 'Como calculamos',
        content: `Somamos total_pago da base de Faturamento Bruto Analítico. No filtro atual, o total é ${formatCompactCurrency(
          operational?.revenueTotal || 0
        )}.`,
      },
      {
        title: 'Fonte dos dados',
        content: 'Tabela faturamento_analitico.',
      },
      {
        title: 'Escopo do filtro',
        content: `Usa ${operational?.revenueDateBasis || 'a base definida para o módulo'} como referência de data. Não há atribuição por campanha nesta etapa.`,
      },
      {
        title: 'Limitação importante',
        content: 'É um contexto de resultado global da clínica. Não deve ser lido como faturamento atribuído diretamente ao Google Ads.',
      },
    ] satisfies MarketingFunilTooltipSection[],
    googleNaoMapeado: [
      {
        title: 'O que é',
        content: 'Parte do Clinia Ads com origem Google que ainda não casa exatamente com o nome das campanhas do Google Ads.',
      },
      {
        title: 'Como calculamos',
        content: `No filtro atual, esse bloco soma ${formatNumber(
          diagnostics?.googleUnmappedContacts || 0
        )} contatos, ${formatNumber(diagnostics?.googleUnmappedNewContacts || 0)} novos contatos e ${formatNumber(
          diagnostics?.googleUnmappedAppointments || 0
        )} agendamentos.`,
      },
      {
        title: 'Fonte dos dados',
        content: 'raw_clinia_ads_contacts, comparando source_id com campaign_name do Google Ads.',
      },
      {
        title: 'Escopo do filtro',
        content: 'Só aparece como diagnóstico quando a leitura do funil usa a origem Google completa.',
      },
      {
        title: 'Limitação importante',
        content: 'Esses registros não entram forçados na tabela principal de campanhas para evitar atribuição artificial.',
      },
    ] satisfies MarketingFunilTooltipSection[],
  };
};

export const buildGoogleAdsHealthTooltipSections = (summary: MarketingFunilSummary | null) => ({
  limitadasPorOrcamento: [
    {
      title: 'O que é',
      content: 'Quantidade de campanhas cujo snapshot mais recente indica limitação ligada a orçamento.',
    },
    {
      title: 'Como calculamos',
      content: `Contamos as campanhas cujo primary_status_reasons contém sinais de budget. No recorte atual, são ${formatNumber(
        summary?.googleAdsHealth.limitedByBudgetCount || 0
      )} campanhas.`,
    },
    {
      title: 'Fonte dos dados',
      content: 'raw_google_ads_campaign_daily.',
    },
    {
      title: 'Escopo do filtro',
      content: 'Usa o último snapshot disponível até a data final selecionada.',
    },
    {
      title: 'Limitação importante',
      content: 'É um diagnóstico do estado atual da campanha, não uma soma do período.',
    },
  ] satisfies MarketingFunilTooltipSection[],
  campanhasAtivas: [
    {
      title: 'O que é',
      content: 'Campanhas com status ENABLED no snapshot mais recente.',
    },
    {
      title: 'Como calculamos',
      content: `Contamos campanhas com status ENABLED. No recorte atual, são ${formatNumber(
        summary?.googleAdsHealth.enabledCount || 0
      )} campanhas.`,
    },
    {
      title: 'Fonte dos dados',
      content: 'raw_google_ads_campaign_daily.',
    },
    {
      title: 'Escopo do filtro',
      content: 'Usa a foto mais recente da campanha até a data final.',
    },
    {
      title: 'Limitação importante',
      content: 'Uma campanha ativa pode continuar limitada por orçamento, lances ou outros motivos.',
    },
  ] satisfies MarketingFunilTooltipSection[],
  campanhasPausadas: [
    {
      title: 'O que é',
      content: 'Campanhas com status PAUSED no snapshot mais recente.',
    },
    {
      title: 'Como calculamos',
      content: `Contamos campanhas com status PAUSED. No recorte atual, são ${formatNumber(
        summary?.googleAdsHealth.pausedCount || 0
      )} campanhas.`,
    },
    {
      title: 'Fonte dos dados',
      content: 'raw_google_ads_campaign_daily.',
    },
    {
      title: 'Escopo do filtro',
      content: 'Usa a foto mais recente da campanha até a data final.',
    },
    {
      title: 'Limitação importante',
      content: 'Como é snapshot, uma campanha pode ter tido gasto no período e ainda assim aparecer pausada hoje.',
    },
  ] satisfies MarketingFunilTooltipSection[],
  scoreMedio: [
    {
      title: 'O que é',
      content: 'Média da pontuação de otimização reportada pelo Google Ads.',
    },
    {
      title: 'Como calculamos',
      content: `Fazemos a média dos optimization_score válidos do snapshot atual. No recorte atual, o score médio é ${formatPercent(
        (summary?.googleAdsHealth.avgOptimizationScore || 0) * 100
      )}.`,
    },
    {
      title: 'Fonte dos dados',
      content: 'raw_google_ads_campaign_daily.',
    },
    {
      title: 'Escopo do filtro',
      content: 'Considera apenas campanhas com score informado pelo Google Ads.',
    },
    {
      title: 'Limitação importante',
      content: 'É um indicador do Google para potencial de otimização, não uma métrica direta de resultado.',
    },
  ] satisfies MarketingFunilTooltipSection[],
  taxaMediaConversao: [
    {
      title: 'O que é',
      content: 'Taxa média de conversão das campanhas Google no período.',
    },
    {
      title: 'Como calculamos',
      content: `Aplicamos Conversões ÷ Interações do período. No recorte atual, a taxa média é ${formatPercent(
        summary?.googleAdsHealth.avgConversionRate || 0
      )}.`,
    },
    {
      title: 'Fonte dos dados',
      content: 'fact_marketing_funnel_daily.',
    },
    {
      title: 'Escopo do filtro',
      content: 'Respeita período, marca e filtros da camada Google.',
    },
    {
      title: 'Limitação importante',
      content: 'Essa taxa usa as conversões reportadas pelo Google Ads, não os agendamentos do Clinia.',
    },
  ] satisfies MarketingFunilTooltipSection[],
  roasMedio: [
    {
      title: 'O que é',
      content: 'Retorno médio de valor de conversão sobre o custo do Google Ads.',
    },
    {
      title: 'Como calculamos',
      content: `Aplicamos Valor de conversão ÷ Custo. No recorte atual, o ROAS médio é ${
        summary?.googleAdsHealth.avgConversionsValuePerCost
          ? `${formatNumber(summary.googleAdsHealth.avgConversionsValuePerCost, 2)}x`
          : '0,00x'
      }.`,
    },
    {
      title: 'Fonte dos dados',
      content: 'fact_marketing_funnel_daily.',
    },
    {
      title: 'Escopo do filtro',
      content: 'Respeita período, marca e filtros da camada Google.',
    },
    {
      title: 'Limitação importante',
      content: 'ROAS aqui usa valor de conversão do Google Ads; não é o mesmo conceito de faturamento bruto analítico.',
    },
  ] satisfies MarketingFunilTooltipSection[],
});
