const checks = [
  'GitHub branch creation',
  'TypeScript/React file write',
  'GitHub commit creation',
  'Vercel preview deployment',
  'GitHub Actions production build',
];

export default function AIE2ESmokePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-5xl items-center px-6 py-16 sm:px-10">
        <section className="w-full rounded-3xl border border-border/70 bg-card p-8 shadow-sm sm:p-12">
          <div className="mb-8 inline-flex rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
            Alsamos AI · End-to-end smoke test
          </div>

          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
            GitHub’dan yozilgan TypeScript sayt ishlayapti.
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            Bu sahifa AI coding-agent oqimini tekshirish uchun yaratildi: branch ochildi, TSX kod yozildi,
            commit qilindi, PR orqali CI ishga tushadi va Vercel preview’da real render tekshiriladi.
          </p>

          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            {checks.map((check, index) => (
              <div
                key={check}
                className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
                  {index + 1}
                </span>
                <span className="text-sm font-medium">{check}</span>
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-2xl border border-border/60 bg-muted/30 p-5 font-mono text-xs leading-6 text-muted-foreground">
            route: /ai-e2e-smoke<br />
            language: TypeScript + React<br />
            source: src/pages/AIE2ESmokePage.tsx
          </div>
        </section>
      </div>
    </main>
  );
}
