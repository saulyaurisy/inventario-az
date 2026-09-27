"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createProduct,
  getProductErrorMessage,
  listProducts,
  setProductActive,
  updateProduct,
} from "../services/products.service";
import type { Product, ProductInput } from "../types/product.types";
import { ProductDialog } from "./product-dialog";

type StatusFilter = "all" | "active" | "inactive";

const currencyFormatter = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? "inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800"
          : "inline-flex rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700"
      }
    >
      {active ? "Activo" : "Inactivo"}
    </span>
  );
}

interface ProductActionsProps {
  busy: boolean;
  onEdit: () => void;
  onToggle: () => void;
  product: Product;
}

function ProductActions({
  busy,
  onEdit,
  onToggle,
  product,
}: ProductActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-60"
        disabled={busy}
        onClick={onEdit}
        type="button"
      >
        Editar
      </button>
      <button
        className={
          product.active
            ? "rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 disabled:opacity-60"
            : "rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-60"
        }
        disabled={busy}
        onClick={onToggle}
        type="button"
      >
        {busy ? "Actualizando..." : product.active ? "Desactivar" : "Reactivar"}
      </button>
    </div>
  );
}

export function ProductsContent() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setProducts(await listProducts());
    } catch (error) {
      setLoadError(getProductErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    listProducts()
      .then((catalog) => {
        if (!ignore) {
          setProducts(catalog);
        }
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setLoadError(getProductErrorMessage(error));
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  const categories = useMemo(
    () =>
      [...new Set(products.map((product) => product.category))].sort((a, b) =>
        a.localeCompare(b, "es"),
      ),
    [products],
  );

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("es");

    return products.filter((product) => {
      const matchesSearch =
        !normalizedSearch ||
        product.sku.toLocaleLowerCase("es").includes(normalizedSearch) ||
        product.name.toLocaleLowerCase("es").includes(normalizedSearch);
      const matchesCategory = category === "all" || product.category === category;
      const matchesStatus =
        status === "all" ||
        (status === "active" ? product.active : !product.active);

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [category, products, search, status]);

  function openCreateDialog() {
    setEditingProduct(null);
    setFeedback(null);
    setDialogOpen(true);
  }

  function openEditDialog(product: Product) {
    setEditingProduct(product);
    setFeedback(null);
    setDialogOpen(true);
  }

  async function handleSave(input: ProductInput) {
    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, input);
        setFeedback("Producto actualizado correctamente.");
      } else {
        await createProduct(input);
        setFeedback("Producto creado correctamente.");
      }
      setDialogOpen(false);
      setEditingProduct(null);
      await loadCatalog();
    } catch (error) {
      throw new Error(getProductErrorMessage(error));
    }
  }

  async function handleToggle(product: Product) {
    setBusyProductId(product.id);
    setFeedback(null);
    try {
      await setProductActive(product.id, !product.active);
      setFeedback(
        product.active
          ? "Producto desactivado correctamente."
          : "Producto reactivado correctamente.",
      );
      await loadCatalog();
    } catch (error) {
      setFeedback(getProductErrorMessage(error));
    } finally {
      setBusyProductId(null);
    }
  }

  return (
    <section aria-labelledby="products-title">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-5 border-b border-slate-100 bg-gradient-to-br from-white to-emerald-50/70 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Catálogo
            </p>
            <h2
              className="mt-2 text-3xl font-bold tracking-tight text-slate-950"
              id="products-title"
            >
              Productos
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Administra la información comercial del catálogo. El stock actual se
              controlará desde inventario.
            </p>
          </div>
          <button
            className="inline-flex items-center justify-center rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
            onClick={openCreateDialog}
            type="button"
          >
            + Nuevo producto
          </button>
        </div>

        <div className="space-y-6 p-5 sm:p-8">
          <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <label className="text-sm font-semibold text-slate-800" htmlFor="product-search">
                Buscar
              </label>
              <input
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                id="product-search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="SKU o nombre"
                type="search"
                value={search}
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-800" htmlFor="category-filter">
                Categoría
              </label>
              <select
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                id="category-filter"
                onChange={(event) => setCategory(event.target.value)}
                value={category}
              >
                <option value="all">Todas</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-800" htmlFor="status-filter">
                Estado
              </label>
              <select
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                id="status-filter"
                onChange={(event) => setStatus(event.target.value as StatusFilter)}
                value={status}
              >
                <option value="all">Todos</option>
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
              </select>
            </div>
          </div>

          <div aria-live="polite">
            {feedback ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
                {feedback}
              </p>
            ) : null}
          </div>

          {loading ? (
            <div className="flex min-h-48 items-center justify-center text-sm font-medium text-slate-600">
              Cargando productos...
            </div>
          ) : loadError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center" role="alert">
              <p className="font-semibold text-red-900">No se pudo cargar el catálogo.</p>
              <p className="mt-1 text-sm text-red-800">{loadError}</p>
              <button
                className="mt-4 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                onClick={() => void loadCatalog()}
                type="button"
              >
                Reintentar
              </button>
            </div>
          ) : products.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
              <p className="font-semibold text-slate-900">Todavía no hay productos registrados.</p>
              <p className="mt-1 text-sm text-slate-500">Crea el primer producto del catálogo.</p>
              <button
                className="mt-5 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                onClick={openCreateDialog}
                type="button"
              >
                Crear primer producto
              </button>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
              <p className="font-semibold text-slate-900">No hay productos que coincidan.</p>
              <p className="mt-1 text-sm text-slate-500">Prueba con otros filtros o términos de búsqueda.</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-500">
                {filteredProducts.length} {filteredProducts.length === 1 ? "producto" : "productos"}
              </p>

              <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 lg:block">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold" scope="col">Producto</th>
                      <th className="px-4 py-3 font-semibold" scope="col">Categoría</th>
                      <th className="px-4 py-3 font-semibold" scope="col">Costo</th>
                      <th className="px-4 py-3 font-semibold" scope="col">Venta</th>
                      <th className="px-4 py-3 font-semibold" scope="col">Stock mínimo</th>
                      <th className="px-4 py-3 font-semibold" scope="col">Estado</th>
                      <th className="px-4 py-3 font-semibold" scope="col">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredProducts.map((product) => (
                      <tr key={product.id}>
                        <td className="px-4 py-4">
                          <p className="font-semibold text-slate-950">{product.name}</p>
                          <p className="mt-1 font-mono text-xs text-slate-500">{product.sku}</p>
                        </td>
                        <td className="px-4 py-4 text-slate-700">{product.category}</td>
                        <td className="px-4 py-4 text-slate-700">{currencyFormatter.format(product.costPrice)}</td>
                        <td className="px-4 py-4 font-semibold text-slate-900">{currencyFormatter.format(product.salePrice)}</td>
                        <td className="px-4 py-4 text-slate-700">{product.minimumStock}</td>
                        <td className="px-4 py-4"><StatusBadge active={product.active} /></td>
                        <td className="px-4 py-4">
                          <ProductActions
                            busy={busyProductId === product.id}
                            onEdit={() => openEditDialog(product)}
                            onToggle={() => void handleToggle(product)}
                            product={product}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-4 lg:hidden">
                {filteredProducts.map((product) => (
                  <article className="rounded-2xl border border-slate-200 p-4 shadow-sm" key={product.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-slate-950">{product.name}</h3>
                        <p className="mt-1 font-mono text-xs text-slate-500">{product.sku}</p>
                      </div>
                      <StatusBadge active={product.active} />
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-xs text-slate-500">Categoría</dt>
                        <dd className="mt-1 font-medium text-slate-800">{product.category}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Stock mínimo</dt>
                        <dd className="mt-1 font-medium text-slate-800">{product.minimumStock}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Costo</dt>
                        <dd className="mt-1 font-medium text-slate-800">{currencyFormatter.format(product.costPrice)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Venta</dt>
                        <dd className="mt-1 font-bold text-slate-950">{currencyFormatter.format(product.salePrice)}</dd>
                      </div>
                    </dl>
                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <ProductActions
                        busy={busyProductId === product.id}
                        onEdit={() => openEditDialog(product)}
                        onToggle={() => void handleToggle(product)}
                        product={product}
                      />
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {dialogOpen ? (
        <ProductDialog
          key={editingProduct?.id ?? "new-product"}
          onClose={() => setDialogOpen(false)}
          onSubmit={handleSave}
          product={editingProduct}
        />
      ) : null}
    </section>
  );
}
