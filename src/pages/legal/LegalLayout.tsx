import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

import { AlsamosLogo } from '@/components/AlsamosLogo';
import { Button } from '@/components/ui/button';
import { LEGAL_ROUTES, TOS_VERSION } from '@/lib/alsamosAuth';

type LegalLayoutProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

export function LegalLayout({ title, subtitle, children }: LegalLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <AlsamosLogo size="sm" />
          </Link>
          <Button asChild variant="ghost" size="sm">
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Orqaga
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-muted-foreground">{subtitle}</p>}
        <p className="mt-1 text-xs text-muted-foreground">Versiya: {TOS_VERSION}</p>

        <div className="prose prose-neutral dark:prose-invert mt-8 max-w-none space-y-6 text-sm leading-relaxed">
          {children}
        </div>

        <nav className="mt-12 flex flex-wrap gap-4 border-t border-border pt-6 text-sm text-muted-foreground">
          <Link className="hover:text-foreground" to={LEGAL_ROUTES.privacy}>Maxfiylik</Link>
          <Link className="hover:text-foreground" to={LEGAL_ROUTES.terms}>Shartlar</Link>
          <Link className="hover:text-foreground" to={LEGAL_ROUTES.help}>Yordam markazi</Link>
        </nav>
      </main>
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-foreground">{heading}</h2>
      <div className="space-y-2 text-muted-foreground">{children}</div>
    </section>
  );
}
