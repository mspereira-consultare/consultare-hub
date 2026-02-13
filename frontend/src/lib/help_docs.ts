import 'server-only';

import { promises as fs } from 'node:fs';
import path from 'node:path';

export type HelpDocAudience = 'all' | 'admin';
export type HelpDocCategory = 'operacional' | 'tecnico';

export type HelpDocConfig = {
  id: string;
  title: string;
  description: string;
  fileName: string;
  audience: HelpDocAudience;
  category: HelpDocCategory;
};

export type HelpDocNavItem = {
  id: string;
  title: string;
  description: string;
  fileName: string;
  audience: HelpDocAudience;
  category: HelpDocCategory;
  lastModified: string | null;
  exists: boolean;
};

export type HelpDoc = HelpDocNavItem & {
  content: string;
};

const HELP_DOCS: HelpDocConfig[] = [
  {
    id: 'readme',
    title: 'Índice da Documentação',
    description: 'Mapa rápido da base de conhecimento do painel.',
    fileName: 'README.md',
    audience: 'all',
    category: 'operacional',
  },
  {
    id: 'visao-funcional',
    title: 'Visão Funcional e Indicadores',
    description: 'Regras de negócio, fontes e fórmulas dos indicadores por página.',
    fileName: '01-visao-funcional-e-indicadores.md',
    audience: 'all',
    category: 'operacional',
  },
  {
    id: 'matriz-permissoes',
    title: 'Matriz de Permissões',
    description: 'Permissões view/edit/refresh por página e perfil.',
    fileName: '02-matriz-de-permissoes.md',
    audience: 'admin',
    category: 'tecnico',
  },
  {
    id: 'arquitetura-tecnica',
    title: 'Arquitetura Técnica',
    description: 'Componentes, fluxos de dados, workers, cache e autenticação.',
    fileName: '03-arquitetura-tecnica.md',
    audience: 'admin',
    category: 'tecnico',
  },
  {
    id: 'dicionario-dados',
    title: 'Dicionário de Dados',
    description: 'Catálogo das tabelas, chaves e responsabilidades de escrita.',
    fileName: '04-dicionario-de-dados.md',
    audience: 'admin',
    category: 'tecnico',
  },
  {
    id: 'runbook-operacional',
    title: 'Runbook Operacional',
    description: 'Checklist de deploy, validações e troubleshooting.',
    fileName: '05-runbook-operacional.md',
    audience: 'admin',
    category: 'tecnico',
  },
];

const DOCS_DIR_CANDIDATES = [
  path.resolve(process.cwd(), 'docs'),
  path.resolve(process.cwd(), '..', 'docs'),
  path.resolve(process.cwd(), '..', '..', 'docs'),
];

const formatDateTime = (date: Date) =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);

const resolveDocsDir = async (): Promise<string | null> => {
  for (const candidate of DOCS_DIR_CANDIDATES) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) return candidate;
    } catch {
      // ignore and try next candidate
    }
  }
  return null;
};

const isVisible = (doc: HelpDocConfig, isAdmin: boolean) =>
  doc.audience === 'all' || isAdmin;

const missingFileContent = (fileName: string, docsDir: string | null) => {
  const baseMsg = `> Documento não encontrado: \`${fileName}\``;
  if (!docsDir) {
    return `${baseMsg}\n\nNão foi possível localizar a pasta \`docs/\` no ambiente atual.`;
  }
  return `${baseMsg}\n\nCaminho esperado: \`${path.join(docsDir, fileName)}\``;
};

export const getHelpDocsConfig = (isAdmin: boolean): HelpDocConfig[] =>
  HELP_DOCS.filter((doc) => isVisible(doc, isAdmin));

export const getHelpDocConfigById = (
  docId: string,
  isAdmin: boolean
): HelpDocConfig | null => {
  const found = HELP_DOCS.find((d) => d.id === docId);
  if (!found) return null;
  return isVisible(found, isAdmin) ? found : null;
};

export const listHelpDocs = async (
  isAdmin: boolean
): Promise<HelpDocNavItem[]> => {
  const docsDir = await resolveDocsDir();
  const visibleDocs = getHelpDocsConfig(isAdmin);

  return Promise.all(
    visibleDocs.map(async (doc) => {
      if (!docsDir) {
        return { ...doc, lastModified: null, exists: false };
      }

      const filePath = path.join(docsDir, doc.fileName);
      try {
        const stat = await fs.stat(filePath);
        return {
          ...doc,
          lastModified: formatDateTime(stat.mtime),
          exists: true,
        };
      } catch {
        return { ...doc, lastModified: null, exists: false };
      }
    })
  );
};

export const loadHelpDocById = async (
  docId: string,
  isAdmin: boolean
): Promise<HelpDoc | null> => {
  const doc = getHelpDocConfigById(docId, isAdmin);
  if (!doc) return null;

  const docsDir = await resolveDocsDir();
  if (!docsDir) {
    return {
      ...doc,
      content: missingFileContent(doc.fileName, null),
      lastModified: null,
      exists: false,
    };
  }

  const filePath = path.join(docsDir, doc.fileName);

  try {
    const [content, stat] = await Promise.all([
      fs.readFile(filePath, 'utf8'),
      fs.stat(filePath),
    ]);

    return {
      ...doc,
      content,
      lastModified: formatDateTime(stat.mtime),
      exists: true,
    };
  } catch {
    return {
      ...doc,
      content: missingFileContent(doc.fileName, docsDir),
      lastModified: null,
      exists: false,
    };
  }
};

export const buildHelpDocLinkMap = (
  docs: Array<Pick<HelpDocConfig, 'id' | 'fileName'>>
): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const doc of docs) map[doc.fileName] = doc.id;
  return map;
};

export const normalizeHelpHref = (
  hrefRaw: string,
  linkMap: Record<string, string>
): string => {
  const href = String(hrefRaw || '').trim();
  if (!href) return href;

  if (href.startsWith('#')) return href;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(href)) return href;

  const [beforeHash, hashPart] = href.split('#', 2);
  const [beforeQuery, queryPart] = beforeHash.split('?', 2);

  let cleaned = beforeQuery.replace(/^\.\//, '');
  cleaned = cleaned.replace(/^\//, '');
  if (cleaned.startsWith('docs/')) cleaned = cleaned.slice('docs/'.length);

  const fileName = path.posix.basename(cleaned);
  if (!fileName.toLowerCase().endsWith('.md')) return href;

  const docId = linkMap[fileName];
  if (!docId) return href;

  const nextHref = `/ajuda/${docId}`;
  const query = queryPart ? `?${queryPart}` : '';
  const hash = hashPart ? `#${hashPart}` : '';
  return `${nextHref}${query}${hash}`;
};
