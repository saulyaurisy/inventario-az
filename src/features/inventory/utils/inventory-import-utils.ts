import type { Product } from "@/features/products";
import { normalizeSku } from "@/features/products/utils/product-validation";

import type { InventoryRecord } from "../types/inventory.types";
import type {
  InventoryImportParseResult,
  InventoryImportPreviewRow,
  ParsedInventoryImportRow,
} from "../types/inventory-import.types";

export const INVENTORY_IMPORT_MAX_ROWS = 200;
export const INVENTORY_IMPORT_ACCEPT = ".xlsx,.xls,.csv";

type HeaderKey =
  | "sku"
  | "name"
  | "initialStock"
  | "minimumStock"
  | "description"
  | "salePrice"
  | "active"
  | "owner";

const HEADER_ALIASES: Record<string, HeaderKey> = {
  sku: "sku",
  producto: "name",
  nombre: "name",
  "stock inicial": "initialStock",
  stock: "initialStock",
  "stock minimo": "minimumStock",
  descripcion: "description",
  precio: "salePrice",
  estado: "active",
  propietario: "owner",
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function textValue(value: unknown): string {
  return String(value ?? "").trim();
}

function parseNonNegativeInteger(
  value: unknown,
  label: string,
  errors: string[],
): number | null {
  const raw = textValue(value);
  if (!raw) {
    errors.push(`${label} es obligatorio.`);
    return null;
  }
  const numericValue = typeof value === "number" ? value : Number(raw);
  if (!Number.isFinite(numericValue) || !Number.isInteger(numericValue)) {
    errors.push(`${label} debe ser un número entero.`);
    return null;
  }
  if (numericValue < 0) {
    errors.push(`${label} no puede ser negativo.`);
    return null;
  }
  return numericValue;
}

function parseOptionalPrice(value: unknown, errors: string[]): number | undefined {
  const raw = textValue(value);
  if (!raw) return undefined;
  const numericValue =
    typeof value === "number" ? value : Number(raw.replace(",", "."));
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    errors.push("Precio debe ser un número mayor o igual a 0.");
    return undefined;
  }
  return numericValue;
}

function parseActive(value: unknown, errors: string[]): boolean {
  const normalized = normalizeHeader(value);
  if (!normalized) return true;
  if (["activo", "activa", "si", "true", "1"].includes(normalized)) {
    return true;
  }
  if (["inactivo", "inactiva", "no", "false", "0"].includes(normalized)) {
    return false;
  }
  errors.push("Estado debe ser Activo o Inactivo.");
  return true;
}

function validateOwner(value: unknown, errors: string[]) {
  const normalized = normalizeHeader(value);
  if (normalized && !["empresa", "company"].includes(normalized)) {
    errors.push("Esta versión solo permite importar inventario de empresa.");
  }
}

export async function parseInventoryImportFile(
  file: File,
): Promise<InventoryImportParseResult> {
  const extension = file.name.split(".").pop()?.toLocaleLowerCase("es");
  if (!extension || !["xlsx", "xls", "csv"].includes(extension)) {
    return { rows: [], fileErrors: ["Selecciona un archivo XLSX, XLS o CSV."] };
  }

  try {
    const XLSX = await import("xlsx");
    const fileContents =
      extension === "csv" ? await file.text() : await file.arrayBuffer();
    const workbook = XLSX.read(fileContents, {
      type: extension === "csv" ? "string" : "array",
      cellDates: false,
    });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return { rows: [], fileErrors: ["El archivo no contiene hojas para importar."] };
    }

    const matrix = XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets[firstSheetName],
      { header: 1, defval: "", raw: true, blankrows: false },
    );
    if (matrix.length === 0) {
      return { rows: [], fileErrors: ["El archivo está vacío."] };
    }

    const headerMap = new Map<HeaderKey, number>();
    matrix[0].forEach((header, index) => {
      const key = HEADER_ALIASES[normalizeHeader(header)];
      if (key && !headerMap.has(key)) headerMap.set(key, index);
    });

    const missingHeaders = [
      ["sku", "SKU"],
      ["name", "Producto"],
      ["initialStock", "Stock inicial"],
      ["minimumStock", "Stock mínimo"],
    ].filter(([key]) => !headerMap.has(key as HeaderKey));
    if (missingHeaders.length > 0) {
      return {
        rows: [],
        fileErrors: [
          `Faltan columnas obligatorias: ${missingHeaders.map(([, label]) => label).join(", ")}.`,
        ],
      };
    }

    const dataRows = matrix
      .slice(1)
      .map((cells, index) => ({ cells, rowNumber: index + 2 }))
      .filter(({ cells }) => cells.some((cell) => textValue(cell) !== ""));
    if (dataRows.length === 0) {
      return { rows: [], fileErrors: ["El archivo no contiene filas con datos."] };
    }
    if (dataRows.length > INVENTORY_IMPORT_MAX_ROWS) {
      return {
        rows: [],
        fileErrors: [
          `El archivo contiene ${dataRows.length} filas. El máximo permitido es ${INVENTORY_IMPORT_MAX_ROWS}.`,
        ],
      };
    }

    const valueAt = (cells: unknown[], key: HeaderKey) => {
      const index = headerMap.get(key);
      return index === undefined ? "" : cells[index];
    };
    const rows: ParsedInventoryImportRow[] = dataRows.map(
      ({ cells, rowNumber }) => {
        const errors: string[] = [];
        const sku = normalizeSku(textValue(valueAt(cells, "sku")));
        const importedName = textValue(valueAt(cells, "name"));
        if (!sku) {
          errors.push("SKU es obligatorio.");
        } else if (!/^[A-Z0-9][A-Z0-9._ -]*$/.test(sku)) {
          errors.push("SKU contiene caracteres no permitidos.");
        }
        validateOwner(valueAt(cells, "owner"), errors);
        const salePrice = parseOptionalPrice(
          valueAt(cells, "salePrice"),
          errors,
        );
        return {
          rowNumber,
          sku,
          importedName,
          initialStock: parseNonNegativeInteger(
            valueAt(cells, "initialStock"),
            "Stock inicial",
            errors,
          ),
          minimumStock: parseNonNegativeInteger(
            valueAt(cells, "minimumStock"),
            "Stock mínimo",
            errors,
          ),
          ...(textValue(valueAt(cells, "description"))
            ? { description: textValue(valueAt(cells, "description")) }
            : {}),
          ...(salePrice !== undefined ? { salePrice } : {}),
          active: parseActive(valueAt(cells, "active"), errors),
          errors,
        };
      },
    );

    const skuCounts = new Map<string, number>();
    for (const row of rows) {
      if (row.sku) skuCounts.set(row.sku, (skuCounts.get(row.sku) ?? 0) + 1);
    }
    for (const row of rows) {
      if (row.sku && (skuCounts.get(row.sku) ?? 0) > 1) {
        row.errors.push("SKU duplicado dentro del archivo.");
      }
    }

    return { rows, fileErrors: [] };
  } catch {
    return {
      rows: [],
      fileErrors: ["No se pudo leer el archivo. Verifica que no esté dañado."],
    };
  }
}

export function buildInventoryImportPreview(
  parsedRows: ParsedInventoryImportRow[],
  products: Product[],
  inventory: InventoryRecord[],
): InventoryImportPreviewRow[] {
  const productsBySku = new Map(
    products.map((product) => [normalizeSku(product.sku), product]),
  );
  const companyInventoryByProduct = new Map(
    inventory
      .filter(
        (record) =>
          record.ownerType === "company" && record.ownerId === "company",
      )
      .map((record) => [record.productId, record]),
  );

  return parsedRows.map((row) => {
    const product = productsBySku.get(row.sku);
    const record = product
      ? companyInventoryByProduct.get(product.id) ?? null
      : null;
    const errors = [...row.errors];
    const warnings: string[] = [];

    if (!product && !row.importedName) {
      errors.push("Producto es obligatorio para crear un producto nuevo.");
    }
    if (!product && !row.active) {
      errors.push("Un producto nuevo debe estar activo para inicializar inventario.");
    }
    if (product && !product.active) {
      errors.push("El producto existente está inactivo.");
    }
    if (!product) {
      warnings.push("Se creará con categoría Importado y costo S/ 0.00.");
    }

    const currentStock = record?.quantity ?? null;
    const difference =
      row.initialStock === null
        ? null
        : record
          ? row.initialStock - record.quantity
          : row.initialStock;

    return {
      ...row,
      id: `${row.rowNumber}-${row.sku || "sin-sku"}`,
      productState: product ? "existing" : "new",
      ...(product ? { productId: product.id } : {}),
      productName: product?.name ?? row.importedName,
      currentStock,
      currentMinimumStock: product?.minimumStock ?? null,
      difference,
      action: record ? "no_change" : "initialize",
      errors,
      warnings,
    };
  });
}

export async function downloadInventoryImportTemplate() {
  const XLSX = await import("xlsx");
  const inventorySheet = XLSX.utils.aoa_to_sheet([
    [
      "SKU",
      "Producto",
      "Stock inicial",
      "Stock mínimo",
      "Descripción",
      "Precio",
      "Estado",
    ],
    [
      "PROD-001",
      "Producto de ejemplo",
      10,
      3,
      "Producto demostrativo",
      20,
      "Activo",
    ],
  ]);
  inventorySheet["!cols"] = [
    { wch: 18 },
    { wch: 30 },
    { wch: 16 },
    { wch: 16 },
    { wch: 38 },
    { wch: 14 },
    { wch: 14 },
  ];
  inventorySheet["!autofilter"] = { ref: "A1:G2" };
  if (inventorySheet.C2) inventorySheet.C2.z = "0";
  if (inventorySheet.D2) inventorySheet.D2.z = "0";
  if (inventorySheet.F2) inventorySheet.F2.z = "0.00";

  const instructionsSheet = XLSX.utils.aoa_to_sheet([
    ["Instrucciones"],
    ["SKU obligatorio y único."],
    ["Producto obligatorio para productos nuevos."],
    ["Stock inicial >= 0."],
    ["Stock mínimo >= 0."],
    ["Descripción opcional."],
    ["Precio opcional."],
    ["Estado opcional."],
    ["Máximo 200 productos."],
    ["No cambiar nombres de encabezados."],
    ["Una fila = un producto."],
  ]);
  instructionsSheet["!cols"] = [{ wch: 62 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, inventorySheet, "Inventario");
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, "Instrucciones");
  const fileContents = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  });
  const url = URL.createObjectURL(
    new Blob([fileContents], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "plantilla-importacion-inventario.xlsx";
  anchor.click();
  URL.revokeObjectURL(url);
}
