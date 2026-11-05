import { Button } from '@arza/ui';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { BrandLogo } from '../../components/brand-logo';
import { ThemeMenu } from '../../components/theme-menu';
import { COMPANY, LEGAL_TEXTS, SITE_NAV, SOCIAL_NETWORKS, legalPath } from './site-content';

// Encabezado y pie de la vitrina (B22A): logo a la izquierda, secciones a la derecha y el botón
// «Plataforma empresarial» arriba a la derecha; el pie identifica a la empresa (ficha 17.18).

export function SiteHeader(): JSX.Element {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" aria-label="ARZA ONE, inicio" className="text-foreground">
          <BrandLogo className="h-6 w-auto" />
        </Link>
        <nav
          aria-label="Secciones del sitio"
          className="order-last -mx-1 w-full overflow-x-auto md:order-none md:ml-auto md:w-auto"
        >
          <ul className="flex w-max gap-1">
            {SITE_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <ThemeMenu className="hidden sm:inline-flex" />
          <Button asChild size="sm">
            <Link href="/iniciar-sesion">
              Plataforma empresarial
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

/** Redes de la empresa. Sin dirección todavía, se muestran sin enlace y lo dicen. */
function SocialIcon({ path }: { readonly path: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-4"
    >
      <path d={path} />
    </svg>
  );
}

const SOCIAL_BOX =
  'inline-flex size-9 items-center justify-center rounded-full border text-muted-foreground';

function SocialLinks(): JSX.Element {
  return (
    <ul aria-label="Redes sociales" className="flex flex-wrap gap-2">
      {SOCIAL_NETWORKS.map((network) => (
        <li key={network.name}>
          {network.url === null ? (
            <span
              className={`${SOCIAL_BOX} opacity-60`}
              title={`${network.name}: disponible pronto`}
            >
              <SocialIcon path={network.icon} />
              <span className="sr-only">{`${network.name}: disponible pronto`}</span>
            </span>
          ) : (
            <a
              href={network.url}
              rel="noopener noreferrer"
              target="_blank"
              className={`${SOCIAL_BOX} hover-invert`}
            >
              <SocialIcon path={network.icon} />
              <span className="sr-only">{network.name}</span>
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

const FOOTER_COLUMNS = [
  {
    title: 'Empresa',
    links: [
      { href: '/#servicios', label: 'Servicios' },
      { href: '/#proyectos', label: 'Proyectos' },
      { href: '/#noticias', label: 'Noticias' },
      { href: '/#contacto', label: 'Contacto' },
    ],
  },
  {
    title: 'Plataforma',
    links: [
      { href: '/iniciar-sesion', label: 'Plataforma empresarial' },
      { href: '/iniciar-sesion', label: 'Portal de clientes' },
      { href: '/verificar', label: 'Verificar documento' },
    ],
  },
  {
    title: 'Atención',
    links: [
      { href: '/#cotizar', label: 'Solicitar cotización' },
      { href: '/#pqrsf', label: 'Radicar una PQRSF' },
      { href: '/#contacto', label: 'Contacto' },
    ],
  },
  {
    title: 'Legal',
    links: LEGAL_TEXTS.map((text) => ({ href: legalPath(text), label: text.title })),
  },
] as const;

function FooterColumns(): JSX.Element {
  return (
    <>
      {FOOTER_COLUMNS.map((column) => (
        <nav key={column.title} aria-label={column.title} className="flex flex-col gap-2 text-sm">
          <span className="font-medium">{column.title}</span>
          {column.links.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-muted-foreground hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      ))}
    </>
  );
}

export function SiteFooter(): JSX.Element {
  return (
    <footer className="border-t bg-card">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-[1.5fr_repeat(4,1fr)]">
        <div className="flex flex-col gap-4">
          <BrandLogo className="h-6 w-auto self-start text-foreground" />
          <p className="text-sm text-muted-foreground">
            {COMPANY.legalName} · Innovando el presente, construyendo el futuro.
          </p>
          <SocialLinks />
        </div>
        <FooterColumns />
      </div>
      <div className="border-t">
        <p className="mx-auto w-full max-w-6xl px-4 py-4 text-xs text-muted-foreground">
          © {new Date().getFullYear()} {COMPANY.legalName} · NIT {COMPANY.taxId} · {COMPANY.address}{' '}
          · {COMPANY.email} · {COMPANY.phone}
        </p>
      </div>
    </footer>
  );
}
