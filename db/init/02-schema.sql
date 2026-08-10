-- Phase 1: business tables for the sample dataset.
-- Runs after 01-* (schema, app_readonly role, pgvector extension) from Phase 0.

CREATE TABLE IF NOT EXISTS text_to_sql_node.revenue_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  opened_date DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS text_to_sql_node.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  signup_date DATE NOT NULL DEFAULT CURRENT_DATE,
  loyalty_tier TEXT NOT NULL DEFAULT 'bronze'
);

CREATE TABLE IF NOT EXISTS text_to_sql_node.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS text_to_sql_node.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  customer_id UUID NOT NULL REFERENCES text_to_sql_node.customers(id),
  revenue_center_id UUID NOT NULL REFERENCES text_to_sql_node.revenue_centers(id),
  order_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending',
  order_total_cents INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS text_to_sql_node.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES text_to_sql_node.orders(id),
  product_id UUID NOT NULL REFERENCES text_to_sql_node.products(id),
  quantity INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL
);

-- No explicit GRANT needed here: 01-init.sh already ran
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA text_to_sql_node GRANT SELECT ON
-- TABLES TO app_readonly` for the role that owns these tables
-- (POSTGRES_USER, same one running this init script), so every table
-- created in this schema from here on inherits SELECT automatically.
