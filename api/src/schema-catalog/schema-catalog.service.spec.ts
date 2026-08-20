import { SchemaCatalogService } from './schema-catalog.service';

describe('SchemaCatalogService.expandWithForeignKeys', () => {
  const catalog = new SchemaCatalogService();
  const names = (r: { tableName: string }[]) => r.map((x) => x.tableName).sort();

  it('adds the bridge table when two hits only join through it', () => {
    const r = catalog.expandWithForeignKeys(['revenue_centers', 'order_items', 'products']);
    expect(r).toEqual([{ tableName: 'orders', reason: 'bridge' }]);
  });

  it('adds foreign-key parents of a lone hit', () => {
    const r = catalog.expandWithForeignKeys(['orders']);
    expect(names(r)).toEqual(['customers', 'revenue_centers']);
    expect(r.every((x) => x.reason === 'fk-parent')).toBe(true);
  });

  it('does not follow child tables that touch only one hit', () => {
    expect(catalog.expandWithForeignKeys(['customers'])).toEqual([]);
  });

  it('caps the number of extras', () => {
    expect(catalog.expandWithForeignKeys(['orders'], 1)).toHaveLength(1);
  });

  it('ignores unknown tables and never returns a seed', () => {
    expect(catalog.expandWithForeignKeys(['nope'])).toEqual([]);
    const r = catalog.expandWithForeignKeys(['orders', 'customers']);
    expect(names(r)).not.toContain('orders');
    expect(names(r)).not.toContain('customers');
  });
});
