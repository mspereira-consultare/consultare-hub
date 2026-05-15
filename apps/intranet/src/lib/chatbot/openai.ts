const OPENAI_API_URL = 'https://api.openai.com/v1';

const requireOpenAiKey = () => {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    const error = new Error('OPENAI_API_KEY nao configurada para o chatbot da intranet.');
    (error as Error & { status?: number }).status = 503;
    throw error;
  }
  return apiKey;
};

const getChatModel = () => String(process.env.OPENAI_CHAT_MODEL || 'gpt-5.4-mini').trim() || 'gpt-5.4-mini';
const getEmbeddingModel = () =>
  String(process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small').trim() || 'text-embedding-3-small';

const parseOpenAiError = async (response: Response) => {
  try {
    const json = await response.json();
    return String(json?.error?.message || json?.error || `Falha HTTP ${response.status}`);
  } catch {
    return `Falha HTTP ${response.status}`;
  }
};

export const embedText = async (text: string) => {
  const response = await fetch(`${OPENAI_API_URL}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireOpenAiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: getEmbeddingModel(),
      input: text,
    }),
  });

  if (!response.ok) {
    const error = new Error(await parseOpenAiError(response));
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  const json = (await response.json()) as { data?: Array<{ embedding?: number[] }>; model?: string };
  return {
    embedding: Array.isArray(json.data?.[0]?.embedding) ? json.data?.[0]?.embedding || [] : [],
    model: String(json.model || getEmbeddingModel()),
  };
};

export const embedMany = async (texts: string[]) => {
  if (!texts.length) return { embeddings: [] as number[][], model: getEmbeddingModel() };
  const response = await fetch(`${OPENAI_API_URL}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireOpenAiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: getEmbeddingModel(),
      input: texts,
    }),
  });

  if (!response.ok) {
    const error = new Error(await parseOpenAiError(response));
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  const json = (await response.json()) as { data?: Array<{ embedding?: number[] }>; model?: string };
  return {
    embeddings: Array.isArray(json.data) ? json.data.map((item) => item.embedding || []) : [],
    model: String(json.model || getEmbeddingModel()),
  };
};

export const answerWithCitations = async (input: {
  question: string;
  context: Array<{
    sourceId: string;
    sourceTitle: string;
    canonicalUrl: string | null;
    chunkText: string;
  }>;
}) => {
  const contextText = input.context
    .map(
      (item, index) =>
        `Fonte ${index + 1}\nsource_id: ${item.sourceId}\ntitle: ${item.sourceTitle}\nurl: ${item.canonicalUrl || 'null'}\ncontent:\n${item.chunkText}`
    )
    .join('\n\n---\n\n');

  const response = await fetch(`${OPENAI_API_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireOpenAiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: getChatModel(),
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Voce e a IA Consultare. Responda apenas com base nas fontes oficiais fornecidas. Nunca invente respostas. Se o contexto nao for suficiente, retorne confidence=low, shouldEscalate=true e uma resposta curta explicando que a base oficial nao possui informacao confiavel suficiente. Sempre responda em JSON com as chaves answer, confidence, shouldEscalate e citations. citations deve ser uma lista de objetos com sourceId, title e url apenas das fontes efetivamente usadas.',
        },
        {
          role: 'user',
          content: `Pergunta:\n${input.question}\n\nContexto oficial disponível:\n${contextText}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = new Error(await parseOpenAiError(response));
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = String(json.choices?.[0]?.message?.content || '').trim();
  let parsed:
    | {
        answer?: string;
        confidence?: string;
        shouldEscalate?: boolean;
        citations?: Array<{ sourceId?: string; title?: string; url?: string | null }>;
      }
    | null = null;

  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = null;
  }

  return {
    answer: String(parsed?.answer || 'Nao encontrei uma resposta confiavel na base oficial neste momento.'),
    confidence: String(parsed?.confidence || 'low'),
    shouldEscalate: Boolean(parsed?.shouldEscalate),
    citations: Array.isArray(parsed?.citations)
      ? parsed!.citations!.map((item) => ({
          sourceId: String(item.sourceId || ''),
          title: String(item.title || ''),
          url: item.url ? String(item.url) : null,
        }))
      : [],
  };
};

export const streamAnswer = async (input: {
  question: string;
  context: Array<{
    sourceId: string;
    sourceTitle: string;
    canonicalUrl: string | null;
    chunkText: string;
  }>;
  onDelta: (delta: string) => void | Promise<void>;
}) => {
  const contextText = input.context
    .map(
      (item, index) =>
        `Fonte ${index + 1}\nsource_id: ${item.sourceId}\ntitle: ${item.sourceTitle}\nurl: ${item.canonicalUrl || 'null'}\ncontent:\n${item.chunkText}`
    )
    .join('\n\n---\n\n');

  const response = await fetch(`${OPENAI_API_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireOpenAiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: getChatModel(),
      stream: true,
      messages: [
        {
          role: 'system',
          content:
            'Voce e a IA Consultare. Responda somente com base nas fontes oficiais fornecidas. Nunca invente fatos. Responda exatamente ao que foi perguntado. Se a pergunta for institucional, sobre unidades, estrutura, endereco, localizacao ou informacoes gerais da clinica, nao desvie para listar medicos ou especialidades, a menos que isso tenha sido explicitamente solicitado. Se o contexto for insuficiente, diga claramente que a base oficial nao traz informacao confiavel suficiente neste momento.',
        },
        {
          role: 'user',
          content: `Pergunta:\n${input.question}\n\nContexto oficial disponível:\n${contextText}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = new Error(await parseOpenAiError(response));
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  if (!response.body) {
    const error = new Error('A OpenAI nao retornou corpo de streaming para esta resposta.');
    (error as Error & { status?: number }).status = 502;
    throw error;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n');
    buffer = parts.pop() || '';

    for (const rawLine of parts) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;

      let parsed: any = null;
      try {
        parsed = JSON.parse(payload);
      } catch {
        parsed = null;
      }
      const delta = String(parsed?.choices?.[0]?.delta?.content || '');
      if (!delta) continue;
      answer += delta;
      await input.onDelta(delta);
    }
  }

  const finalAnswer = answer.trim();
  return {
    answer: finalAnswer || 'Nao encontrei uma resposta confiavel na base oficial neste momento.',
  };
};
