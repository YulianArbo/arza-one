import { Global, Inject, Module } from '@nestjs/common';

import { PLATFORM_TERMS_GATE } from '../../iam/index.js';
import { PersonalDataRegistry } from '../../privacy/index.js';
import { LegalTexts } from '../application/legal-texts.js';
import { Pages } from '../application/pages.js';
import { PLATFORM_TERMS_RECORDS, PlatformTerms } from '../application/platform-terms.js';
import { SiteForms } from '../application/site-forms.js';
import { SITE_PERSONAL_DATA } from '../application/site-personal-data.js';
import { SitePublic } from '../application/site-public.js';
import { Submissions } from '../application/submissions.js';
import { PlatformTermsController } from './platform-terms.controller.js';
import { SiteAdminController } from './site-admin.controller.js';
import { SitePublicController } from './site-public.controller.js';

/**
 * Le presta a identidad la consulta de los términos de la plataforma pendientes (B41, decisión 3).
 * Es global porque identidad no importa el módulo del sitio.
 */
@Global()
@Module({
  providers: [{ provide: PLATFORM_TERMS_GATE, useValue: PLATFORM_TERMS_RECORDS }],
  exports: [PLATFORM_TERMS_GATE],
})
class PlatformTermsGateModule {}

// Sitio público, formularios, textos legales y cookies (M17, B41, ficha 17.18).

@Module({
  imports: [PlatformTermsGateModule],
  controllers: [SitePublicController, SiteAdminController, PlatformTermsController],
  providers: [Pages, LegalTexts, PlatformTerms, SiteForms, SitePublic, Submissions],
})
export class WebModule {
  /** Le presta a Privacidad lo que el sitio guarda de cada titular (B42). */
  constructor(@Inject(PersonalDataRegistry) registry: PersonalDataRegistry) {
    registry.register(SITE_PERSONAL_DATA);
  }
}
