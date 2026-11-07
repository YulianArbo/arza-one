import { Module } from '@nestjs/common';

import { DocModule } from '../../doc/index.js';
import { IamModule } from '../../iam/index.js';
import { PortalAccess } from '../application/portal-access.js';
import { PortalActions } from '../application/portal-actions.js';
import { PortalPeople } from '../application/portal-people.js';
import { PortalQueries } from '../application/portal-queries.js';
import { PortalAccountController } from './portal-account.controller.js';
import { PortalSupportController } from './portal-support.controller.js';
import { PortalWorkController } from './portal-work.controller.js';

/**
 * M09 Portal del cliente (B30, ficha 17.10). No tiene tablas propias: muestra lo de Proyectos,
 * Contratos, Servicio al cliente e Identidad a través de sus interfaces públicas, siempre limitado a
 * la empresa cliente de la persona, y solo después de aceptar los términos vigentes.
 */
@Module({
  imports: [DocModule, IamModule],
  controllers: [PortalWorkController, PortalSupportController, PortalAccountController],
  providers: [PortalAccess, PortalQueries, PortalActions, PortalPeople],
})
export class PortalModule {}
