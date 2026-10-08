import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

// Lista de contraseñas filtradas (numeral 15.1). Viene de SecLists (licencia MIT; ver
// apps/api/data/README.md): solo las de 12 caracteres o más, en minúsculas. Se compara sin
// distinguir mayúsculas, porque cambiar solo una letra a mayúscula no hace segura una contraseña
// conocida. Funciona sin internet: el servidor no tiene salida (B07).

const LIST_FILE = new URL('../../../../data/leaked-passwords.txt.gz', import.meta.url);

let leaked: ReadonlySet<string> | undefined;

function loadList(): ReadonlySet<string> {
  leaked ??= new Set(gunzipSync(readFileSync(LIST_FILE)).toString('utf8').split('\n'));
  return leaked;
}

export function isLeakedPassword(password: string): boolean {
  return loadList().has(password.toLowerCase());
}
