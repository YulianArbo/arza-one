import { Module } from '@nestjs/common';

import { CONFIG } from '../../../platform/config/config.module.js';
import type { Env } from '../../../platform/config/env-schema.js';
import { AiAssist } from '../application/assist.js';
import { AI_SETTINGS, AiGateway, type AiSettings } from '../application/gateway.js';
import { AiGovernance } from '../application/governance.js';
import { AiUsage } from '../application/usage.js';
import { AI_MODEL, type AiModel } from '../infrastructure/ai-model.js';
import { anthropicModel } from '../infrastructure/anthropic-model.js';
import { rehearsalModel } from '../infrastructure/rehearsal-model.js';
import { AiAdminController } from './ai-admin.controller.js';
import { AiController } from './ai.controller.js';

// Asistente de inteligencia artificial (M20, B47, ADR-022): pasarela con control de permisos,
// minimización y registro. Sin proveedor configurado el asistente queda apagado (decisión 2).

export function aiModelFor(config: Env): AiModel | null {
  if (config.AI_GATEWAY_PROVIDER === 'rehearsal') return rehearsalModel();
  if (config.AI_GATEWAY_PROVIDER === 'anthropic' && config.AI_GATEWAY_API_KEY !== undefined) {
    return anthropicModel({
      apiKey: config.AI_GATEWAY_API_KEY,
      model: config.AI_GATEWAY_MODEL,
      timeoutMs: config.AI_GATEWAY_TIMEOUT_MS,
    });
  }
  return null;
}

@Module({
  controllers: [AiController, AiAdminController],
  providers: [
    { provide: AI_MODEL, useFactory: aiModelFor, inject: [CONFIG] },
    {
      provide: AI_SETTINGS,
      useFactory: (config: Env): AiSettings => ({
        dailyLimit: config.AI_GATEWAY_DAILY_LIMIT,
        maxInputChars: config.AI_GATEWAY_MAX_INPUT_CHARS,
      }),
      inject: [CONFIG],
    },
    AiGateway,
    AiAssist,
    AiGovernance,
    AiUsage,
  ],
})
export class AiModule {}
