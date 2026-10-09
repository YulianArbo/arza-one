// Descripción del dispositivo de una sesión (pantalla «Sesiones activas», B09): el navegador y el
// sistema que informa el propio navegador. Es orientativa: el navegador puede decir cualquier cosa.

export interface DeviceDescription {
  readonly browser: string | null;
  readonly os: string | null;
}

// El orden importa: Edge y Opera también dicen «Chrome», y Chrome también dice «Safari».
const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\b(?:OPR|Opera)\//, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\b(?:Firefox|FxiOS)\//, 'Firefox'],
  [/\b(?:Chrome|CriOS|Chromium)\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
];

// Android dice también «Linux»; iPhone y iPad dicen también «Mac OS X».
const SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/\bWindows\b/, 'Windows'],
  [/\bAndroid\b/, 'Android'],
  [/\biPhone\b/, 'iOS'],
  [/\biPad\b/, 'iPadOS'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bLinux\b/, 'Linux'],
];

function firstMatch(text: string, rules: readonly (readonly [RegExp, string])[]): string | null {
  return rules.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

export function describeDevice(userAgent: string | null): DeviceDescription {
  if (userAgent === null) return { browser: null, os: null };
  return { browser: firstMatch(userAgent, BROWSERS), os: firstMatch(userAgent, SYSTEMS) };
}
