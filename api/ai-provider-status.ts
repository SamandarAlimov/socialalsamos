export default function handler(_req: any, res: any) {
  const keys: string[] = [];
  const bundle = String(process.env.GEMINI_API_KEYS || "").trim();
  if (bundle) {
    for (const part of bundle.split(",")) {
      const key = part.trim();
      if (key) keys.push(key);
    }
  }
  for (let i = 1; i <= 10; i += 1) {
    const key = String(process.env[`GEMINI_API_KEY_${i}`] || "").trim();
    if (key) keys.push(key);
  }
  const single = String(process.env.GEMINI_API_KEY || "").trim();
  if (single) keys.push(single);
  const unique = [...new Set(keys)];
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ geminiKeyCount: unique.length, configured: unique.length > 0 });
}
