"use client";

import { type FormEvent, useState } from "react";

import { useAuth } from "../hooks/use-auth";

type FormErrors = {
  email?: string;
  password?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateForm(email: string, password: string): FormErrors {
  const errors: FormErrors = {};

  if (!email.trim()) {
    errors.email = "Ingresa tu correo electrónico.";
  } else if (!EMAIL_PATTERN.test(email.trim())) {
    errors.email = "Ingresa un correo electrónico válido.";
  }

  if (!password) {
    errors.password = "Ingresa tu contraseña.";
  }

  return errors;
}

export function LoginForm() {
  const { clearError, error, loading, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) {
      return;
    }

    const validationErrors = validateForm(email, password);
    setFormErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    await signIn(email.trim(), password);
  }

  function handleEmailChange(value: string) {
    setEmail(value);
    setFormErrors((currentErrors) => ({
      ...currentErrors,
      email: undefined,
    }));
    clearError();
  }

  function handlePasswordChange(value: string) {
    setPassword(value);
    setFormErrors((currentErrors) => ({
      ...currentErrors,
      password: undefined,
    }));
    clearError();
  }

  return (
    <form className="mt-7 space-y-5" noValidate onSubmit={handleSubmit}>
      <div>
        <label className="text-sm font-medium text-slate-800" htmlFor="email">
          Correo electrónico
        </label>
        <input
          aria-describedby={formErrors.email ? "email-error" : undefined}
          aria-invalid={Boolean(formErrors.email)}
          autoComplete="email"
          className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
          disabled={loading}
          id="email"
          name="email"
          onChange={(event) => handleEmailChange(event.target.value)}
          placeholder="nombre@empresa.com"
          type="email"
          value={email}
        />
        {formErrors.email ? (
          <p className="mt-1.5 text-sm text-red-700" id="email-error">
            {formErrors.email}
          </p>
        ) : null}
      </div>

      <div>
        <label
          className="text-sm font-medium text-slate-800"
          htmlFor="password"
        >
          Contraseña
        </label>
        <input
          aria-describedby={
            formErrors.password ? "password-error" : undefined
          }
          aria-invalid={Boolean(formErrors.password)}
          autoComplete="current-password"
          className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
          disabled={loading}
          id="password"
          name="password"
          onChange={(event) => handlePasswordChange(event.target.value)}
          type="password"
          value={password}
        />
        {formErrors.password ? (
          <p className="mt-1.5 text-sm text-red-700" id="password-error">
            {formErrors.password}
          </p>
        ) : null}
      </div>

      {error ? (
        <div
          aria-live="polite"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <button
        className="flex min-h-11 w-full items-center justify-center rounded-lg bg-emerald-700 px-4 py-2.5 font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={loading}
        type="submit"
      >
        {loading ? "Iniciando sesión..." : "Iniciar sesión"}
      </button>
    </form>
  );
}
