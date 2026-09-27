export function AuthLoading({ message = "Verificando sesión..." }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div
        aria-live="polite"
        className="flex items-center gap-3 text-sm font-medium text-slate-600"
        role="status"
      >
        <span className="size-5 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-700" />
        {message}
      </div>
    </main>
  );
}
