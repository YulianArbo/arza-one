import { siteBlocks } from '@arza/contracts';
import type { JSX } from 'react';

// Texto sencillo de páginas y textos legales (B41, decisión 10): títulos, párrafos y listas. Se
// pinta como texto de React: nunca se interpreta HTML que venga en el contenido.

export function SiteBlocks({ body }: { readonly body: string }): JSX.Element {
  return (
    <div className="flex flex-col gap-4 leading-relaxed">
      {siteBlocks(body).map((block, index) => {
        const key = `${block.kind}-${String(index)}`;
        if (block.kind === 'heading') {
          return (
            <h2 key={key} className="pt-2 text-xl font-semibold">
              {block.text}
            </h2>
          );
        }
        if (block.kind === 'list') {
          return (
            <ul key={key} className="flex list-disc flex-col gap-1 pl-6">
              {block.items.map((item, position) => (
                <li key={`${key}-${String(position)}`}>{item}</li>
              ))}
            </ul>
          );
        }
        return <p key={key}>{block.text}</p>;
      })}
    </div>
  );
}
