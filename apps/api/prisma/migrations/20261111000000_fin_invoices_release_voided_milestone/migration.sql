-- B31: una solicitud anulada libera su hito para volver a facturarlo. La unicidad por hito pasa a
-- cubrir solo las facturas vigentes; el índice simple (tenant_id, milestone_id) ya existe.

DROP INDEX "fin_invoices_tenant_id_milestone_id_key";

-- Una sola factura vigente por hito; las anuladas y las eliminadas no cuentan.
CREATE UNIQUE INDEX "fin_invoices_one_open_per_milestone" ON "fin_invoices"("tenant_id", "milestone_id")
    WHERE "status" <> 'voided' AND "deleted_at" IS NULL;
