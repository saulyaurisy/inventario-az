import Image from "next/image";

import { LoginForm, PublicOnlyRoute } from "@/features/auth";

export default function LoginPage() {
  return (
    <PublicOnlyRoute>
      <main className="grid min-h-[100dvh] bg-[#f3f6f4] lg:grid-cols-[minmax(20rem,0.8fr)_minmax(30rem,1.2fr)]">
        <section className="hidden flex-col justify-between bg-[#13251d] p-10 text-white lg:flex xl:p-14">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-24 items-center rounded-lg bg-white px-2"><Image alt="Azbel" className="h-auto w-full" height={718} priority src="/brand/azbel-logo.png" width={1900} /></div>
            <div><p className="font-semibold">Inventario AZ</p><p className="text-xs text-emerald-100/55">Operación comercial</p></div>
          </div>
          <div className="max-w-md">
            <p className="text-3xl font-semibold leading-tight tracking-[-0.04em] xl:text-4xl">Control claro para cada movimiento de tu operación.</p>
            <p className="mt-4 text-sm leading-6 text-emerald-50/65">Ventas, inventario y abastecimiento conectados con trazabilidad por rol.</p>
          </div>
          <div className="text-xs leading-5 text-emerald-100/45"><p>Sistema interno de gestión</p><p>Desarrollado por Saúl Yauri · <a className="hover:text-white" href="https://www.instagram.com/syxnb.10" rel="noopener noreferrer" target="_blank">Instagram</a> · <a className="hover:text-white" href="https://wa.me/51961407627" rel="noopener noreferrer" target="_blank">WhatsApp</a></p></div>
        </section>
        <section className="flex items-center justify-center p-5 sm:p-8">
          <div className="w-full max-w-md rounded-[1.125rem] border border-[#dce5df] bg-white p-6 shadow-[0_1px_2px_rgb(18_55_37_/_0.04),0_18px_48px_rgb(18_55_37_/_0.08)] sm:p-8">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="flex h-10 w-20 items-center rounded-lg border border-slate-200 bg-white px-2"><Image alt="Azbel" className="h-auto w-full" height={718} priority src="/brand/azbel-logo.png" width={1900} /></div>
              <p className="font-semibold text-slate-900">Inventario AZ</p>
            </div>
            <p className="text-xs font-semibold text-emerald-700">Acceso seguro</p>
            <h1 className="mt-2 text-3xl font-bold tracking-[-0.04em] text-slate-950">Iniciar sesión</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Ingresa con la cuenta creada por el administrador.</p>
            <LoginForm />
          </div>
        </section>
      </main>
    </PublicOnlyRoute>
  );
}
