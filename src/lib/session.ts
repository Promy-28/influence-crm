// Signed session cookie, usable from both the edge middleware and server code.
const enc = new TextEncoder();
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function sign(data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(process.env.SESSION_SECRET!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}
export const COOKIE = "crm_session";
export async function makeToken(name: string) {
  const payload = b64(enc.encode(JSON.stringify({ name, exp: Date.now() + 30 * 864e5 })));
  return `${payload}.${await sign(payload)}`;
}
export async function readToken(token?: string): Promise<string | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || (await sign(payload)) !== sig) return null;
  try {
    const bin = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const { name, exp } = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    return exp > Date.now() ? name : null;
  } catch { return null; }
}
