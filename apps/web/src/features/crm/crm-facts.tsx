import { Card, CardContent, CardHeader, CardTitle } from '@arza/ui';
import Link from 'next/link';
import type { JSX, ReactNode } from 'react';

// Datos de una ficha del CRM (B22, numeral 16.3): pares de término y valor en una tarjeta.

export type Fact = readonly [term: string, value: ReactNode];

export function FactsCard(props: {
  readonly title: string;
  readonly facts: readonly Fact[];
}): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {props.facts.map(([term, value]) => (
            <FactItem key={term} term={term}>
              {value}
            </FactItem>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function FactItem(props: { readonly term: string; readonly children: ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{props.term}</dt>
      <dd className="text-sm">{props.children}</dd>
    </div>
  );
}

/** Enlace dentro de una ficha, como el cliente o el prospecto de origen. */
export function factLink(href: string, text: string): JSX.Element {
  return (
    <Link key={href} href={href} className="text-primary underline-offset-4 hover:underline">
      {text}
    </Link>
  );
}
