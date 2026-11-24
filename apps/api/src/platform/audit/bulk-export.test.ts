import { describe, expect, it } from 'vitest';

import { BULK_EXPORT_ROWS, exportedRows, isBulkExport, isExportAction } from './bulk-export.js';

describe('exportación masiva (numeral 10.7, decisión 6 de B44)', () => {
  it('reconoce las acciones de exportación por su segmento «export…»', () => {
    expect(isExportAction('qms.action.export')).toBe(true);
    expect(isExportAction('finance.export.download')).toBe(true);
    expect(isExportAction('privacy.request.export_register')).toBe(true);
    expect(isExportAction('iam.session.create')).toBe(false);
    expect(isExportAction('doc.file.download')).toBe(false);
  });

  it('lee los registros de «rows» o de «row_count»', () => {
    expect(exportedRows({ rows: 7 })).toBe(7);
    expect(exportedRows({ row_count: 9 })).toBe(9);
    expect(exportedRows({ rows: 'muchas' })).toBeNull();
    expect(exportedRows(undefined)).toBeNull();
  });

  it('alerta solo por encima de 500 registros', () => {
    expect(isBulkExport('qms.action.export', { rows: BULK_EXPORT_ROWS })).toBe(false);
    expect(isBulkExport('qms.action.export', { rows: BULK_EXPORT_ROWS + 1 })).toBe(true);
    expect(isBulkExport('finance.export.create', { row_count: 2000 })).toBe(true);
    expect(isBulkExport('qms.action.export', {})).toBe(false);
  });

  it('la auditoría y los datos personales de un titular alertan siempre', () => {
    expect(isBulkExport('audit.event.export', { row_count: 1 })).toBe(true);
    expect(isBulkExport('privacy.data.export', { sections: 3 })).toBe(true);
  });

  it('una acción que no exporta nunca alerta, aunque mueva muchos registros', () => {
    expect(isBulkExport('wf.task.reassign', { rows: 10_000 })).toBe(false);
  });
});
