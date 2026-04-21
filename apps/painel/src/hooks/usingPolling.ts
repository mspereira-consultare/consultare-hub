import { useState, useEffect } from 'react';

export function usePolling<T>(url: string, intervalMs: number = 15000) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // cache: 'no-store' é vital para o Next.js não cachear a resposta
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error('Erro na requisição');
        const json = await res.json();
        setData(json);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido');
      } finally {
        setLoading(false);
      }
    };

    fetchData(); // Primeira chamada imediata
    const interval = setInterval(fetchData, intervalMs);

    return () => clearInterval(interval);
  }, [url, intervalMs]);

  return { data, loading, error };
}