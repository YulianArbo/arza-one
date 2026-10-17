// Interfaz pública de la gestión documental (M03). El worker analiza los archivos con
// scanUploadedFile y convierte las versiones a PDF con renderVersionPdf (B18); los demás módulos
// usan este índice, nunca las tablas doc_.
export { DocModule } from './interface/doc.module.js';
export {
  FileNotReadyError,
  scanUploadedFile,
  type FileScanDependencies,
  type FileScanResult,
} from './application/file-scan.js';
export { scanWithClamav, type ScanVerdict } from './infrastructure/clamav-scanner.js';
export { fileStorageFrom } from './infrastructure/file-storage.js';
export { seedDocFolders } from './application/doc-seed.js';
export {
  DOC_PARTY_LOOKUP,
  type DocParty,
  type DocPartyLookup,
} from './application/party-lookup.js';
export {
  renderVersionPdf,
  type VersionRenderDependencies,
  type VersionRenderResult,
} from './application/version-render.js';
export { convertWithGotenberg } from './infrastructure/gotenberg-converter.js';
export {
  AttachedFileLinks,
  attachedFiles,
  isAttachableFile,
  type AttachedFile,
} from './application/attached-files.js';
