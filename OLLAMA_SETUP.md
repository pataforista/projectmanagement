# Setting up Ollama for CORS

To use Ollama from the hosted version of the application (`https://pataforista.github.io`), you must configure the `OLLAMA_ORIGINS` environment variable to permit cross-origin requests.

## Windows (Your OS)

1. **Quit Ollama**: Locate the Ollama icon in your system tray (bottom-right corner), right-click it, and select **Quit Ollama**.
2. **Open Environment Variables**:
   - Press the `Win` key or click the Start menu.
   - Type **"environment variables"**.
   - Select **"Edit the system environment variables"**.
3. **Edit Variables**:
   - In the "System Properties" window that appears, click the **Environment Variables...** button.
   - Under **"User variables for [YourUser]"**, click the **New...** button.
4. **Add New Variable**:
   - **Variable name**: `OLLAMA_ORIGINS`
   - **Variable value**: `https://pataforista.github.io`
5. **Save and Restart**:
   - Click **OK** on all windows to save the changes.
   - Restart Ollama by launching it from the Start menu.

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
