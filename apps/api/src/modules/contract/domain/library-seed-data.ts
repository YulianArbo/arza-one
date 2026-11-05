import type { ContractKind } from '@arza/contracts';

// Biblioteca inicial de cláusulas y plantillas CT-COM y OS-COM (B24). Los formatos originales no
// están en el repositorio: estos textos los propuso el equipo y los aprobó el dueño del producto, y
// quedan «por validar por el asesor jurídico» (numeral 19.4) hasta que él los revise. Si llegan los
// originales, se cargan como versiones nuevas de cada cláusula, sin tocar código.
// EL CONTRATISTA es la empresa; EL CONTRATANTE, el cliente.

export interface SeedClause {
  readonly key: string;
  readonly title: string;
  readonly numbered: boolean;
  readonly body: string;
}

export interface SeedTemplate {
  readonly code: string;
  readonly name: string;
  readonly kind: ContractKind;
  /** Cláusulas en su orden; las marcadas con «?» se pueden quitar del contrato. */
  readonly clauses: readonly string[];
}

const PARTIES =
  '{{cliente_nombre}}, identificado con {{cliente_documento}}, con domicilio en {{cliente_direccion}} de {{cliente_ciudad}}, representado en este acto por {{cliente_representante}}, identificado con {{cliente_representante_documento}}';

export const SEED_CLAUSES: readonly SeedClause[] = [
  {
    key: 'partes-contrato',
    title: 'Partes',
    numbered: false,
    body: `Entre los suscritos, {{empresa_razon_social}}, sociedad identificada con {{empresa_nit}}, que en adelante se denominará EL CONTRATISTA, y ${PARTIES}, quien en adelante se denominará EL CONTRATANTE, hemos acordado celebrar el contrato {{codigo_contrato}}, que se regirá por las cláusulas siguientes y, en lo no previsto, por las normas civiles y comerciales de Colombia.`,
  },
  {
    key: 'objeto-desarrollo',
    title: 'Objeto',
    numbered: true,
    body: 'EL CONTRATISTA se obliga a prestar a EL CONTRATANTE, con plena autonomía técnica y administrativa, los servicios de desarrollo de software consistentes en: {{objeto}}. Hace parte de este contrato, como descripción del alcance, {{cotizacion}}.',
  },
  {
    key: 'objeto-soporte',
    title: 'Objeto',
    numbered: true,
    body: 'EL CONTRATISTA se obliga a prestar a EL CONTRATANTE, con plena autonomía técnica y administrativa, los servicios de soporte técnico y mantenimiento del software consistentes en: {{objeto}}. Hace parte de este contrato, como descripción del alcance, {{cotizacion}}.',
  },
  {
    key: 'valor-y-pago',
    title: 'Valor y forma de pago',
    numbered: true,
    body: 'El valor total de este contrato, con los impuestos incluidos, es de {{valor_letras}} ({{valor}}). EL CONTRATANTE lo pagará así: {{forma_pago}}. Cada pago se hará contra la factura electrónica de EL CONTRATISTA, dentro de los treinta (30) días calendario siguientes a su recibo.',
  },
  {
    key: 'plazo',
    title: 'Plazo',
    numbered: true,
    body: 'El plazo de este contrato va desde el {{fecha_inicio}} hasta el {{fecha_fin}}, ambas fechas incluidas. Solo se prorroga por escrito, mediante un otrosí firmado por las partes.',
  },
  {
    key: 'obligaciones-contratista',
    title: 'Obligaciones de EL CONTRATISTA',
    numbered: true,
    body: 'EL CONTRATISTA se obliga a: 1) ejecutar el objeto con la calidad, el cuidado y la oportunidad acordados; 2) asignar personal idóneo; 3) informar a EL CONTRATANTE el avance y cualquier situación que afecte el plazo; 4) entregar la documentación y los productos acordados; y 5) cumplir las normas de seguridad de la información que EL CONTRATANTE le comunique por escrito.',
  },
  {
    key: 'obligaciones-contratante',
    title: 'Obligaciones de EL CONTRATANTE',
    numbered: true,
    body: 'EL CONTRATANTE se obliga a: 1) pagar el valor en la forma acordada; 2) entregar a tiempo la información, los accesos y las aprobaciones que el servicio requiera; 3) designar una persona que lo represente ante EL CONTRATISTA; y 4) revisar y aprobar o comentar las entregas dentro de los cinco (5) días hábiles siguientes a su recibo; pasado ese término sin comentarios, la entrega se entiende aprobada.',
  },
  {
    key: 'propiedad-intelectual',
    title: 'Propiedad intelectual',
    numbered: true,
    body: 'Pagado el valor total, EL CONTRATISTA cede a EL CONTRATANTE los derechos patrimoniales de autor sobre el software desarrollado especialmente para él, conforme a la Ley 23 de 1982 y la Decisión Andina 351 de 1993. EL CONTRATISTA conserva la titularidad de los componentes, herramientas y bibliotecas que ya existían o que son de uso general, y concede a EL CONTRATANTE una licencia no exclusiva, perpetua y gratuita para usarlos dentro del software entregado. Los derechos morales permanecen en cabeza de sus autores.',
  },
  {
    key: 'niveles-servicio',
    title: 'Niveles de servicio',
    numbered: true,
    body: 'EL CONTRATISTA atenderá las solicitudes de EL CONTRATANTE en días hábiles, de lunes a viernes de 8:00 a. m. a 6:00 p. m., hora de Colombia, con estos tiempos máximos de primera respuesta: prioridad crítica, cuatro (4) horas hábiles; alta, ocho (8) horas hábiles; media, dieciséis (16) horas hábiles; y baja, cuarenta (40) horas hábiles. Cada mes entregará un informe con las solicitudes atendidas y sus tiempos.',
  },
  {
    key: 'garantia',
    title: 'Garantía',
    numbered: true,
    body: 'EL CONTRATISTA garantiza, durante tres (3) meses contados desde cada entrega aprobada, que lo entregado funciona conforme a lo acordado, y corregirá sin costo los defectos atribuibles a su trabajo. La garantía no cubre cambios hechos por terceros, usos distintos de los acordados ni fallas de la infraestructura de EL CONTRATANTE.',
  },
  {
    key: 'confidencialidad',
    title: 'Confidencialidad',
    numbered: true,
    body: 'Las partes guardarán reserva sobre la información que se entreguen con ocasión de este contrato y solo la usarán para cumplirlo. Esta obligación continúa durante los cinco (5) años siguientes a la terminación del contrato. No es confidencial la información que ya sea pública, que la parte receptora ya conocía legítimamente o que deba revelarse por orden de autoridad competente.',
  },
  {
    key: 'datos-personales',
    title: 'Protección de datos personales',
    numbered: true,
    body: 'Cuando EL CONTRATISTA trate datos personales por cuenta de EL CONTRATANTE, lo hará como encargado del tratamiento, solo según sus instrucciones y para cumplir este contrato, con las medidas de seguridad que exigen la Ley 1581 de 2012 y el Decreto 1074 de 2015. Al terminar el contrato, devolverá o suprimirá los datos, según lo indique EL CONTRATANTE.',
  },
  {
    key: 'independencia',
    title: 'Autonomía e independencia',
    numbered: true,
    body: 'EL CONTRATISTA actúa con autonomía técnica, administrativa y financiera. Este contrato no crea relación laboral entre EL CONTRATANTE y EL CONTRATISTA ni con el personal que este emplee, cuyos salarios, prestaciones y aportes a la seguridad social están a cargo exclusivo de EL CONTRATISTA.',
  },
  {
    key: 'terminacion',
    title: 'Terminación',
    numbered: true,
    body: 'Este contrato termina: 1) al vencer su plazo; 2) por mutuo acuerdo escrito; 3) por incumplimiento grave de una parte, si no lo corrige dentro de los quince (15) días calendario siguientes al aviso escrito de la otra; o 4) por decisión de cualquiera de las partes, con un aviso escrito de treinta (30) días calendario. En los casos 2 y 4, EL CONTRATANTE pagará lo ejecutado hasta la fecha de terminación.',
  },
  {
    key: 'cesion',
    title: 'Cesión',
    numbered: true,
    body: 'Ninguna de las partes podrá ceder este contrato ni las obligaciones que de él surgen sin la autorización previa y escrita de la otra.',
  },
  {
    key: 'notificaciones',
    title: 'Notificaciones',
    numbered: true,
    body: 'Las comunicaciones de este contrato se enviarán por escrito: a EL CONTRATANTE, al correo {{cliente_correo}} o a la dirección {{cliente_direccion}} de {{cliente_ciudad}}; a EL CONTRATISTA, al correo y la dirección que figuran en sus facturas. Cada parte avisará por escrito cualquier cambio.',
  },
  {
    key: 'controversias',
    title: 'Solución de controversias',
    numbered: true,
    body: 'Las diferencias que surjan de este contrato se intentarán resolver primero por arreglo directo, dentro de los treinta (30) días calendario siguientes al aviso escrito de una parte. Si no se logra, se acudirá a la conciliación ante un centro de conciliación autorizado y, en su defecto, a los jueces de la República de Colombia.',
  },
  {
    key: 'firma-electronica',
    title: 'Firma electrónica',
    numbered: true,
    body: 'Las partes aceptan la firma electrónica de la plataforma ARZA ONE como mecanismo válido y confiable para firmar este documento y sus modificaciones, conforme a la Ley 527 de 1999 y al Decreto 2364 de 2012, y declaran que el correo registrado de cada firmante es de su uso exclusivo. El documento también podrá firmarse de forma manuscrita, en cuyo caso la copia digitalizada firmada por todos tendrá el mismo valor.',
  },
  {
    key: 'partes-nda',
    title: 'Partes',
    numbered: false,
    body: `Entre los suscritos, {{empresa_razon_social}}, sociedad identificada con {{empresa_nit}}, y ${PARTIES}, que en adelante se denominarán conjuntamente LAS PARTES, hemos acordado celebrar el acuerdo de confidencialidad {{codigo_contrato}}, que se regirá por las cláusulas siguientes.`,
  },
  {
    key: 'objeto-nda',
    title: 'Propósito',
    numbered: true,
    body: 'El propósito de este acuerdo es proteger la información que LAS PARTES se entreguen con ocasión de: {{objeto}}.',
  },
  {
    key: 'informacion-confidencial',
    title: 'Información confidencial',
    numbered: true,
    body: 'Es información confidencial toda la que una parte entregue a la otra, por cualquier medio, sobre su negocio, sus clientes, su tecnología, su código fuente, sus procesos, sus finanzas y sus planes, esté o no marcada como confidencial.',
  },
  {
    key: 'obligaciones-confidencialidad',
    title: 'Obligaciones de reserva',
    numbered: true,
    body: 'La parte que recibe la información se obliga a: 1) usarla solo para el propósito de este acuerdo; 2) no revelarla a terceros sin autorización escrita; 3) darla a conocer solo a las personas de su equipo que la necesiten, quienes quedarán obligadas en los mismos términos; y 4) protegerla con, al menos, el cuidado con que protege su propia información confidencial.',
  },
  {
    key: 'excepciones-confidencialidad',
    title: 'Excepciones',
    numbered: true,
    body: 'No es confidencial la información que: 1) ya sea pública sin culpa de la parte que la recibe; 2) la parte receptora ya conocía legítimamente; 3) reciba legítimamente de un tercero sin obligación de reserva; o 4) deba revelarse por orden de autoridad competente, caso en el cual avisará de inmediato a la otra parte.',
  },
  {
    key: 'vigencia-nda',
    title: 'Vigencia',
    numbered: true,
    body: 'Este acuerdo rige desde el {{fecha_inicio}} hasta el {{fecha_fin}}. La obligación de reserva sobre la información recibida durante ese tiempo continúa durante los dos (2) años siguientes a su terminación.',
  },
  {
    key: 'devolucion-informacion',
    title: 'Devolución de la información',
    numbered: true,
    body: 'Al terminar este acuerdo, o antes si la otra parte lo pide por escrito, cada parte devolverá o destruirá la información confidencial recibida y sus copias, y lo confirmará por escrito.',
  },
  {
    key: 'partes-os',
    title: 'Partes',
    numbered: false,
    body: `Por medio de la orden de servicio {{codigo_contrato}}, ${PARTIES}, quien en adelante se denominará EL CONTRATANTE, encarga a {{empresa_razon_social}}, sociedad identificada con {{empresa_nit}}, quien en adelante se denominará EL CONTRATISTA, el servicio que se describe a continuación, en las condiciones siguientes.`,
  },
  {
    key: 'objeto-os',
    title: 'Servicio que se ordena',
    numbered: true,
    body: 'EL CONTRATISTA prestará a EL CONTRATANTE el siguiente servicio: {{objeto}}.',
  },
  {
    key: 'aceptacion-os',
    title: 'Aceptación',
    numbered: true,
    body: 'Con la firma de esta orden, EL CONTRATISTA acepta prestar el servicio en las condiciones aquí descritas. En lo no previsto rigen las condiciones de {{cotizacion}} y las normas comerciales de Colombia.',
  },
];

export const SEED_TEMPLATES: readonly SeedTemplate[] = [
  {
    code: 'CT-COM-001',
    name: 'Contrato de prestación de servicios de desarrollo de software',
    kind: 'contract',
    clauses: [
      'partes-contrato',
      'objeto-desarrollo',
      'valor-y-pago',
      'plazo',
      'obligaciones-contratista',
      'obligaciones-contratante',
      'propiedad-intelectual',
      'garantia?',
      'confidencialidad',
      'datos-personales',
      'independencia',
      'terminacion',
      'cesion?',
      'notificaciones?',
      'controversias',
      'firma-electronica',
    ],
  },
  {
    code: 'CT-COM-002',
    name: 'Contrato de soporte y mantenimiento',
    kind: 'contract',
    clauses: [
      'partes-contrato',
      'objeto-soporte',
      'valor-y-pago',
      'plazo',
      'obligaciones-contratista',
      'obligaciones-contratante',
      'niveles-servicio',
      'confidencialidad',
      'datos-personales',
      'independencia',
      'terminacion',
      'cesion?',
      'notificaciones?',
      'controversias',
      'firma-electronica',
    ],
  },
  {
    code: 'CT-COM-003',
    name: 'Acuerdo de confidencialidad',
    kind: 'nda',
    clauses: [
      'partes-nda',
      'objeto-nda',
      'informacion-confidencial',
      'obligaciones-confidencialidad',
      'excepciones-confidencialidad',
      'vigencia-nda',
      'devolucion-informacion',
      'datos-personales?',
      'controversias',
      'firma-electronica',
    ],
  },
  {
    code: 'OS-COM-001',
    name: 'Orden de servicio',
    kind: 'service_order',
    clauses: [
      'partes-os',
      'objeto-os',
      'valor-y-pago',
      'plazo',
      'aceptacion-os',
      'garantia?',
      'datos-personales?',
      'firma-electronica',
    ],
  },
];
