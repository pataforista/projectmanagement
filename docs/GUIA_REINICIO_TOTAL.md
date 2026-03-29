# Guía de Reinicio Total (Hard Reset)

Si experimentas problemas de sincronización persistentes o errores de descifrado ("Decryption failed"), sigue este procedimiento para limpiar el sistema completamente y habilitar la nueva configuración de seguridad (600,000 iteraciones).

## 1. Limpieza de Google Drive (Nube)
Este paso elimina el archivo de datos antiguo que contiene las claves y registros obsoletos.
*   Accede a [Google Drive](https://drive.google.com).
*   Localiza la carpeta `Nexus_Workspace`.
*   **Elimina** el archivo `.json` de datos (por ejemplo, `nexus_workspace.json`).

## 2. Limpieza del Backend (Servidor)
Ya he realizado una limpieza inicial, pero para asegurar que el servidor D1 esté vacío, puedes ejecutar estos comandos en tu terminal (dentro de la carpeta `backend/`):

```powershell
npx wrangler d1 execute workspace-db --remote --command "DELETE FROM members;"
npx wrangler d1 execute workspace-db --remote --command "DELETE FROM projects;"
npx wrangler d1 execute workspace-db --remote --command "DELETE FROM tasks;"
npx wrangler d1 execute workspace-db --remote --command "DELETE FROM documents;"
```

## 3. Limpieza Local (Navegador)
Este script borra las bases de datos locales (`IndexedDB`) y las claves de seguridad guardadas en `localStorage`. Ejecútalo en la consola de tu navegador (F12):

```javascript
(async () => {
  if (!confirm("⚠️ ATENCIÓN: Esto borrará permanentemente todos tus datos locales. Asegúrate de tener respaldo en Drive o D1 si los necesitas.\n\n¿Proceder con el reinicio total?")) return;

  console.log("Iniciando limpieza profunda...");

  // 1. Cerrar base de datos si está abierta para evitar bloqueos
  if (window.dbAPI && window.hardReset) {
    await window.hardReset();
    return;
  }

  // Fallback manual si la app no ha cargado los módulos:
  localStorage.clear();
  sessionStorage.clear();

  const dbs = await window.indexedDB.databases();
  for (const dbInfo of dbs) {
    console.log("Cerrando y borrando:", dbInfo.name);
    const req = window.indexedDB.deleteDatabase(dbInfo.name);
    req.onblocked = () => alert("Por favor, cierra todas las demás pestañas de esta aplicación para completar la limpieza.");
  }

  alert("Limpieza manual solicitada. La página se recargará.");
  location.reload();
})();
```

---

**Resultado esperado**: Al recargar, verás la pantalla de bienvenida. El primer usuario en registrarse será el Administrador y creará un workspace limpio con las últimas mejoras de seguridad.
