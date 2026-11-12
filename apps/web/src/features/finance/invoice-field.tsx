import { FormField } from '@arza/ui';
import type { JSX } from 'react';

export function InvoiceField(props: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: 'text' | 'date' | undefined;
  readonly decimal?: boolean | undefined;
}): JSX.Element {
  return (
    <FormField
      id={props.id}
      label={props.label}
      type={props.type ?? 'text'}
      value={props.value}
      {...(props.decimal === true ? { inputMode: 'decimal' as const } : {})}
      onChange={(event) => {
        props.onChange(event.target.value);
      }}
    />
  );
}
