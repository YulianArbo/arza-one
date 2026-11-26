import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  COMPLIANCE_FIGURE_KEYS,
  DASHBOARD_ERROR_CODES,
  DASHBOARD_FIGURES,
  EXECUTIVE_FIGURE_KEYS,
  type DashboardData,
  type DashboardFigure,
  type Drilldown,
  type FigureKey,
  type Scorecard,
} from '@arza/contracts';

import {
  hasPermission,
  hasUnconditionalPermission,
  type AppAbility,
} from '../../../platform/access/ability.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { AppError } from '../../../platform/errors/app-error.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday } from '../../core/index.js';
import { scorecard } from '../../qms/index.js';
import { COMPLIANCE_SOURCES } from './compliance-sources.js';
import { EXECUTIVE_SOURCES } from './executive-sources.js';
import { memo, type FigureContext, type FigureSource } from './figure-context.js';

// Tableros de la Dirección (B46, ficha 17.17). Se calculan al momento (decisión 11). Una cifra
// solo se calcula si la persona puede ver, sin límite a «lo propio», el listado que la origina
// (decisión 3: nadie ve por un indicador lo que no puede ver por el listado).

const SOURCES: Readonly<Record<FigureKey, FigureSource>> = {
  ...EXECUTIVE_SOURCES,
  ...COMPLIANCE_SOURCES,
};

const DRILLDOWN_LIMIT = 200;

export interface DashboardViewer {
  readonly principal: Principal;
  readonly ability: AppAbility;
}

function canSee(ability: AppAbility, key: FigureKey): boolean {
  return hasUnconditionalPermission(ability, DASHBOARD_FIGURES[key].source);
}

async function figureOf(context: FigureContext, key: FigureKey): Promise<DashboardFigure> {
  const definition = DASHBOARD_FIGURES[key];
  const base = { key, label: definition.label, unit: definition.unit, how: definition.how };
  if (!canSee(context.ability, key)) {
    return { ...base, value: null, detail: null, allowed: false, link: definition.link };
  }
  const result = await SOURCES[key](context);
  return {
    ...base,
    value: result.value,
    detail: result.detail,
    allowed: true,
    link: definition.link,
  };
}

@Injectable()
export class Dashboards {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private run<T>(viewer: DashboardViewer, work: (context: FigureContext) => Promise<T>) {
    const now = this.clock.now();
    return this.database.withTenant(viewer.principal, (tx: TenantTransaction) =>
      work({ tx, ...viewer, now, today: bogotaToday(now), once: memo() }),
    );
  }

  /** El tablero gerencial o el de cumplimiento, con cada cifra que la persona puede ver. */
  async data(viewer: DashboardViewer, keys: readonly FigureKey[]): Promise<DashboardData> {
    return this.run(viewer, async (context) => {
      const figures: DashboardFigure[] = [];
      for (const key of keys) figures.push(await figureOf(context, key));
      return { generated_at: context.now.toISOString(), figures };
    });
  }

  executive(viewer: DashboardViewer): Promise<DashboardData> {
    return this.data(viewer, EXECUTIVE_FIGURE_KEYS);
  }

  compliance(viewer: DashboardViewer): Promise<DashboardData> {
    return this.data(viewer, COMPLIANCE_FIGURE_KEYS);
  }

  /** Los registros que originan una cifra (ficha 17.17: toda cifra lleva a su listado). */
  async drilldown(
    viewer: DashboardViewer,
    dashboard: 'executive' | 'compliance',
    key: FigureKey,
  ): Promise<Drilldown> {
    const definition = DASHBOARD_FIGURES[key];
    if (definition.dashboard !== dashboard) {
      throw new AppError(
        HttpStatus.NOT_FOUND,
        DASHBOARD_ERROR_CODES.figureNotFound,
        'La cifra no es de este tablero.',
      );
    }
    if (!canSee(viewer.ability, key)) throw permissionDenied();
    return this.run(viewer, async (context) => {
      const result = await SOURCES[key](context);
      return {
        figure: key,
        label: definition.label,
        columns: [...result.columns],
        rows: result.rows.slice(0, DRILLDOWN_LIMIT).map((row) => ({ ...row })),
        truncated: result.rows.length > DRILLDOWN_LIMIT,
        link: definition.link,
      };
    });
  }

  /** El cuadro de mando: toda la empresa o solo los procesos del cargo (decisión 5). */
  async scorecard(viewer: DashboardViewer): Promise<Scorecard> {
    const seesAll =
      hasUnconditionalPermission(viewer.ability, 'dashboard.process.read') ||
      hasPermission(viewer.ability, 'dashboard.executive.read');
    return this.run(viewer, async (context) => ({
      generated_at: context.now.toISOString(),
      ...(await scorecard(context.tx, { userId: viewer.principal.userId, seesAll }, context.today)),
    }));
  }
}
