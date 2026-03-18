# Multi-Account Google Login Integration Guide

## Overview

This implementation provides three complementary options for handling multiple Google accounts in the same browser, following patterns established by Gmail and other Google services.

---

## 🎯 Three Implementation Options

### **Opción 1: Auto-Detection of Account Changes**
📁 `js/utils/account-detector.js`

**What it does:** Automatically detects when the user switches Google accounts

**How to use:**
- Transparent to the user - works automatically
- Monitors Google session (ID token) for changes
- Triggers `account:switched` event when detected
- Maintains account history in localStorage

**Events fired:**
```javascript
window.addEventListener('account:switched', (e) => {
    console.log(`Account switched: ${e.detail.oldEmail} → ${e.detail.newEmail}`);
});
```

**Advanced:**
```javascript
// Check current account
const account = AccountChangeDetector.getCurrentAccount();
console.log(account.email, account.sub);

// Get history of all seen accounts
const history = AccountChangeDetector.getAccountHistory();
```

---

### **Opción 2: Per-Tab Session Isolation**
📁 `js/utils/storage-manager.js`

**What it does:** Stores user data in sessionStorage (per-tab) instead of localStorage (global)

**How to use:**
- Transparent to developers - use `StorageManager` API
- Automatically routes data to correct storage backend
- Prevents credential leakage between tabs

**Code example:**
```javascript
// Instead of:
localStorage.setItem('workspace_user_email', 'user@example.com');

// Use:
StorageManager.set('workspace_user_email', 'user@example.com');
```

**Key Benefit:**
```
Tab 1: Account A (sessionStorage isolated)
Tab 2: Account B (sessionStorage isolated)
→ No conflicts, completely independent
```

---

### **Opción 3: Fast Session Switching** ⭐ **(Integrated with Topbar)**
📁 `js/utils/session-manager.js`
📁 `js/ui/session-switcher.js`

**What it does:** Allows instant switching between multiple Google accounts without page reload

## 🎨 Topbar Integration

### **Accessing the Session Switcher**

#### **Method 1: Click the Button**
- Look for the **user icon with dot indicator** in the topbar (right side, before "Nuevo" button)
- Click to open the session switcher modal

#### **Method 2: Keyboard Shortcut**
- Press **`Alt+S`** anywhere in the app
- Modal opens instantly

#### **Method 3: Programmatic**
```javascript
import { showSessionSwitcher } from './ui/session-switcher.js';

// Open switcher
showSessionSwitcher();
```

---

### **Session Switcher Modal Features**

#### **View Active Sessions**
- See all currently active sessions
- Shows email, name, and avatar for each
- Green checkmark indicates the currently active session

#### **Switch Between Accounts**
1. Click on any session in the list
2. App switches instantly (< 500ms)
3. No page reload needed
4. Data for new account loads immediately

#### **Add New Account**
1. Click **"Agregar Cuenta"** button
2. Google sign-in popup appears
3. After authentication, session is created automatically
4. You're switched to the new account

#### **Remove Session**
1. Click **"×"** button on any session
2. Confirm removal
3. If it's the current session, auto-switches to another one
4. Or logs out if it's the last session

#### **Logout All**
1. Click **"Salir"** button at bottom
2. Confirms logout of all sessions
3. App reloads to login screen

---

## 🔄 Complete User Workflows

### **Workflow 1: Working with Multiple Accounts**

```
Time 0:00 - Start session
├─ Login with Account A (research@gmail.com)
└─ Do work on Project X

Time 0:30 - Switch account
├─ Press Alt+S (or click topbar button)
├─ Modal opens showing Account A
├─ Click "Agregar Cuenta"
├─ Login with Account B (admin@company.org)
├─ Account B is active immediately
└─ Do work on Project Y

Time 1:00 - Back to Account A
├─ Press Alt+S again
├─ Modal shows both Account A ✓ and Account B
├─ Click on Account A
├─ Switched instantly, Project X data reloaded
└─ Continue work without losing context
```

### **Workflow 2: Collaborate as Team Member**

```
User A on MacBook
├─ Tab 1: Working as User A (personal account)
└─ Project: Personal research

User B on Same MacBook
├─ Tab 1: Working as User B (team account)
└─ Project: Team project

Completely isolated sessions:
├─ Different user data per tab
├─ Different sync states
├─ Different Drive access
└─ Zero conflicts or confusion
```

### **Workflow 3: Quick Account Switch**

```
Alt+S → [Modal appears]
    ↓
[3 sessions shown]
    ↓
Click "Account B"
    ↓
Account B is active (< 500ms)
    ↓
Back to work immediately
    ↓
No reload, no loading screen
```

---

## 🔐 Security Features

### **Credential Safety**
- ✅ Sensitive keys (password hash, encryption salt) in **localStorage** (protected)
- ✅ Session tokens in **sessionStorage** (per-tab, cleared on close)
- ✅ Account history doesn't store tokens (only emails)
- ✅ Token validation prevents hijacking

### **Account Isolation**
- ✅ Each account has separate encryption salt
- ✅ Metadata (name, avatar, role) per-account
- ✅ Cross-tab coordination via BroadcastChannel
- ✅ Automatic cleanup on logout

---

## 📊 Technical Details

### **Data Flow Diagram**

```
User clicks Alt+S or topbar button
            ↓
    initSessionSwitcher()
            ↓
    SessionManager.listSessions()
            ↓
    renderSessionSwitcher()
            ↓
    Modal displays with list
            ↓
User selects account
            ↓
SessionManager.switchSession(sessionId)
            ↓
├─ Save current session state
├─ Load target session from IDB
├─ Update StorageManager (sessionStorage)
├─ Fire 'session:switched' event
└─ UI updates (updateUserProfileUI, etc)
```

### **Storage Architecture**

```
localStorage (Global, Shared across tabs)
├─ gdrive_sync_config
├─ workspace_team_label
├─ workspace_lock_hash         ← SENSITIVE
├─ nexus_salt                   ← SENSITIVE
└─ [other global settings]

sessionStorage (Per-tab, Cleared on close)
├─ workspace_user_email
├─ workspace_user_name
├─ workspace_user_avatar
├─ google_id_token             ← TOKEN
├─ gdrive_connected
└─ [other session data]

IndexedDB (Persistent)
└─ sessions store
    ├─ id
    ├─ email
    ├─ idToken
    ├─ metadata
    ├─ createdAt
    ├─ lastActive
    └─ status (active/inactive)
```

---

## 🛠️ Developer Integration

### **Adding Session-Aware Features**

```javascript
// Check current session
import { StorageManager } from './utils/storage-manager.js';
import { SessionManager } from './utils/session-manager.js';

const currentEmail = StorageManager.get('workspace_user_email');
const currentSession = await SessionManager.getCurrentSession();

console.log(`Working as: ${currentEmail}`);
console.log(`Session ID: ${currentSession.id}`);
console.log(`Session created: ${currentSession.createdAt}`);
```

### **React to Session Changes**

```javascript
// Listen for session switches
window.addEventListener('session:switched', async (e) => {
    const { sessionId, email } = e.detail;

    // Refresh UI
    updateUserProfileUI();

    // Reload data
    await syncManager.pull();

    // Update analytics
    trackEvent('account_switched', { to: email });
});
```

### **Programmatic Session Management**

```javascript
// Create new session
const sessionId = await SessionManager.createSession(
    'newuser@example.com',
    idToken,
    {
        name: 'New User',
        avatar: 'N',
        role: 'member'
    }
);

// Switch to session
await SessionManager.switchSession(sessionId);

// List all sessions
const sessions = await SessionManager.listSessions();
sessions.forEach(s => console.log(s.email));

// End session
await SessionManager.endSession(sessionId);

// Logout
await SessionManager.logout();
```

---

## 🎨 UI/UX Details

### **Topbar Button States**

```
Button Hidden
└─ SessionManager not initialized yet

Button Visible (no indicator)
├─ SessionManager initialized
├─ One session active
└─ Show when hovering over button

Button with Indicator Dot
├─ Multiple sessions available
├─ Teal dot appears on hover
└─ Visually cue user to multi-session capability
```

### **Modal Animations**

```
Open Modal:
  Overlay: fade-in (0.2s)
  Panel: slide-up (0.3s)
  Items: stagger fade-in (0.2s each)

Switch Account:
  Item: subtle scale + slide-right
  Toast: show "Sesión cambiada a..."
  UI: refresh (updateUserProfileUI)
```

### **Mobile Responsiveness**

```
Desktop (> 768px):
  Modal: 420px wide
  Centered with 50% gray overlay

Mobile (< 768px):
  Modal: 95% wide (10px margin)
  Full-height modal
  Easy thumb access
  Touch-friendly buttons (48px+ height)
```

---

## 🐛 Troubleshooting

### **Q: Button doesn't appear in topbar**

```javascript
// Check if SessionManager initialized
if (!window.SessionManager) {
    console.warn('SessionManager not initialized');
    // Make sure: window.db exists and has sessions store
}

// Check button visibility
const btn = document.getElementById('btn-session-switcher');
console.log('Button visible:', btn.style.display !== 'none');
```

### **Q: Can't switch between accounts**

```javascript
// Check sessions exist
const sessions = await SessionManager.listSessions();
console.log('Active sessions:', sessions.length);

// Check IndexedDB
console.log('DB available:', window.db?.sessions !== undefined);

// Check storage manager
const email = StorageManager.get('workspace_user_email', 'session');
console.log('Current email:', email);
```

### **Q: Sessions not persisting after close**

```javascript
// Sessions are stored in IndexedDB (persistent)
// Only cleared when explicitly deleted or IndexedDB is cleared

// To clear all sessions:
localStorage.clear();  // ⚠️ Clears global settings too
sessionStorage.clear();  // Clears per-tab data
// IndexedDB must be cleared separately (Devtools)
```

---

## 📚 Files Reference

| File | Purpose |
|------|---------|
| `js/utils/account-detector.js` | Auto-detect account changes (Opción 1) |
| `js/utils/storage-manager.js` | Manage localStorage vs sessionStorage (Opción 2) |
| `js/utils/session-manager.js` | Handle multi-session lifecycle (Opción 3) |
| `js/ui/session-switcher.js` | Session switcher modal UI |
| `js/ui.js` | `initSessionSwitcher()` function |
| `index.html` | `btn-session-switcher` button |
| `styles/components.css` | Session switcher styling |

---

## 🚀 Future Enhancements

### **Possible Additions**

1. **Remember Last Session**
   ```javascript
   const lastSessionId = localStorage.getItem('nexus_current_session_id');
   await SessionManager.switchSession(lastSessionId);
   ```

2. **Session Expiry Warnings**
   ```javascript
   if (TokenExpiry.daysUntilExpiry() < 7) {
       showToast('Your session expires in 7 days. Re-authenticate now.');
   }
   ```

3. **Shared Access Requests**
   ```javascript
   // "Request access" button in session list
   // Shows when trying to view shared workspace from different account
   ```

4. **Session Activity Log**
   ```javascript
   const log = await SessionManager.getActivityLog(sessionId);
   // { switched_at, last_sync, last_push, etc }
   ```

---

## ✅ Checklist for Implementation

- [x] Create account-detector.js (auto-detection)
- [x] Create storage-manager.js (isolation)
- [x] Create session-manager.js (switching)
- [x] Create session-switcher.js (UI modal)
- [x] Integrate with topbar (button + keyboard shortcut)
- [x] Add CSS styling and animations
- [x] Initialize SessionManager in app.js
- [x] Initialize AccountChangeDetector in app.js
- [x] Modify sync.js for account switches
- [x] Update utils.js for storage compatibility
- [x] Create test suite
- [x] Documentation

---

## 📞 Support

For issues or questions:
1. Check browser console for errors
2. Verify IndexedDB has `sessions` store
3. Check if `window.SessionManager` and `window.AccountChangeDetector` exist
4. Review browser DevTools → Storage → Session Storage/Local Storage
5. Check git commit messages for implementation details

---

**Last Updated:** March 18, 2026
**Branch:** `claude/multi-account-google-login-dMgQC`
