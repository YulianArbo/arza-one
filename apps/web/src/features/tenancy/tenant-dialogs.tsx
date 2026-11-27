'use client';

import {
  TENANT_PLAN_CODES,
  TENANT_PLANS,
  tenantCreatedResponseSchema,
  type PlatformTenant,
  type TenantPlan,
} from '@arza/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  FormField,
  SelectField,
} from '@arza/ui';
import { Plus } from 'lucide-react';
import { useState, type JSX, type ReactNode, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useAdminAction } from '../administration/admin-action';
import { limitLabel, PLAN_LABELS, storageLabel } from './labels';
import { TENANCY_KEYS } from './queries';

// Ventanas del operador de la plataforma (B48): alta de una empresa y cambio de su plan.

const PLATFORM_REASON = 'Esta acción cambia el acceso de una empresa a la plataforma.';

const PLAN_OPTIONS = TENANT_PLAN_CODES.map((code) => ({
  value: code,
  label: `${PLAN_LABELS[code]}: ${limitLabel(TENANT_PLANS[code].maxInternalUsers)} usuarios, ${storageLabel(TENANT_PLANS[code].storageMb)}${TENANT_PLANS[code].aiAssistant ? ', con asistente' : ''}`,
}));

/** Ventana con su formulario, su botón de enviar y la confirmación de identidad. */
export function FormDialog(props: {
  readonly trigger: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly submitLabel: string;
  readonly pending: boolean;
  readonly error: unknown;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: () => void;
  readonly children: ReactNode;
}): JSX.Element {
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    props.onSubmit();
  };
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogTrigger asChild>{props.trigger}</DialogTrigger>
      <DialogContent>
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{props.title}</DialogTitle>
            <DialogDescription>{props.description}</DialogDescription>
          </DialogHeader>
          {props.error === null ? null : <FormError error={props.error} />}
          {props.children}
          <DialogFooter>
            <SubmitButton
              label={props.submitLabel}
              pendingLabel="Guardando…"
              pending={props.pending}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface NewTenantValues {
  readonly legalName: string;
  readonly tradeName: string;
  readonly taxId: string;
  readonly plan: TenantPlan;
  readonly adminEmail: string;
  readonly adminName: string;
}

const EMPTY: NewTenantValues = {
  legalName: '',
  tradeName: '',
  taxId: '',
  plan: 'professional',
  adminEmail: '',
  adminName: '',
};

function useCreateTenant(onDone: () => void) {
  const api = useApiClient();
  return useAdminAction<NewTenantValues, unknown>({
    run: (values, csrfToken) => {
      const tradeName = values.tradeName.trim();
      const body = {
        legal_name: values.legalName.trim(),
        trade_name: tradeName === '' ? null : tradeName,
        tax_id: values.taxId.trim(),
        plan: values.plan,
        admin: { email: values.adminEmail.trim(), display_name: values.adminName.trim() },
      };
      return api.post('/v1/platform/tenants', {
        body,
        schema: tenantCreatedResponseSchema,
        csrfToken,
      });
    },
    invalidate: [TENANCY_KEYS.tenants],
    reason: PLATFORM_REASON,
    successMessage: 'La empresa quedó creada y su administrador recibirá la invitación por correo.',
    onSuccess: onDone,
  });
}

function NewTenantFields(props: {
  readonly values: NewTenantValues;
  readonly onChange: (values: NewTenantValues) => void;
}): JSX.Element {
  const { values, onChange } = props;
  const field = (key: keyof NewTenantValues) => ({
    value: values[key],
    onChange: (event: { target: { value: string } }) => {
      onChange({ ...values, [key]: event.target.value });
    },
  });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField id="alta-razon-social" label="Razón social" {...field('legalName')} />
      <FormField id="alta-nombre" label="Nombre comercial (opcional)" {...field('tradeName')} />
      <FormField
        id="alta-nit"
        label="NIT"
        hint="Con el dígito de verificación, por ejemplo 900123456-8."
        {...field('taxId')}
      />
      <SelectField id="alta-plan" label="Plan" options={PLAN_OPTIONS} {...field('plan')} />
      <FormField
        id="alta-correo"
        type="email"
        label="Correo del primer administrador"
        hint="Recibe la invitación para entrar; vence en 72 horas."
        {...field('adminEmail')}
      />
      <FormField id="alta-admin" label="Nombre del administrador" {...field('adminName')} />
    </div>
  );
}

/** Alta de una empresa con su primer administrador. */
export function NewTenantDialog(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<NewTenantValues>(EMPTY);
  const create = useCreateTenant(() => {
    setOpen(false);
    setValues(EMPTY);
  });
  return (
    <FormDialog
      trigger={
        <Button type="button">
          <Plus aria-hidden="true" />
          Nueva empresa
        </Button>
      }
      title="Nueva empresa"
      description="La empresa nace con sus catálogos, roles y plantillas. Su administrador recibe la invitación por correo."
      submitLabel="Crear la empresa"
      pending={create.pending}
      error={create.error}
      open={open}
      onOpenChange={setOpen}
      onSubmit={() => {
        create.execute(values);
      }}
    >
      <NewTenantFields values={values} onChange={setValues} />
      {create.dialog}
    </FormDialog>
  );
}

function usePlanChange(tenant: PlatformTenant, onDone: () => void) {
  const api = useApiClient();
  return useAdminAction<{ plan: TenantPlan; users: string }>({
    run: (values, csrfToken) => {
      const users = values.users.trim();
      const body = {
        plan: values.plan,
        max_internal_users: users === '' ? null : Number(users),
        max_portal_users: null,
        storage_mb: null,
        ai_assistant: null,
      };
      const path = `/v1/platform/tenants/${tenant.id}/plan`;
      return api.put(path, { body, version: tenant.version, csrfToken });
    },
    invalidate: [TENANCY_KEYS.tenants],
    reason: PLATFORM_REASON,
    successMessage: 'El plan de la empresa quedó cambiado.',
    onSuccess: onDone,
  });
}

function PlanFields(props: {
  readonly id: string;
  readonly plan: TenantPlan;
  readonly users: string;
  readonly onPlan: (plan: TenantPlan) => void;
  readonly onUsers: (users: string) => void;
}): JSX.Element {
  return (
    <>
      <SelectField
        id={`plan-${props.id}`}
        label="Plan"
        options={PLAN_OPTIONS}
        value={props.plan}
        onChange={(event) => {
          props.onPlan(event.target.value as TenantPlan);
        }}
      />
      <FormField
        id={`plan-usuarios-${props.id}`}
        type="number"
        min={1}
        label="Tope de usuarios internos (opcional)"
        hint="Déjelo vacío para usar el del plan."
        value={props.users}
        onChange={(event) => {
          props.onUsers(event.target.value);
        }}
      />
    </>
  );
}

/** Cambio del plan, con un tope de usuarios internos distinto si se necesita. */
export function PlanDialog({ tenant }: { readonly tenant: PlatformTenant }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<TenantPlan>(tenant.plan);
  const [users, setUsers] = useState('');
  const change = usePlanChange(tenant, () => {
    setOpen(false);
  });
  return (
    <FormDialog
      trigger={
        <Button type="button" variant="outline" size="sm">
          Cambiar plan
        </Button>
      }
      title={`Plan de ${tenant.legal_name}`}
      description="Los límites rigen desde ya. Si la empresa ya pasa de un límite, no podrá agregar más hasta liberar."
      submitLabel="Cambiar el plan"
      pending={change.pending}
      error={change.error}
      open={open}
      onOpenChange={setOpen}
      onSubmit={() => {
        change.execute({ plan, users });
      }}
    >
      <PlanFields id={tenant.id} plan={plan} users={users} onPlan={setPlan} onUsers={setUsers} />
      {change.dialog}
    </FormDialog>
  );
}
