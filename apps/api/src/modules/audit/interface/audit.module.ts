import { Module } from '@nestjs/common';

import { AuditExportUseCase } from '../application/audit-export.js';
import { AuditQuery } from '../application/audit-query.js';
import { ChainVerificationUseCase } from '../application/chain-verification.js';
import { AuditController } from './audit.controller.js';

/**
 * M19 Auditoría y trazabilidad (B11). El registro de cada evento vive en platform/audit, porque
 * todos los módulos lo usan; este módulo consulta, exporta y verifica.
 */
@Module({
  controllers: [AuditController],
  providers: [AuditQuery, AuditExportUseCase, ChainVerificationUseCase],
})
export class AuditModule {}
