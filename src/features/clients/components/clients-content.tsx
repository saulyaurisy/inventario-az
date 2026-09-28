"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth";

import {
  createClient,
  getClientErrorMessage,
  listClients,
  setClientActive,
  updateClient,
} from "../services/clients.service";
import type { Client, ClientInput } from "../types/client.types";
import { DOCUMENT_TYPE_LABELS } from "../utils/client-validation";
import { ClientDetailDialog } from "./client-detail-dialog";
import { ClientDialog } from "./client-dialog";

type StatusFilter = "all" | "active" | "inactive";
type Feedback = { message: string; type: "success" | "error" };

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={active ? "inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800" : "inline-flex rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700"}>
      {active ? "Activo" : "Inactivo"}
    </span>
  );
}

interface ClientActionsProps {
  busy: boolean;
  client: Client;
  onDetail: () => void;
  onEdit: () => void;
  onToggle: () => void;
}

function ClientActions({ busy, client, onDetail, onEdit, onToggle }: ClientActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-60" disabled={busy} onClick={onDetail} type="button">
        Ver detalle
      </button>
      <button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-60" disabled={busy} onClick={onEdit} type="button">
        Editar
      </button>
      <button className={client.active ? "rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 disabled:opacity-60" : "rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-60"} disabled={busy} onClick={onToggle} type="button">
        {busy ? "Actualizando..." : client.active ? "Desactivar" : "Reactivar"}
      </button>
    </div>
  );
}

export function ClientsContent() {
  const { profile, user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [detailClient, setDetailClient] = useState<Client | null>(null);
  const [busyClientId, setBusyClientId] = useState<string | null>(null);

  const loadDirectory = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setClients(await listClients());
    } catch (error) {
      setLoadError(getClientErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    listClients()
      .then((directory) => {
        if (!ignore) setClients(directory);
      })
      .catch((error: unknown) => {
        if (!ignore) setLoadError(getClientErrorMessage(error));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const filteredClients = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");

    return clients.filter((client) => {
      const matchesSearch =
        !term ||
        client.name.toLocaleLowerCase("es").includes(term) ||
        client.normalizedDocumentNumber.toLocaleLowerCase("es").includes(term) ||
        client.phone?.toLocaleLowerCase("es").includes(term);
      const matchesStatus =
        status === "all" ||
        (status === "active" ? client.active : !client.active);

      return Boolean(matchesSearch && matchesStatus);
    });
  }, [clients, search, status]);

  function openCreateDialog() {
    setEditingClient(null);
    setFeedback(null);
    setDialogOpen(true);
  }

  function openEditDialog(client: Client) {
    setEditingClient(client);
    setFeedback(null);
    setDialogOpen(true);
  }

  async function handleSave(input: ClientInput) {
    if (!user) throw new Error("Tu sesión ya no está disponible.");

    try {
      if (editingClient) {
        await updateClient(editingClient.id, input, user.uid);
        setFeedback({ message: "Cliente actualizado correctamente.", type: "success" });
      } else {
        await createClient(input, user.uid);
        setFeedback({ message: "Cliente creado correctamente.", type: "success" });
      }
      setDialogOpen(false);
      setEditingClient(null);
      await loadDirectory();
    } catch (error) {
      throw new Error(getClientErrorMessage(error));
    }
  }

  async function handleToggle(client: Client) {
    if (!user) return;

    setBusyClientId(client.id);
    setFeedback(null);
    try {
      await setClientActive(client.id, !client.active, user.uid);
      setFeedback({
        message: client.active ? "Cliente desactivado correctamente." : "Cliente reactivado correctamente.",
        type: "success",
      });
      await loadDirectory();
    } catch (error) {
      setFeedback({ message: getClientErrorMessage(error), type: "error" });
    } finally {
      setBusyClientId(null);
    }
  }

  return (
    <section aria-labelledby="clients-title">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-5 border-b border-slate-100 bg-gradient-to-br from-white to-emerald-50/70 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Directorio</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950" id="clients-title">Clientes</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Gestiona los datos de contacto y consulta el detalle básico de cada cliente.
            </p>
          </div>
          <button className="inline-flex items-center justify-center rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2" onClick={openCreateDialog} type="button">
            + Nuevo cliente
          </button>
        </div>

        <div className="space-y-6 p-5 sm:p-8">
          <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div>
              <label className="text-sm font-semibold text-slate-800" htmlFor="client-search">Buscar</label>
              <input className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" id="client-search" onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, documento o teléfono" type="search" value={search} />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-800" htmlFor="client-status-filter">Estado</label>
              <select className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" id="client-status-filter" onChange={(event) => setStatus(event.target.value as StatusFilter)} value={status}>
                <option value="all">Todos</option>
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
              </select>
            </div>
          </div>

          <div aria-live="polite">
            {feedback ? (
              <p className={feedback.type === "success" ? "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900" : "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900"}>{feedback.message}</p>
            ) : null}
          </div>

          {loading ? (
            <div className="flex min-h-48 items-center justify-center text-sm font-medium text-slate-600">Cargando clientes...</div>
          ) : loadError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center" role="alert">
              <p className="font-semibold text-red-900">No se pudo cargar el directorio.</p>
              <p className="mt-1 text-sm text-red-800">{loadError}</p>
              <button className="mt-4 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600" onClick={() => void loadDirectory()} type="button">Reintentar</button>
            </div>
          ) : clients.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
              <p className="font-semibold text-slate-900">Todavía no hay clientes registrados.</p>
              <p className="mt-1 text-sm text-slate-500">Crea el primer cliente del directorio.</p>
              <button className="mt-5 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" onClick={openCreateDialog} type="button">Crear primer cliente</button>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
              <p className="font-semibold text-slate-900">No hay clientes que coincidan.</p>
              <p className="mt-1 text-sm text-slate-500">Prueba con otra búsqueda o estado.</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-500">{filteredClients.length} {filteredClients.length === 1 ? "cliente" : "clientes"}</p>
              <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 lg:block">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold" scope="col">Documento</th>
                      <th className="px-4 py-3 font-semibold" scope="col">Nombre</th>
                      <th className="px-4 py-3 font-semibold" scope="col">Teléfono</th>
                      <th className="px-4 py-3 font-semibold" scope="col">Email</th>
                      <th className="px-4 py-3 font-semibold" scope="col">Estado</th>
                      <th className="px-4 py-3 font-semibold" scope="col">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredClients.map((client) => (
                      <tr key={client.id}>
                        <td className="px-4 py-4 font-mono text-xs text-slate-600">{DOCUMENT_TYPE_LABELS[client.documentType]} {client.documentNumber}</td>
                        <td className="px-4 py-4 font-semibold text-slate-950">{client.name}</td>
                        <td className="px-4 py-4 text-slate-700">{client.phone || "—"}</td>
                        <td className="px-4 py-4 text-slate-700">{client.email || "—"}</td>
                        <td className="px-4 py-4"><StatusBadge active={client.active} /></td>
                        <td className="px-4 py-4">
                          <ClientActions busy={busyClientId === client.id} client={client} onDetail={() => setDetailClient(client)} onEdit={() => openEditDialog(client)} onToggle={() => void handleToggle(client)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-4 lg:hidden">
                {filteredClients.map((client) => (
                  <article className="rounded-2xl border border-slate-200 p-4 shadow-sm" key={client.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-slate-950">{client.name}</h3>
                        <p className="mt-1 font-mono text-xs text-slate-500">{DOCUMENT_TYPE_LABELS[client.documentType]} {client.documentNumber}</p>
                      </div>
                      <StatusBadge active={client.active} />
                    </div>
                    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <div><dt className="text-xs text-slate-500">Teléfono</dt><dd className="mt-1 break-words font-medium text-slate-800">{client.phone || "No registrado"}</dd></div>
                      <div><dt className="text-xs text-slate-500">Email</dt><dd className="mt-1 break-words font-medium text-slate-800">{client.email || "No registrado"}</dd></div>
                    </dl>
                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <ClientActions busy={busyClientId === client.id} client={client} onDetail={() => setDetailClient(client)} onEdit={() => openEditDialog(client)} onToggle={() => void handleToggle(client)} />
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {dialogOpen ? <ClientDialog key={editingClient?.id ?? "new-client"} client={editingClient} onClose={() => setDialogOpen(false)} onSubmit={handleSave} /> : null}
      {detailClient && profile && user ? <ClientDetailDialog actorLabel={profile.displayName} actorUid={user.uid} client={detailClient} onClose={() => setDetailClient(null)} role={profile.role} /> : null}
    </section>
  );
}
