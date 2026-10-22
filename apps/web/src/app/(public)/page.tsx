import { Button } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { ThemeMenu } from '../../components/theme-menu';
import { ON_BRAND } from '../../lib/theme/theme';

/** Inicio del sitio público. Su contenido institucional se construye en B41. */
export default function PublicHomePage(): JSX.Element {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between bg-sidebar px-4 py-3 sm:px-8">
        <p className="font-heading text-lg font-bold text-sidebar-foreground">ARZA ONE</p>
        <ThemeMenu className={ON_BRAND} />
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-12">
        <h1 className="font-heading text-3xl font-bold sm:text-4xl">ARZA TECH S.A.S.</h1>
        <p className="text-lg text-muted-foreground">
          Este es el sitio público de ARZA ONE. Su contenido se publicará más adelante.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/app">Entrar a la aplicación</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/portal">Portal del cliente</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
