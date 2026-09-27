# Sistema de ventas e inventario

Aplicación modular de ventas e inventario construida con Next.js, TypeScript, Tailwind CSS y Firebase.

Actualmente incluye autenticación con email y contraseña, perfiles almacenados en Firestore, roles `admin` y `agent`, control de usuarios activos, sesión persistente, layout autenticado, gestión del catálogo de productos y directorio de clientes. Los módulos de inventario, Kardex, reposiciones, ventas y reportes todavía no están implementados.

## Requisitos

- Node.js 20.9 o una versión posterior compatible con Next.js 16.
- npm 10 o posterior.
- Un proyecto creado en [Firebase Console](https://console.firebase.google.com/).

## Instalación

1. Clona el repositorio y entra en su directorio.
2. Instala las dependencias:

   ```bash
   npm install
   ```

3. Copia el archivo de variables de entorno:

   En macOS o Linux:

   ```bash
   cp .env.example .env.local
   ```

   En PowerShell:

   ```powershell
   Copy-Item .env.example .env.local
   ```

## Configuración de Firebase

1. Crea o selecciona un proyecto en Firebase Console.
2. Registra una aplicación web desde la configuración del proyecto.
3. Habilita los servicios que utilizará el sistema:
   - Authentication y el proveedor **Correo electrónico/Contraseña**. Este proveedor también puede aplicarse desde `firebase.json` con `firebase deploy --only auth`.
   - Cloud Firestore.
   - Storage.
4. Completa `.env.local` con los valores de la configuración web entregada por Firebase:

   ```dotenv
   NEXT_PUBLIC_FIREBASE_API_KEY=
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
   NEXT_PUBLIC_FIREBASE_APP_ID=

   TEST_ADMIN_EMAIL=
   TEST_ADMIN_PASSWORD=
   TEST_AGENT_EMAIL=
   TEST_AGENT_PASSWORD=
   ```

No guardes `.env.local` en el control de versiones. Las credenciales públicas de configuración se leen exclusivamente desde variables de entorno.

> Desde el 3 de febrero de 2026, Firebase exige el plan Blaze para aprovisionar y usar un bucket de Cloud Storage for Firebase. La integración del SDK puede quedar configurada mediante `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, pero el bucket no existirá hasta vincular una cuenta de facturación y crearlo desde Firebase. Authentication y Firestore pueden mantenerse en el plan Spark.

Las variables `TEST_*` son privadas y se reservan para pruebas E2E locales. No deben llevar el prefijo `NEXT_PUBLIC_`, imprimirse en consola ni incorporarse al repositorio con valores reales.

El módulo central `src/lib/firebase/index.ts` inicializa la aplicación Firebase una sola vez y exporta:

- `firebaseApp`: instancia principal de Firebase.
- `getFirebaseAuth()`: instancia diferida de Firebase Authentication.
- `getFirebaseDb()`: instancia diferida de Cloud Firestore.
- `getFirebaseStorage()`: instancia diferida de Firebase Storage.

Los getters evitan inicializar SDKs dependientes del navegador durante el prerender de Next.js.

Ejemplo de importación para futuras funcionalidades:

```ts
import {
  getFirebaseAuth,
  getFirebaseDb,
  getFirebaseStorage,
} from "@/lib/firebase";
```

## Usuarios y roles

Los usuarios se crean manualmente; la aplicación no permite registro público.

1. Abre **Firebase Console → Authentication → Users**.
2. Selecciona **Add user** y registra el correo y la contraseña.
3. Copia el UID generado por Firebase Authentication.
4. Abre **Firestore Database → Data** y crea la colección `users` si todavía no existe.
5. Crea un documento cuyo ID sea exactamente el UID copiado.
6. Agrega estos campos:

   | Campo | Tipo Firestore | Ejemplo |
   | --- | --- | --- |
   | `uid` | string | El mismo UID del documento |
   | `email` | string | `admin@empresa.com` |
   | `displayName` | string | `Administrador` |
   | `role` | string | `admin` o `agent` |
   | `active` | boolean | `true` |
   | `createdAt` | timestamp | Fecha y hora actuales |
   | `updatedAt` | timestamp | Fecha y hora actuales |

Ejemplo para un administrador:

```text
users/{UID_DEL_ADMIN}
  uid: "UID_DEL_ADMIN"
  email: "admin@empresa.com"
  displayName: "Administrador"
  role: "admin"
  active: true
  createdAt: Timestamp
  updatedAt: Timestamp
```

Para crear un agente, repite el proceso usando `role: "agent"`. Para comprobar el rechazo de una cuenta inactiva, cambia `active` a `false`.

El archivo `firestore.rules` permite a cada usuario autenticado leer exclusivamente su propio perfil y bloquea las escrituras de perfiles desde el cliente. Para productos, los administradores pueden leer y escribir y los agentes solo pueden leer. En clientes, administradores y agentes autenticados pueden leer y escribir. El acceso anónimo queda bloqueado. Los perfiles deben administrarse desde Firebase Console o desde un backend confiable con Firebase Admin SDK. Publica estas reglas con Firebase CLI desde un proyecto vinculado:

```bash
firebase deploy --only firestore:rules
```

La configuración declarativa de Authentication se encuentra en `firebase.json`. Para desplegar Authentication y las reglas de Firestore en una sola ejecución:

```bash
firebase deploy --only auth,firestore:rules
```

## Flujo de autenticación

- `/login` autentica mediante Firebase Authentication.
- El provider global observa la sesión y consulta `users/{uid}`.
- Un perfil ausente, inválido o inactivo provoca cierre de sesión inmediato.
- `/dashboard` no muestra contenido hasta terminar la validación de Auth y Firestore.
- La persistencia local de Firebase conserva la sesión después de recargar.
- Los helpers `hasRole`, `isAdmin` e `isAgent` centralizan la comprobación de roles.

## Gestión de productos

- La ruta `/products` está disponible únicamente para administradores.
- El módulo permite crear, editar, buscar, filtrar, desactivar y reactivar productos; no realiza borrado físico.
- El SKU se normaliza eliminando espacios externos y convirtiéndolo a mayúsculas.
- La unicidad se garantiza atómicamente mediante `product_skus/{SKU_NORMALIZADO}` junto con el documento `products/{productId}`.
- Los cambios de SKU crean el nuevo índice y eliminan el anterior dentro de la misma transacción.
- El producto contiene `minimumStock`, pero no contiene stock actual. Las existencias se incorporarán en el módulo de inventario.

## Gestión de clientes

- La ruta `/clients` está disponible para administradores y agentes activos.
- Permite crear, editar, buscar, consultar detalle, desactivar y reactivar clientes; no realiza borrado físico.
- La unicidad se garantiza por la combinación tipo + documento mediante `client_documents/{TIPO_DOCUMENTO_NORMALIZADO}`.
- Los números puramente numéricos eliminan espacios internos; otros documentos se recortan, compactan espacios y normalizan a mayúsculas.
- DNI y CE con el mismo número se consideran identidades distintas porque el tipo forma parte de la clave.
- `createdBy` y `updatedBy` registran el UID autenticado, y los timestamps provienen del servidor.
- El detalle incluye una sección visual preparada para historial de compras, sin consultar ni crear ventas.

## Ejecución

Inicia el servidor de desarrollo:

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en el navegador.

Para generar y ejecutar una compilación de producción:

```bash
npm run build
npm run start
```

## Validaciones

Ejecuta el lint:

```bash
npm run lint
```

Valida TypeScript sin generar archivos:

```bash
npm run typecheck
```

## Estructura

```text
src/
  app/                    Rutas, layout y estilos globales de Next.js
  components/             Componentes compartidos
  features/
    auth/
      components/        Formulario y guards de rutas
      context/           Auth Provider y contexto global
      hooks/             Hook useAuth
      services/          Auth y lectura del perfil Firestore
      types/             Estado, perfil y roles
      utils/             Mensajes de error y helpers de roles
    products/             Productos
    clients/              Clientes
    inventory/            Inventario
    kardex/               Kardex
    replenishments/       Reposiciones
    sales/                Ventas
    reports/              Reportes
  lib/
    firebase/             Configuración e instancias centrales de Firebase
    utils/                Utilidades reutilizables
  types/                  Tipos compartidos
```
