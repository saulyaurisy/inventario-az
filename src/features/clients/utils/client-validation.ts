import type {
  Client,
  ClientDocumentType,
  ClientFormErrors,
  ClientFormValues,
  ClientInput,
} from "../types/client.types";

export const DOCUMENT_TYPE_LABELS: Record<ClientDocumentType, string> = {
  DNI: "DNI",
  RUC: "RUC",
  CE: "Carné de extranjería",
  OTHER: "Otro",
};

export const CLIENT_DOCUMENT_TYPES = Object.keys(
  DOCUMENT_TYPE_LABELS,
) as ClientDocumentType[];

export const EMPTY_CLIENT_FORM: ClientFormValues = {
  documentType: "DNI",
  documentNumber: "",
  name: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  active: true,
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOCUMENT_PATTERN = /^[A-Z0-9][A-Z0-9._ -]*$/;

export function normalizeDocumentNumber(value: string): string {
  const trimmed = value.trim();

  if (/^[\d\s]+$/.test(trimmed)) {
    return trimmed.replace(/\s+/g, "");
  }

  return trimmed.replace(/\s+/g, " ").toUpperCase();
}

export function buildClientDocumentKey(
  documentType: ClientDocumentType,
  documentNumber: string,
): string {
  return `${documentType}_${normalizeDocumentNumber(documentNumber)}`;
}

export function clientToFormValues(client: Client): ClientFormValues {
  return {
    documentType: client.documentType,
    documentNumber: client.documentNumber,
    name: client.name,
    phone: client.phone ?? "",
    email: client.email ?? "",
    address: client.address ?? "",
    notes: client.notes ?? "",
    active: client.active,
  };
}

type ClientValidationResult =
  | { valid: true; data: ClientInput; errors: ClientFormErrors }
  | { valid: false; errors: ClientFormErrors };

export function validateClientForm(
  values: ClientFormValues,
): ClientValidationResult {
  const errors: ClientFormErrors = {};
  const documentNumber = normalizeDocumentNumber(values.documentNumber);
  const name = values.name.trim();
  const email = values.email.trim().toLowerCase();

  if (!CLIENT_DOCUMENT_TYPES.includes(values.documentType)) {
    errors.documentType = "Selecciona un tipo de documento válido.";
  }

  if (!documentNumber) {
    errors.documentNumber = "Ingresa el número de documento.";
  } else if (!DOCUMENT_PATTERN.test(documentNumber)) {
    errors.documentNumber =
      "Usa letras, números, espacios, puntos, guiones o guiones bajos.";
  }

  if (!name) {
    errors.name = "Ingresa el nombre del cliente.";
  }

  if (email && !EMAIL_PATTERN.test(email)) {
    errors.email = "Ingresa un correo electrónico válido.";
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  const phone = values.phone.trim();
  const address = values.address.trim();
  const notes = values.notes.trim();

  return {
    valid: true,
    errors,
    data: {
      documentType: values.documentType,
      documentNumber,
      name,
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      ...(address ? { address } : {}),
      ...(notes ? { notes } : {}),
      active: values.active,
    },
  };
}
