# Sistema de ventas e inventario

Aplicación modular de ventas e inventario construida con Next.js, TypeScript, Tailwind CSS y Firebase.

Actualmente incluye autenticación con email y contraseña, perfiles almacenados en Firestore, roles `admin` y `agent`, control de usuarios activos, sesión persistente, layout autenticado, productos, clientes, inventario, Kardex, reposiciones, ventas, proveedores, compras, comprobantes de pago y dashboard operativo. El módulo de reportes todavía no está implementado.

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
- El detalle integra el historial real de ventas visible para el rol autenticado, con número, fecha, total, estado y agente.

## Inventario

- La fuente de verdad del stock es `inventory`; los documentos de `products` continúan sin cantidades.
- Cada registro usa el ID determinístico `ownerType__ownerId__productId` y guarda `lastMovementId`.
- El stock inicial y cada ajuste se confirman en una transacción que también crea exactamente un documento inmutable en `inventory_movements`.
- Las reglas cruzan `lastMovementId`, cantidades anterior/posterior, producto, propietario y autor para impedir escrituras directas de `quantity` o movimientos sueltos.
- Solo el administrador puede inicializar o ajustar stock. Los agentes consultan únicamente sus propios registros y no pueden escribir.
- La inicialización exige un producto activo y, para stock de agente, un perfil activo con rol `agent`. Los ajustes posteriores permiten correcciones históricas aunque el producto se desactive.
- Las salidas nunca pueden dejar cantidad negativa y todas las cantidades se manejan como enteros positivos.
- Los movimientos recientes también alimentan el módulo Kardex; no se implementan ventas, compras, devoluciones ni transferencias entre agentes.

## Kardex

- La ruta `/kardex` es una vista estrictamente de consulta sobre `inventory_movements`; no existe una colección paralela ni operaciones de escritura.
- El administrador consulta movimientos de empresa y agentes. Cada agente consulta únicamente los movimientos cuyo propietario coincide con su UID.
- Productos, propietarios y creadores se resuelven en memoria desde `products` y `users`, con etiquetas seguras cuando las reglas no permiten resolver otro perfil.
- Incluye búsqueda, filtros por producto, propietario, tipo y rango de fechas, resumen del período filtrado y detalle inmutable de cada movimiento.
- La consulta administrativa se limita inicialmente a los 250 movimientos más recientes. Para agentes se aplican los filtros de propietario exigidos por las reglas antes de descargar datos.
- Los tipos de movimiento se presentan mediante helpers extensibles para incorporar futuros orígenes sin duplicar la fuente histórica.

## Reposiciones

- La ruta `/replenishments` gestiona el flujo `Pendiente → Enviada → Recibida`; una reposición pendiente también puede cancelarse.
- Solo el administrador crea, edita, cancela y envía. El agente consulta exclusivamente sus reposiciones y confirma la recepción de las que le corresponden.
- Crear, editar o cancelar no modifica existencias. Enviar descuenta stock de empresa y crea movimientos `replenishment_out`; recibir aumenta stock del agente y crea movimientos `replenishment_in`.
- Cada transición de stock se ejecuta en una única transacción de Firestore y usa identificadores determinísticos de movimiento, por lo que los reintentos y la doble confirmación no duplican cantidades ni historial.
- `inventory` e `inventory_movements` continúan siendo las únicas fuentes de stock e historial. Las reposiciones no guardan cantidades paralelas fuera de sus ítems planificados.
- Para mantener la recepción segura en el cliente bajo los límites de evaluación de reglas de Firestore, cada reposición admite entre 1 y 3 productos distintos. No requiere Functions, backend adicional ni plan Blaze.

> Nota técnica: máximo seguro de 3 productos por reposición con las reglas Firestore actuales.

## Ventas

- La ruta `/sales` permite a cada agente registrar ventas exclusivamente contra su propio inventario y consultar sus operaciones. El administrador dispone de consulta global y filtros, pero no registra ventas.
- Cliente y productos deben estar activos. La venta, el descuento de existencias y un movimiento `sale` por producto se confirman en una única transacción; si una línea no tiene stock suficiente, no se escribe ningún cambio.
- Los importes monetarios históricos se guardan en céntimos enteros. Cada ítem conserva snapshots de SKU, nombre, precio de venta y costo, por lo que los cambios posteriores del catálogo no alteran la venta.
- El servicio recalcula subtotales, descuentos y total. El descuento efectivo total de un agente, combinando descuentos por línea y global, no puede superar el 35% del subtotal original; las reglas vuelven a comprobar precio, totales, propietario, movimiento y stock no negativo.
- Los identificadores determinísticos de operación y movimiento hacen idempotente el reintento de una misma venta. `inventory` e `inventory_movements` siguen siendo las únicas fuentes de stock e historial.
- Para operar con seguridad desde el SDK web sin permisos generales sobre inventario, `sale_intents/{operationId}` conserva un candidato inmutable y sin efecto en stock. La transacción final lo consume, crea la venta, actualiza todos los stocks y registra todos los movimientos de una sola vez. Un intento preparado no es una venta y puede quedar pendiente si la operación se rechaza.
- Por el límite de lecturas de seguridad de Firestore, cada venta admite de 1 a 3 productos distintos. El número se reserva mediante `system_counters/sales`; sigue siendo único y creciente, aunque puede tener huecos si una venta preparada finalmente falla. Esta implementación no incluye anulación de ventas ni movimientos de retorno.

> Nota técnica: máximo seguro de 3 productos por venta con las reglas Firestore actuales.

## Comprobantes de pago

- `sale_payment_proofs/{saleId}` conserva únicamente metadata y referencias de evidencia de pago. El ID determinístico limita el MVP a un comprobante activo por venta y evita una colección de unicidad adicional.
- El agente registra o corrige el comprobante de una venta propia; `agentId`, `clientId`, `paymentMethod` y `amount` se copian de la venta y se validan nuevamente en Firestore Rules. El formulario no permite introducirlos.
- El administrador puede verificar o rechazar con un motivo obligatorio. Un comprobante verificado queda inmutable; uno rechazado puede ser corregido por su agente y volver a estado `provided`.
- Si una venta está anulada, el comprobante existente sigue visible para auditoría, pero no se permite crear, corregir, verificar ni rechazar. La ausencia de comprobante nunca bloquea una venta.
- La prueba dinámica sobre una venta anulada no se ejecutó por falta de un fixture real; las reglas de Firestore y la interfaz bloquean nuevas acciones sobre comprobantes en ese estado.
- Las URL externas son opcionales, deben usar HTTPS y se muestran como enlaces explícitos; no se descargan ni se incrustan. No se usa Firebase Storage, archivos binarios, Cloud Functions, Blaze ni facturación.

## Proveedores y compras

- `/suppliers` y `/purchases` son módulos administrativos separados e integrados. Los proveedores se desactivan sin borrado físico.
- Crear o editar un borrador no modifica stock. Recibir una compra incrementa exclusivamente inventario de empresa y crea un movimiento inmutable `purchase_in` por producto en una sola transacción.
- Los costos se guardan históricamente en céntimos dentro de la compra. La recepción no modifica automáticamente `product.costPrice`, porque la valoración o costo promedio queda fuera del alcance.
- Los movimientos usan IDs determinísticos `purchase__{purchaseId}__{productId}`. Una compra recibida queda inmutable y no puede recibirse de nuevo.
- La numeración `C-000001` usa `system_counters/purchases`; se reserva antes de crear el borrador y permanece estable. Puede dejar huecos si la validación posterior del borrador falla, sin afectar stock ni movimientos.

> Nota técnica: actualmente se soporta la recepción segura de compras de 1 producto. La UI permite preparar borradores de hasta 3 productos, pero la recepción multi-producto queda pendiente de una operación backend privilegiada, como Admin SDK o Cloud Functions, porque las validaciones cruzadas superan el límite de accesos documentales de Firestore Security Rules. Esta limitación conserva la atomicidad y la seguridad: una recepción rechazada no modifica stock ni crea movimientos parciales. No se habilitó Blaze ni ninguna cuenta de facturación.

## Dashboard operativo

- `/dashboard` consolida en tiempo real datos existentes de ventas, compras, inventario, reposiciones, clientes y comprobantes; no crea colecciones de métricas ni duplica fuentes de verdad.
- El administrador ve métricas globales. El agente consulta ventas, inventario, reposiciones y comprobantes filtrados por su UID antes de descargar datos; los clientes visibles respetan las reglas vigentes.
- Incluye períodos locales predefinidos, ventas netas, ticket promedio, compras recibidas, stock y alertas, actividad reciente, gráfica diaria, top de productos y top de clientes.
- Las ventas canceladas no forman parte de los importes netos. El stock bajo se define como `quantity <= minimumStock`; con mínimo cero, solo una cantidad cero activa la condición.
- La actividad visible se limita a los 12 eventos más recientes después de componer las consultas autorizadas. El volumen actual permite agrupar en cliente sin métricas precalculadas; no se añadieron índices, reglas, dependencias, Storage, Functions ni Blaze.

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
