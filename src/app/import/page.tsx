import RedditImport from "@/components/RedditImport";
import { Submit } from "@/components/ui";
import { addCreator, importPromy, importSheet } from "@/lib/actions";
import { baseUrl } from "@/lib/apify";
import { promyToken } from "@/lib/promy";
export default async function Import({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const sp = await searchParams; const hook = `${baseUrl()}/api/webhooks/promy?token=${promyToken()}`;
  return <div className="flex flex-col gap-4" style={{ maxWidth: 980 }}>
    <div><h1>Импорт</h1><p className="sub">Старые таблицы, данные из Promy и ручное добавление.</p></div>
    <RedditImport />
    {sp.msg && <div className="okbox">{sp.msg}</div>}
    <section className="panel" style={{ padding: 18 }}><h2>Историческая база — защита от повторной рассылки</h2><p className="muted" style={{ margin: "4px 0 10px" }}>Reddit-таблица, ответы формы, любой Excel (.xlsx, все листы сразу) или CSV с колонкой Email. Эти люди попадут в базу с пометкой «из старой таблицы», и тула никогда не напишет им повторно, даже если найдёт их в TikTok.</p>
      <form action={importSheet} className="flex flex-col gap-2"><div className="row"><input className="in" name="label" placeholder="Название, например Reddit" required aria-label="Название" /><input type="file" name="file" accept=".csv,.txt,.xlsx,.xls,text/csv" aria-label="Файл CSV" /></div><textarea className="in" name="text" rows={4} placeholder="…или вставь CSV сюда" aria-label="CSV" /><div><Submit className="btn-p">Импортировать</Submit></div></form></section>
    <section className="panel" style={{ padding: 18 }}><h2>Регистрации с promy.io</h2>
      <p className="muted" style={{ margin: "4px 0 10px" }}>Лучше всего: promy.io сам сообщает о регистрации, заполненном профиле и каждом видео. Передай Дмитрию адрес и формат ниже. Совпадение ищется сначала по коду из ссылки (<code>?ref=</code>), потом по почте.</p>
      <pre className="chat">{`POST ${hook}
Content-Type: application/json

{ "event": "registered" | "profile_completed" | "video_submitted",
  "email": "creator@gmail.com",
  "ref": "код из ?ref= при регистрации",
  "user_id": "id в Promy",
  "at": "2026-11-13T10:00:00Z" }`}</pre>
      <p className="muted" style={{ margin: "10px 0" }}>Пока этого нет, загружай выгрузку креаторов из Promy (CSV с колонками email, дата регистрации, профиль заполнен, количество видео; названия колонок могут быть любыми похожими).</p>
      <form action={importPromy} className="flex flex-col gap-2"><input type="file" name="file" accept=".csv,.txt,.xlsx,.xls,text/csv" aria-label="Файл CSV" /><textarea className="in" name="text" rows={3} placeholder="…или вставь CSV" aria-label="CSV" /><div><Submit className="btn-p">Загрузить</Submit></div></form></section>
    <section className="panel" style={{ padding: 18 }}><h2>Добавить креатора вручную</h2><p className="muted" style={{ margin: "4px 0 10px" }}>Нашёл сам, хочешь отправить в рассылку: он сразу будет одобрен.</p>
      <form action={addCreator} className="row"><input className="in" name="url" placeholder="Ссылка на TikTok или Instagram" required style={{ flex: 1, minWidth: 220 }} aria-label="Ссылка" /><input className="in" name="email" type="email" placeholder="Почта" required aria-label="Почта" /><input className="in" name="name" placeholder="Имя" aria-label="Имя" /><Submit className="btn-p">Добавить</Submit></form></section>
  </div>;
}

