# Acceso Administrativo — Dispositivos y Vinculación

> **PRIVADO.** Este documento describe funciones internas del sistema.
> No compartir con usuarios no autorizados.

---

## Panel de Gestión de Dispositivos

El panel de dispositivos no aparece en la navegación visible. Se accede
únicamente mediante los siguientes mecanismos:

### Mecanismo 1 — Secuencia de clics en el avatar

1. Localiza el botón de perfil/avatar en la esquina superior izquierda de la barra lateral.
2. Haz clic **7 veces consecutivas** sobre él en menos de 1.2 segundos entre cada clic.
3. El panel de dispositivos se abre directamente.

> El modal de perfil se abre en los primeros 6 clics de forma normal.
> En el 7° se intercepta antes de abrirse y se redirige al panel de dispositivos.

### Mecanismo 2 — Atajo de teclado

Presiona simultáneamente:

```
Ctrl + Shift + Alt + L
```

Este atajo no aparece en ningún tooltip, menú de ayuda ni documentación visible
dentro de la aplicación.

### Vista directa (URL)

Navega directamente a:

```
#/devices
```

Esta ruta no aparece en el menú lateral. Puedes acceder tecleándola en la barra
de dirección o añadirla como marcador.

---

## ¿Qué puedes hacer desde el panel?

| Acción | Descripción |
|--------|-------------|
| **Ver dispositivos activos** | Nombre, browser, plataforma, último acceso |
| **Renombrar este dispositivo** | Cambia el nombre visible para identificarlo fácilmente |
| **Revocar un dispositivo** | Bloquea su acceso de sync. Se propaga al siguiente Push. |
| **Restaurar un dispositivo** | Elimina la revocación. Se propaga al siguiente Push. |
| **Ver usuarios vinculados** | Miembros del workspace y su actividad reciente |

---

## Cómo vincular un nuevo dispositivo

1. En el dispositivo con acceso activo, ve a **Sync** (botón de la barra superior).
2. En el campo **Shared File ID**, copia el ID usando el botón **"Copiar"**.
3. En el nuevo dispositivo, abre Sync y pega ese ID en **Shared File ID**.
4. Guarda y conecta. Al hacer **Pull**, el nuevo dispositivo se registrará automáticamente.

---

## Cómo funciona la revocación

```
Dispositivo A (admin)          Google Drive              Dispositivo B (revocado)
      │                             │                          │
      ├─ Panel de dispositivos      │                          │
      ├─ Clic "Revocar" en B        │                          │
      ├─ Push ─────────────────────>│  revokedDevices: [B.id]  │
      │                             │<── Pull ─────────────────┤
      │                             │    Detecta su propio ID  │
      │                             │    en revokedDevices     │
      │                             │──> BLOQUEA SYNC ─────────┤
      │                             │    Banner rojo visible   │
```

- La revocación **no borra datos locales** del dispositivo B, solo bloquea su sync.
- Para que la revocación sea efectiva, el Dispositivo A debe hacer **Push** inmediatamente después.
- La revocación se propaga en el siguiente ciclo de auto-sync (por defecto: 1 minuto).

### Para restaurar el acceso

1. Desde un dispositivo activo, abre el panel de dispositivos.
2. En la sección **"Revocados"**, haz clic en **"Restaurar"** junto al dispositivo.
3. Haz **Push** para propagar el cambio.
4. El dispositivo B puede hacer **Pull** y su acceso queda restaurado.

---

## Claves importantes en localStorage

Estas claves identifican el dispositivo. No borrar manualmente:

| Clave | Contenido |
|-------|-----------|
| `workspace_device_id` | ID único del dispositivo (generado una sola vez) |
| `workspace_device_name` | Nombre legible del dispositivo |
| `workspace_device_registered_at` | Timestamp de primer registro |
| `workspace_devices_registry` | Lista JSON de todos los dispositivos conocidos |
| `workspace_revoked_devices` | Lista JSON de dispositivos revocados |

> Si se borra `workspace_device_id`, el dispositivo obtiene un nuevo ID y
> pierde su historial en el panel. No se revoca automáticamente.

---

## Advertencias de seguridad

- **Sin backend propio**: toda la coordinación ocurre a través del archivo en Google Drive.
  Quien tenga acceso al archivo en Drive puede leer los datos (si no está cifrado con E2EE).
- **Revocación eventual**: hay una ventana de tiempo entre la revocación y cuando el
  dispositivo la detecta (próximo Pull/auto-sync).
- **Sin revocación de datos**: revocar un dispositivo no borra sus datos locales.
  Si los datos son sensibles, considera cambiar la contraseña maestra o rotar el archivo de Drive.
- **E2EE activo**: si Nexus Fortress (cifrado AES-256-GCM) está habilitado, los datos
  en el archivo Drive están cifrados y solo se descifran con la contraseña maestra correcta.
