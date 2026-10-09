import { generate } from 'lean-qr';
import { toSvgPath } from 'lean-qr/extras/svg';
import { useMemo, type JSX } from 'react';

/**
 * Código QR dibujado en la página, sin enviar el secreto a ningún servicio externo. Siempre negro
 * sobre blanco (también en el tema oscuro) para que lo lea la cámara del celular.
 */
export function QrCode({
  value,
  label,
}: {
  readonly value: string;
  readonly label: string;
}): JSX.Element {
  const { size, path } = useMemo(() => {
    const code = generate(value);
    return { size: code.size, path: toSvgPath(code) };
  }, [value]);
  return (
    <div className="inline-flex rounded-md bg-white p-3 text-black">
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${String(size)} ${String(size)}`}
        className="size-48"
        shapeRendering="crispEdges"
      >
        <path d={path} fill="currentColor" />
      </svg>
    </div>
  );
}
