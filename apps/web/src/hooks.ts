import { useEffect, useState } from "react";

export function useAsync<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loader()
      .then((value) => {
        if (alive) setData(value);
      })
      .catch((cause: unknown) => {
        if (alive) setError(cause instanceof Error ? cause : new Error("Unknown request error"));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { data, error, loading };
}
