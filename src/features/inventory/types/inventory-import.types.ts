export type InventoryImportAction = "initialize" | "no_change" | "adjust";
export type InventoryImportProductState = "new" | "existing";
export type InventoryImportDestination =
  | { ownerType: "company"; ownerId: "company" }
  | { ownerType: "agent"; ownerId: string };

export interface ParsedInventoryImportRow {
  rowNumber: number;
  sku: string;
  importedName: string;
  initialStock: number | null;
  minimumStock: number | null;
  description?: string;
  salePrice?: number;
  active: boolean;
  errors: string[];
}

export interface InventoryImportPreviewRow extends ParsedInventoryImportRow {
  id: string;
  productState: InventoryImportProductState;
  productId?: string;
  productName: string;
  currentStock: number | null;
  currentMinimumStock: number | null;
  difference: number | null;
  action: InventoryImportAction;
  warnings: string[];
}

export interface InventoryImportRowResult {
  rowNumber: number;
  sku: string;
  success: boolean;
  productCreated: boolean;
  productExisting: boolean;
  inventoryCreated: boolean;
  adjustment: "in" | "out" | null;
  skipped: boolean;
  error?: string;
}

export interface InventoryImportSummary {
  rowsProcessed: number;
  productsCreated: number;
  productsExisting: number;
  inventoriesCreated: number;
  adjustmentsIn: number;
  adjustmentsOut: number;
  rowsSkipped: number;
  errors: number;
  results: InventoryImportRowResult[];
}

export interface InventoryImportParseResult {
  rows: ParsedInventoryImportRow[];
  fileErrors: string[];
}
