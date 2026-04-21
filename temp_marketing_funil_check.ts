import dotenv from 'dotenv';
dotenv.config({ path: '.env', override: true });
process.env.MYSQL_URL = process.env.MYSQL_PUBLIC_URL;
import { getDbConnection } from './apps/painel/src/lib/db.ts';
import { listMarketingFunnelFilterOptions, getMarketingFunnelSummary } from './apps/painel/src/lib/marketing_funil/repository.ts';

(async () => {
  const db = getDbConnection();
  const filters = { periodRef: '2026-03' };
  const options = await listMarketingFunnelFilterOptions(db as any, filters as any);
  const summary = await getMarketingFunnelSummary(db as any, filters as any);
  console.log(JSON.stringify({
    optionsCounts: {
      campaigns: options.campaigns.length,
      sources: options.sources.length,
      media: options.media.length,
      channelGroups: options.channelGroups.length,
    },
    optionSample: {
      campaigns: options.campaigns.slice(0,5),
      sources: options.sources.slice(0,5),
      media: options.media.slice(0,5),
      channelGroups: options.channelGroups.slice(0,5),
    },
    revenue: summary.revenue,
    appointments: summary.appointments,
    crm: summary.crm,
  }, null, 2));
})();
