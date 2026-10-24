import type { JSX } from 'react';

import { PlatformShowcase } from '../../features/site/platform-showcase';
import {
  AccessBand,
  ContactSection,
  DeskSection,
  QuoteSection,
} from '../../features/site/service-sections';
import { Hero, ServicesSection, SoonSection } from '../../features/site/site-sections';

/** Inicio de la vitrina (B22A, boceto final). Lo que depende de otros bloques dice «Disponible pronto». */
export default function PublicHomePage(): JSX.Element {
  return (
    <>
      <Hero />
      <ServicesSection />
      <PlatformShowcase />
      <SoonSection
        id="proyectos"
        eyebrow="03 — Proyectos"
        title="Resultados que hablan por nosotros"
        text="Aquí publicaremos los proyectos que nuestros clientes nos autoricen mostrar."
      />
      <SoonSection
        id="noticias"
        eyebrow="04 — Noticias y publicaciones"
        title="Lo nuevo en ARZA TECH"
        text="Aquí encontrará novedades, eventos, ofertas y publicaciones."
      />
      <QuoteSection />
      <DeskSection />
      <ContactSection />
      <AccessBand />
    </>
  );
}
