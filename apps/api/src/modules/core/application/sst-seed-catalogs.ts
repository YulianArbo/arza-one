import type { SeedCatalog } from './core-seed-data.js';

// Catálogos con los que nace Seguridad y salud en el trabajo (B37): los elementos de protección y
// las listas de chequeo de cada tipo de inspección. SST los ajusta en Administración › Catálogos.

export const SST_CATALOGS: readonly SeedCatalog[] = [
  {
    key: 'sst_ppe_items',
    name: 'Elementos de protección personal',
    description:
      'Elementos que SST entrega a los colaboradores (ficha 17.14, B37, FT-SST-001). Valores de ejemplo por validar con el responsable del SG-SST.',
    items: [
      ['PAUSAS_KIT', 'Kit de pausas activas'],
      ['REPOSAPIES', 'Reposapiés'],
      ['SOPORTE_PORTATIL', 'Soporte para computador portátil'],
      ['DIADEMA', 'Diadema con micrófono'],
      ['TAPABOCAS', 'Tapabocas'],
      ['GUANTES', 'Guantes de protección'],
      ['GAFAS', 'Gafas de seguridad'],
      ['CHALECO', 'Chaleco reflectivo'],
      ['CASCO', 'Casco de seguridad'],
    ],
  },
  {
    key: 'sst_check_facility',
    name: 'Lista de chequeo: inspección de instalaciones',
    description:
      'Preguntas de la inspección de instalaciones (ficha 17.14, B37). Valores de ejemplo por validar con el responsable del SG-SST.',
    items: [
      ['RUTAS', 'Las rutas de evacuación están señalizadas y despejadas'],
      ['ILUMINACION', 'La iluminación de los puestos es suficiente'],
      ['ELECTRICO', 'Tomas y cables en buen estado, sin sobrecarga'],
      ['ORDEN', 'Áreas ordenadas y limpias, sin obstáculos en el piso'],
      ['PUESTOS', 'Sillas y escritorios en buen estado y ajustables'],
      ['SANITARIOS', 'Servicios sanitarios limpios y con agua potable'],
      ['SENALIZACION', 'Señalización de seguridad visible'],
    ],
  },
  {
    key: 'sst_check_home',
    name: 'Lista de chequeo: puesto de trabajo en casa',
    description:
      'Autoinspección del puesto de trabajo en casa o remoto (Ley 2088 de 2021, B37). Valores de ejemplo por validar con el responsable del SG-SST.',
    items: [
      ['SILLA', 'Silla con espaldar y altura ajustable'],
      ['PANTALLA', 'La pantalla queda a la altura de los ojos y a un brazo de distancia'],
      ['ILUMINACION', 'Buena luz, sin reflejos en la pantalla'],
      ['ELECTRICO', 'Tomas y cables en buen estado, sin extensiones sobrecargadas'],
      ['ESPACIO', 'Espacio suficiente para mover las piernas, sin obstáculos'],
      ['RUIDO', 'Ruido que permite concentrarse y atender llamadas'],
      ['PAUSAS', 'Hace pausas activas durante la jornada'],
    ],
  },
  {
    key: 'sst_check_emergency',
    name: 'Lista de chequeo: botiquín, extintores y emergencias',
    description:
      'Inspección de los elementos de emergencia (ficha 17.14, B37). Valores de ejemplo por validar con el responsable del SG-SST.',
    items: [
      ['EXTINTOR_CARGA', 'Extintores con carga vigente y presión correcta'],
      ['EXTINTOR_ACCESO', 'Extintores accesibles y señalizados'],
      ['BOTIQUIN', 'Botiquín completo y sin elementos vencidos'],
      ['CAMILLA', 'Camilla en su lugar y en buen estado'],
      ['ALARMA', 'Alarma o medio de aviso funcionando'],
      ['DIRECTORIO', 'Directorio de emergencias visible y actualizado'],
    ],
  },
];
