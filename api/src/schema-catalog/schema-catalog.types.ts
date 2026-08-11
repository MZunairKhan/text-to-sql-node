export interface ColumnDoc {
  name: string;
  type: string;
  description: string;
  sampleValues?: string[];
  isPrimaryKey?: boolean;
  /** e.g. "customers.id" — informal, just for embedding/documentation purposes */
  isForeignKey?: string;
}

export interface TableDoc {
  tableName: string;
  schema: string;
  description: string;
  /** True if this table carries a tenant_id column that Phase 3's AST
   *  guardrail must require a predicate on. */
  tenantScoped: boolean;
  columns: ColumnDoc[];
  /** Canonical DDL injected into the SQL-generation prompt in Phase 2. */
  ddl: string;
}
