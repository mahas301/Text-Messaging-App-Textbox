# TextBox v4 📬
### Real-time SMS-style messaging — Node.js · Express · MySQL · Socket.IO

---

## What's in v4

| Feature | Status |
|---|---|
| BUG FIX: `activePhone` not defined in settings | ✅ Fixed |
| Full Settings page (profile, theme, phones, contacts, logout) | ✅ |
| Contact Management (save, edit, delete contacts) | ✅ |
| Contact names shown in conversations & inbox | ✅ |
| "Save Contact" button inside conversation | ✅ |
| Profile page (`/profile/:phone`) | ✅ |
| Contacts list page (`/contacts`) | ✅ |
| Draggable sidebar resize (saved to localStorage) | ✅ |
| Visual theme selector (dark/light cards in settings) | ✅ |
| Socket.IO real-time messaging | ✅ |
| Typing indicator | ✅ |
| Online/offline status | ✅ |
| Phone OTP login (console-logged) | ✅ |
| Earthy brown theme, dark + light | ✅ |

---

## Quick Start

### 1. Start XAMPP MySQL
Open XAMPP Control Panel → Start **MySQL**

### 2. Database setup
Go to http://localhost/phpmyadmin
- Select or create `textbox_db`
- Click the **SQL** tab
- Paste and run the contents of `database/schema.sql`

> The schema now includes a `contacts` table. If you already have the old DB, just run this part manually:
> ```sql
> CREATE TABLE IF NOT EXISTS contacts (
>     id INT AUTO_INCREMENT PRIMARY KEY,
>     user_id INT NOT NULL,
>     name VARCHAR(100) NOT NULL,
>     phone_number VARCHAR(20) NOT NULL,
>     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
>     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
>     UNIQUE KEY unique_contact (user_id, phone_number)
> );
> ```

### 3. Open in VS Code
```
File → Open Folder → select textbox_clean
```

### 4. Install dependencies
```bash
npm install
```

### 5. Check .env
```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=        ← blank for default XAMPP
DB_NAME=textbox_db
PORT=3000
```

### 6. Run
```bash
npm run dev
```
Open → **http://localhost:3000**

---

## New Features Guide

### Contacts
- Go to **Contacts** in the sidebar (👥 icon)
- Add contacts manually, or click **Save Contact** inside any conversation
- Contact names automatically replace phone numbers in the inbox and threads
- Click a contact → view their profile page with all conversations

### Settings
- **Profile section**: change display name
- **Appearance section**: click Dark or Light card to switch theme
- **Phone Numbers section**: add, switch, or remove numbers
- **Saved Contacts section**: view and manage contacts
- **Account section**: sign out button

### Resizable Sidebar
- Hover over the right edge of the sidebar — a drag handle appears
- Drag left or right to resize
- Width is saved automatically in `localStorage`

### OTP Login
- Login page → **Phone OTP** tab → enter a registered phone number
- Check the **VS Code terminal** for the 6-digit code
- Enter it to sign in (expires in 5 minutes)

---

## Project Structure
```
textbox_clean/
├── server.js                      ← HTTP + Socket.IO, binds 0.0.0.0
├── .env                           ← DB + session config
├── package.json
├── database/
│   └── schema.sql
├── backend/
│   ├── config/db.js
│   ├── middleware/auth.js
│   ├── socketManager.js           ← Online tracking + typing events
│   ├── otpStore.js                ← In-memory OTP (console-logged)
│   └── routes/
│       ├── auth.js                ← Login, OTP, register, theme toggle
│       ├── messages.js            ← Conversations, send, delete, restore
│       └── settings.js            ← Settings, contacts, profile pages
└── frontend/
    ├── views/
    │   ├── partials/sidebar.ejs   ← Resizable sidebar with drag handle
    │   ├── login.ejs
    │   ├── register.ejs
    │   ├── inbox.ejs
    │   ├── conversation.ejs       ← Save Contact button + profile link
    │   ├── deleted_messages.ejs
    │   ├── settings.ejs           ← Full settings with theme cards
    │   ├── contacts.ejs           ← Contacts list page
    │   └── profile.ejs            ← Contact profile page
    └── public/
        ├── css/style.css          ← Full earthy brown + all components
        └── js/app.js              ← Socket.IO + sidebar resize + all UI
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `activePhone is not defined` | Fixed in this version — settings route now always passes it |
| Login server error | Check XAMPP MySQL is running + DB_PASSWORD in .env |
| Contacts table missing | Run the `CREATE TABLE IF NOT EXISTS contacts` SQL above |
| Real-time not working | Check browser console for Socket.IO connection errors |
| Sidebar won't resize | Try a hard refresh (Ctrl+Shift+R) to clear cached JS |
| OTP not showing | Look in the VS Code terminal (not the browser) |
