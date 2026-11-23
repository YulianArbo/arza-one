import { Module } from '@nestjs/common';

import { DocModule } from '../../doc/index.js';
import { IdeaSteps } from '../application/idea-steps.js';
import { Ideas } from '../application/ideas.js';
import { InnFiles } from '../application/inn-files.js';
import { IpAssets } from '../application/ip-assets.js';
import { IpAuthors } from '../application/ip-authors.js';
import { Roadmap } from '../application/roadmap.js';
import { Competitors, TechWatch } from '../application/watch.js';
import { IdeasController } from './ideas.controller.js';
import { PortfolioController } from './portfolio.controller.js';
import { RoadmapWatchController } from './roadmap-watch.controller.js';

// Innovación y propiedad intelectual (M15, B40): banco de ideas, hoja de ruta, portafolio con
// alertas de renovación, vigilancia tecnológica y competencia.

@Module({
  imports: [DocModule],
  controllers: [IdeasController, PortfolioController, RoadmapWatchController],
  providers: [Ideas, IdeaSteps, Roadmap, IpAssets, IpAuthors, InnFiles, TechWatch, Competitors],
})
export class InnModule {}
