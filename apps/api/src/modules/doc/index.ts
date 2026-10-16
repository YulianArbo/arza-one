// Interfaz pública de la gestión documental (M03). El worker analiza los archivos con
// scanUploadedFile; los demás módulos usarán este índice, nunca las tablas doc_.
export { DocModule } from './interface/doc.module.js';
export {
  FileNotReadyError,
  scanUploadedFile,
  type FileScanDependencies,
  type FileScanResult,
} from './application/file-scan.js';
export { scanWithClamav, type ScanVerdict } from './infrastructure/clamav-scanner.js';
export { fileStorageFrom } from './infrastructure/file-storage.js';
export {
  AttachedFileLinks,
  attachedFiles,
  isAttachableFile,
  type AttachedFile,
} from './application/attached-files.js';
