"use client";
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return <html lang="ru"><body style={{ fontFamily: "system-ui", padding: 24 }}><h1>Ошибка сервера</h1><p>Откройте /api/health и пришлите результат.</p><p>Код: {error.digest}</p><a href="/api/health">Открыть диагностику</a></body></html>;
}
