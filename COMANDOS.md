# Comandos rapidos de Inventario AZ

Referencia breve para revisar, validar y ejecutar el proyecto de forma local.

## Estado del repositorio

```powershell
git status
```

Muestra los archivos modificados, los archivos nuevos y los cambios que ya estan en *staging*.

```powershell
git branch -vv
```

Muestra la rama actual, su rama remota de seguimiento y si esta sincronizada con `origin/master`.

```powershell
git log --oneline -8
```

Muestra los ultimos ocho commits en formato resumido.

```powershell
git diff --check
```

Detecta errores de espacios, tabulaciones y otros problemas de formato en el diff.

## Desarrollo local

```powershell
npm run dev
```

Inicia Next.js en modo desarrollo. Normalmente queda disponible en [http://localhost:3000](http://localhost:3000).

## Validaciones

```powershell
npm run lint
```

Ejecuta ESLint para detectar problemas de calidad y convenciones del codigo.

```powershell
npm run typecheck
```

Valida los tipos de TypeScript sin generar archivos de salida.

```powershell
npm run build
```

Genera el build de produccion. Es una validacion fuerte antes de hacer commit o push.

## Limpiar datos de prueba

> ⚠️ Usa `reset:data:dry` antes de `reset:data`.

```powershell
npm run reset:data:dry
```

Solo simula y audita el reset. **No borra datos** y permite revisar que informacion se eliminaria.

```powershell
npm run reset:data
```

Elimina datos operativos y es destructivo. Verifica que el proyecto activo sea exactamente `inventario-az`, crea un backup local, solicita una confirmacion exacta y conserva usuarios de Firebase Authentication, perfiles y roles.

## Compartir temporalmente por internet

```powershell
npm run share:temp
```

Genera el build de produccion, inicia `next start` y abre un Cloudflare Quick Tunnel. Muestra una URL `https://*.trycloudflare.com` y el hostname que debe autorizarse en Firebase Authentication. El acceso dura solamente mientras el script permanece abierto.

## Abrir localhost manualmente

```powershell
Start-Process "http://localhost:3000/login"
```

Abre la pantalla local de inicio de sesion en el navegador predeterminado.

## Comandos utiles de Firebase

```powershell
npx firebase-tools use
```

Muestra y permite verificar el proyecto Firebase activo.

> Debe ser exactamente `inventario-az`. Nunca usar `azbel-corp`.

## Flujo recomendado antes de commit

Ejecuta las comprobaciones en este orden:

```powershell
git status
npm run lint
npm run typecheck
npm run build
git diff --check
```

Si todas terminan correctamente, recien se procede a preparar y crear el commit.
