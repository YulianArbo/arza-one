// Interfaz pública de la gestión documental (M03). El worker analiza los archivos con
// scanUploadedFile, convierte las versiones a PDF con renderVersionPdf (B18), genera los PDF de
// los registros diligenciados y las copias de consulta con renderPendingPdfs (B20), y propone y
// ejecuta la disposición final y extrae el texto para la búsqueda (B21); los demás módulos usan
// este índice, nunca las tablas doc_.
export { DocModule } from './interface/doc.module.js';
export { ProfileImagesModule } from './interface/profile-images.module.js';
export {
  FileNotReadyError,
  scanUploadedFile,
  type FileScanDependencies,
  type FileScanResult,
} from './application/file-scan.js';
export { scanWithClamav, type ScanVerdict } from './infrastructure/clamav-scanner.js';
export { fileStorageFrom } from './infrastructure/file-storage.js';
export { seedDocFolders } from './application/doc-seed.js';
export { seedDocWorkflows } from './application/doc-workflows.js';
export { seedDocForms } from './application/form-seed.js';
export { seedRetentionDemo } from './application/retention-demo-seed.js';
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
export {
  renderPendingPdfs,
  renderTenantPdfs,
  type PdfRenderDependencies,
  type PdfRenderResult,
} from './application/pdf-render.js';
export {
  proposeMonthlyDispositions,
  type MonthlyProposalDependencies,
} from './application/disposition-proposals.js';
export {
  executeApprovedDispositions,
  type DispositionExecutionDependencies,
} from './application/disposition-execution.js';
export {
  extractPendingTexts,
  type TextExtractionDependencies,
} from './application/text-extraction.js';
export { extractPdfText } from './infrastructure/pdf-text.js';
export {
  convertHtmlWithGotenberg,
  convertWithGotenberg,
  mergeWithGotenberg,
  stampWithGotenberg,
} from './infrastructure/gotenberg-converter.js';
export {
  AttachedFileLinks,
  attachedFiles,
  isAttachableFile,
  openAvailableFile,
  type AttachedFile,
  type OpenedFile,
} from './application/attached-files.js';
export { storePdf as storeGeneratedPdf } from './application/generated-pdf.js';
export { FileStorage } from './infrastructure/file-storage.js';
