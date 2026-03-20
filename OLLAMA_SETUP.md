# Configuración de Ollama para CORS

Para usar Ollama desde la versión hospedada (`https://pataforista.github.io`), debes configurar la variable de entorno `OLLAMA_ORIGINS`.

> [!IMPORTANT]
> **Debes cerrar Ollama completamente** (asegúrate en el Administrador de Tareas) antes de reiniciarlo para que tome los cambios.

## Windows (Tu sistema)

1. **Cerrar Ollama**: Haz clic derecho en el icono de Ollama en la bandeja del sistema (junto al reloj) y selecciona **Quit Ollama**.
2. **Forzar cierre**: Presiona `Ctrl + Shift + Esc`, ve a la pestaña **Detalles** y termina cualquier proceso `ollama.exe` que siga vivo.
3. **Variables de Entorno**:
   - Pulsa la tecla `Win`, escribe **"variables de entorno"** y elige **"Editar las variables de entorno del sistema"**.
   - Haz clic en el botón **Variables de entorno...**.
4. **Agregar Variable (RECOMENDADO: Usar comodín primero)**:
   - En "Variables de usuario", haz clic en **Nueva...**.
   - Nombre: `OLLAMA_ORIGINS`
   - Valor: `*`
5. **Guardar y Reiniciar**: Acepta todo y vuelve a abrir Ollama desde el menú Inicio.

### Alternativa rápida (PowerShell)
Si quieres probarlo sin reiniciar Windows, cierra Ollama y ejecuta esto en PowerShell:
```powershell
$env:OLLAMA_ORIGINS="*"; ollama serve
```
Mantén esa ventana abierta mientras usas la app.

---

## Troubleshooting: If it still doesn't work

If you've followed the steps above and still see the CORS error, try these advanced steps:

### 1. Kill all Ollama Processes
Sometimes Ollama doesn't fully quit.
- Press `Ctrl + Shift + Esc` to open **Task Manager**.
- Go to the **Details** tab.
- Look for any `ollama.exe` processes.
- Right-click each one and select **End Task**.
- Now restart Ollama from the Start menu.

### 2. Set as a System Variable
Try adding the variable to **System variables** instead of (or in addition to) User variables:
- In the same "Environment Variables" window, look at the **bottom section** ("System variables").
- Click **New...** and add `OLLAMA_ORIGINS` with the value `https://pataforista.github.io`.

### 3. Use a Wildcard (Last Resort)
To rule out any typos in the URL, try setting the value to `*` (an asterisk).
- **Variable value**: `*`
- **Note**: This allows any website to talk to your Ollama, so only use it if the specific URL fails.

### 4. Verify via PowerShell
Open **PowerShell** and run this command to see if Windows "sees" your variable:
```powershell
$env:OLLAMA_ORIGINS
```
If it returns nothing, Windows hasn't registered the change yet. You might need to **Restart your computer**.

1. If Ollama is running, quit it.
2. Open a Terminal and run:
   ```bash
   launchctl setenv OLLAMA_ORIGINS "https://pataforista.github.io"
   ```
3. Restart the Ollama application.

---

## Linux (systemd)

1. Edit the systemd service for Ollama:
   ```bash
   sudo systemctl edit ollama.service
   ```
2. Add the following under the `[Service]` section:
   ```ini
   [Service]
   Environment="OLLAMA_ORIGINS=https://pataforista.github.io"
   ```
3. Save and exit the editor.
4. Reload systemd and restart the service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart ollama
   ```
