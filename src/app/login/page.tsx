import { login } from "@/lib/actions";
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
    <form action={login} className="panel" style={{ padding: 22, width: 320, display: "flex", flexDirection: "column", gap: 12 }}>
      <img src="/promy-logo.svg" alt="Promy" width="96" height="42" /><h1 style={{ fontSize: 22 }}>Creators CRM</h1>
      <label className="field">Кто вы (имя попадёт в журнал)
        <input className="in" name="name" list="names" required autoComplete="username" />
        <datalist id="names"><option value="Стас" /><option value="Влад" /></datalist></label>
      <label className="field">Пароль<input className="in" name="password" type="password" required autoComplete="current-password" /></label>
      {error === "env" ? <div style={{ color: "var(--bad)" }}>Сервер не настроен: нет APP_PASSWORD или SESSION_SECRET</div> : error ? <div style={{ color: "var(--bad)" }}>Неверный пароль</div> : null}
      <button className="btn-p" style={{ padding: 8 }}>Войти</button>
    </form></div>;
}
