import Link from "next/link";

const configuredModules = [
  "Autenticación",
  "Productos",
  "Clientes",
  "Inventario",
  "Kardex",
  "Reposiciones",
  "Ventas",
  "Reportes",
];

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">
          Configuración inicial completada
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
          Sistema de ventas e inventario
        </h1>
        <p className="mt-4 leading-7 text-slate-600">
          La aplicación está funcionando y la base modular está lista para las
          siguientes etapas del proyecto.
        </p>

        <Link
          className="mt-6 inline-flex rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2"
          href="/login"
        >
          Ir a iniciar sesión
        </Link>

        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {configuredModules.map((module) => (
            <li
              className="rounded-lg bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"
              key={module}
            >
              {module}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
