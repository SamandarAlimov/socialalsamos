const CHUNK_SIZE = 3500;
const MAX_CHUNKS = 8;

const isAlsamosHost = () =>
  typeof window !== "undefined" && window.location.hostname.endsWith("alsamos.com");

const cookieOptions = () => {
  const secure = typeof window !== "undefined" && window.location.protocol === "https:";
  return [
    "path=/",
    "domain=.alsamos.com",
    "SameSite=Lax",
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
};

const setCookie = (name: string, value: string, maxAge: number) => {
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; max-age=${maxAge}; ${cookieOptions()}`;
};

const getCookie = (name: string) => {
  const encodedName = `${encodeURIComponent(name)}=`;
  const value = document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(encodedName))
    ?.slice(encodedName.length);
  return value ? decodeURIComponent(value) : undefined;
};

const removeCookie = (name: string) => setCookie(name, "", 0);

export const sharedSupabaseStorage = {
  getItem(key: string): string | null {
    if (!isAlsamosHost()) return localStorage.getItem(key);

    const chunks = Number(getCookie(`${key}.chunks`) ?? "0");
    if (!chunks) return null;

    const value = Array.from({ length: chunks }, (_, index) => getCookie(`${key}.${index}`) ?? "").join("");
    return value ? decodeURIComponent(value) : null;
  },

  setItem(key: string, value: string): void {
    if (!isAlsamosHost()) {
      localStorage.setItem(key, value);
      return;
    }

    const encoded = encodeURIComponent(value);
    const chunks = Math.ceil(encoded.length / CHUNK_SIZE);
    for (let index = 0; index < MAX_CHUNKS; index += 1) removeCookie(`${key}.${index}`);
    setCookie(`${key}.chunks`, String(chunks), 60 * 60 * 24 * 30);
    for (let index = 0; index < chunks; index += 1) {
      setCookie(`${key}.${index}`, encoded.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE), 60 * 60 * 24 * 30);
    }
  },

  removeItem(key: string): void {
    if (!isAlsamosHost()) {
      localStorage.removeItem(key);
      return;
    }

    const chunks = Number(getCookie(`${key}.chunks`) ?? "0");
    for (let index = 0; index < Math.max(chunks, MAX_CHUNKS); index += 1) removeCookie(`${key}.${index}`);
    removeCookie(`${key}.chunks`);
  },
};
