// Plantillas de correo (B16) y de documentos PDF (B20): el marco institucional, la maqueta de los
// formatos diligenciados, los motores de las plantillas de salida HTML y Word y el acta de
// disposición final (B21), y el informe de auditoría y el acta de revisión por la dirección (B39).
export { noticeEmail, type NoticeEmailInput, type RenderedEmail } from './notice-email.js';
export {
  controlledCopyStamp,
  framedPreview,
  institutionalFooter,
  institutionalHeader,
  UNCONTROLLED_COPY,
  type CompanyIdentity,
  type DocumentIdentity,
} from './institutional.js';
export { formDocumentBody, printPage, type RecordFacts } from './form-document.js';
export {
  dispositionCertificateBody,
  type DisposedDocumentLine,
  type DispositionCertificate,
  type KeptDocumentLine,
} from './disposition-certificate.js';
export { printedDate } from './form-values.js';
export { templateContext, type TemplateContext } from './form-context.js';
export {
  htmlTemplatePage,
  htmlTemplateVariables,
  renderHtmlTemplate,
  TemplateSyntaxError,
} from './output-html.js';
export { docxTemplateVariables, fillDocxTemplate } from './output-docx.js';
export {
  percentText,
  pesos,
  quoteDocumentBody,
  type QuoteDocument,
  type QuoteDocumentLine,
  type QuoteDocumentTax,
} from './quote-document.js';
export {
  contractDocumentBody,
  type ContractDocument,
  type ContractDocumentClause,
  type ContractSignature,
} from './contract-document.js';
export {
  evidenceCertificateBody,
  signaturesPageBody,
  type EvidenceEvent,
  type SignatureEvidence,
  type SignedBy,
} from './signature-evidence.js';
export {
  auditReportBody,
  managementReviewBody,
  type AuditReportDocument,
  type ManagementReviewDocument,
} from './quality-documents.js';
export { personalDataReportBody, type PersonalDataDocument } from './personal-data-report.js';
