# Inventory Registry & Expenses — Supabase Database Integration Plan

Connect the **Assets, Inventory & Expense Terminal** (`src/components/InventoryManagement.tsx`) directly to the multi-tenant **Supabase PostgreSQL database** (`public.inventory_items`, `public.stock_movements`, `public.school_expenses`, `public.school_settings`, and `public.audit_logs`).

---

## 1. Supabase Schema & Multi-Table Architecture

The current frontend component (`InventoryManagement.tsx`) calls non-existent client tables (`inventory` and `expenses`). We will wire the module to the actual multi-tenant Supabase tables in your project:

1. **`public.inventory_items` (Stock Commodities Registry)**
   - Stores all school commodities and apparatus (`id`, `school_id`, `item_name`, `category`, `quantity`, `min_quantity`, `unit_price`, `location`, `supplier_name`, `supplier_phone`, `last_updated`).
2. **`public.stock_movements` (Stock Adjustment, Issuance & Restock Ledger)**
   - Tracks every stock change (`id`, `school_id`, `item_id`, `item_name`, `movement_type` (`IN`, `OUT`, `RESTOCK`, `ISSUE`, `ADJUSTMENT`), `quantity_change`, `previous_quantity`, `new_quantity`, `reason`, `performed_by`, `created_at`).
   - Automatically synchronizes with both physical `public.stock_movements` rows and `public.school_settings.streams.inventory.movements` so movement history is preserved across all schema configurations.
3. **`public.school_expenses` (Overhead & Inventory Restock Purchases)**
   - Stores all financial expenditures (`id`, `school_id`, `description`, `category`, `amount`, `date`, `inventory_item_id`, `quantity_purchased`, `payment_method`, `recorded_by`).
   - When an **Inventory Restock** expense is logged (or deleted), the server atomically increments (or rolls back) the linked commodity's `quantity` in `public.inventory_items` and records a corresponding entry in `public.stock_movements`.
4. **`public.school_settings` JSONB Backup & Starter Commodities Auto-Seed**
   - Mirrors the school's inventory items, stock movements, and expenses to `public.school_settings.streams.inventory`.
   - On first initialization of a school with an empty `public.inventory_items` table, automatically seeds starter campus commodities (e.g., *Whiteboard Markers & Duster Set*, *A4 Printing Paper Reams*, *Core Mathematics Textbooks*, *Student Khaki Uniform Sets*, *Classroom Dual Desks*, *Science Lab Beakers*) so the registry is immediately populated.

---

## 2. Backend API Endpoints (`server.ts`)

Add a dedicated `/api/inventory/*` suite in `server.ts`:

- **`GET /api/inventory/state`**
  - Resolves the active `school_id`, fetches `inventory_items`, `stock_movements`, and `school_expenses` from Supabase (auto-seeding starter items if uninitialized), inspects table health (`tableStatus`), and returns the full state plus `inventorySql` DDL.
- **`POST /api/inventory/sync`**
  - Performs two-way reconciliation between local IndexedDB (`db.inventory`, `db.expenses`) and Supabase (`public.inventory_items`, `public.stock_movements`, `public.school_expenses`), migrating any offline/local items and expenses to Supabase.
- **`POST /api/inventory/items` & `PUT /api/inventory/items/:id` & `DELETE /api/inventory/items/:id`**
  - Creates, updates, or deletes stock items in `public.inventory_items`, logs initial stock or quantity deltas in `public.stock_movements`, and writes an audit trail to `public.audit_logs`.
- **`POST /api/inventory/items/:id/adjust`**
  - Atomically adjusts a commodity's stock count (`+1`, `-1`, custom restock, or departmental issuance), updates `public.inventory_items.quantity`, and logs the movement in `public.stock_movements` with `previous_quantity`, `new_quantity`, `reason`, and `performed_by`.
- **`POST /api/inventory/expenses` & `DELETE /api/inventory/expenses/:id`**
  - Records or deletes expenditures in `public.school_expenses`. For `Inventory Restock` purchases, automatically increments/reverts `public.inventory_items.quantity` and logs the restock movement in `public.stock_movements`.

---

## 3. Frontend API Client & UI Enhancements (`src/lib/api.ts` & `src/components/InventoryManagement.tsx`)

1. **`inventoryApi` Client (`src/lib/api.ts`)**
   - Add `inventoryApi` (`getState`, `syncState`, `saveItem`, `deleteItem`, `adjustQuantity`, `createExpense`, `deleteExpense`) with automatic local Dexie (`db.inventory`, `db.expenses`) reconciliation (`reconcileInventoryStateInDexie`).
2. **Supabase Cloud Status Header & Table Inspector (`InventoryManagement.tsx`)**
   - Add a dark slate header hero banner displaying real-time Supabase connection status, last sync timestamp, a **Sync Cloud** button, and a **Supabase Tables** inspector drawer showing live row counts and status for `public.inventory_items`, `public.stock_movements`, `public.school_expenses`, and `public.school_settings`.
3. **Dedicated `Stock Movements` History Tab & Custom Stock Adjustment Modal**
   - Add a 3rd tab — **Stock Movements (`stock_movements`)** — alongside **Stock Commodities** and **Expenses & Restocks**.
   - Display a complete chronological movement ledger with badges for **Restock (+IN)**, **Issuance (-OUT)**, and **Adjustment**, showing previous vs. new quantity, staff member (`performed_by`), reason/department, timestamp, search/type filters, **Export CSV**, and **Print Movement Ledger**.
   - Add a **Record Stock Issuance / Adjustment** action on each commodity so staff can issue items to classrooms/departments or restock with a reason note.
