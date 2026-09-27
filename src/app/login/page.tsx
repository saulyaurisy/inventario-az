import { LoginForm, PublicOnlyRoute } from "@/features/auth";

export default function LoginPage() {
  return (
    <PublicOnlyRoute>
      <main className="flex min-h-screen items-center justify-center p-6">
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">
            Acceso al sistema
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
            Iniciar sesión
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Ingresa con la cuenta creada por el administrador.
          </p>
          <LoginForm />
        </section>
      </main>
    </PublicOnlyRoute>
  );
}
