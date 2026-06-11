-- A08: Enforce append-only semantics on log_auditoria at the database level.
--
-- Even if application code were compromised or a developer ran a raw SQL UPDATE/DELETE,
-- this trigger prevents mutation of audit records. LogAuditoria must be immutable
-- to satisfy audit trail integrity requirements.

CREATE OR REPLACE FUNCTION log_auditoria_prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'log_auditoria is append-only. UPDATE and DELETE operations are not permitted. '
    'Operation: %, Table: log_auditoria, Row id: %',
    TG_OP, OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_auditoria_immutable
  BEFORE UPDATE OR DELETE ON log_auditoria
  FOR EACH ROW
  EXECUTE FUNCTION log_auditoria_prevent_mutation();
