import { Button, EmptyState } from '@arza/ui';
import { MapPinOff } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

export default function NotFound(): JSX.Element {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4">
      <h1 className="sr-only">Página no encontrada</h1>
      <EmptyState
        title="No encontramos esta página"
        description="La dirección no existe o cambió. Revise que esté bien escrita o vuelva al inicio."
        icon={<MapPinOff />}
        action={
          <Button asChild>
            <Link href="/">Volver al inicio</Link>
          </Button>
        }
      />
    </main>
  );
}
