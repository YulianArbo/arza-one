import { Global, Module } from '@nestjs/common';

import { PROFILE_IMAGES } from '../../iam/index.js';
import { DocProfileImages } from '../application/profile-images.js';
import { DocModule } from './doc.module.js';

/**
 * Le presta a identidad y a terceros las imágenes de perfil y los logos (B22A). Es global porque
 * identidad no puede importar la gestión documental, que ya depende de ella.
 */
@Global()
@Module({
  imports: [DocModule],
  providers: [{ provide: PROFILE_IMAGES, useClass: DocProfileImages }],
  exports: [PROFILE_IMAGES],
})
export class ProfileImagesModule {}
