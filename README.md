# School Sphere 🏫

**School Sphere** is a lightweight school administration and management system designed for Ghanaian schools and academic institutions. 

Built on a robust, highly optimized web architecture, teachers, accountants, and administrators can log grades, take attendance, and collect fees with zero friction and zero lag. 

Data synchronizes with a remote server database or structured cloud endpoints, enabling real-time continuity across multiple administrators.

---

## 🎨 Professional Design & Visual Concept

- **Aesthetic Pairings**: Polished modern tracking typography (Inter for standard UI, JetBrains Mono for system indicators, tables, and grades).
- **Responsive Fluid Density**: Adapts effortlessly from desktop administration views down to touch-friendly mobile terminal screens (with touch goals $\ge$ 44px).
- **Purposeful Micro-interactions**: Elegant state transition curves powered by `motion` for instant feedback on tabs, report card previews, and terminal controls.

---

## 🎯 Modular Architecture & Core Components

1. **📊 Comprehensive Dashboard Logs**: Real-time business intelligence metrics including student enrollment trajectory, average quarterly attendance, overall fee balance tallies, and SMS billing credits.
2. **👥 Student Management**: Complete profiles with digital letterhead photo uploads, parent/guardian phone directory, and customizable pricing models.
3. **💵 Fees & Revenue Management**: Live invoicing ledger, instant print/PDF transaction receipts, and payment status parameters.
4. **📝 Attendance Terminal**: Fast single-click class checks with status registers (Present, Absent, Late).
5. **🏆 Results & Academic Reports**: Automated Ghanaian BECE or WASSCE continuous class-assessments (30%) and exams (70%) grading structures, average class rankings, and instant terminal report cards.
6. **📈 Exam Placement Analytics**: Detailed high-performance tracker for national level candidates (BECE / WASSCE) with dynamic analysis.
7. **🚨 Emergency Siren Console**: Broadcaster console triggers urgent broadcast scripts for incidents.
8. **💬 SMS Communicator Portal**: Predefined SMS letterhead templates (Fee Reminders, Student Absences, PTA Invitations) with custom template placeholder interpolations (`{parentName}`, `{studentName}`, etc.) and momo virtual gateway.
9. **⚙️ App Preferences**: Academic calendar semesters, class streams, subject lists, and custom grade boundary configuration.
10. **🛡️ Role-Based Access Control**: Fully isolated views customized for **Administrators**, **Teachers**, and **Accountants**.

---

## 🔒 Initial Administrator Setup & Authentication

SchoolSphere utilizes enterprise role-based access control backed by Supabase Authentication and server-side JWT session tokens.

To initialize the primary administrator account for a new deployment:

1. Launch the application and click **Get Started** on the welcome screen.
2. Complete the institution registration wizard by providing your school name, institutional domain/slug, and establishing your unique, secure master administrator credentials.
3. If provisioning via Supabase directly, create an initial user record in the `users` table or invoke the `POST /api/auth/register` endpoint with your organization details.

> ⚠️ **Security Notice**: No default credentials are pre-seeded in the public repository. All administrative accounts must use strong, unique passwords with mandatory rotation enabled. For self-hosted instances, configure `JWT_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` in your `.env` file prior to starting the service.

---

## 🛠️ Technology Stack

- **Client Runtime**: React 18, TypeScript, Tailwind CSS, Dexie.js (client IndexedDB offline cache), Lucide Icons, Recharts (institutional analytics).
- **Backend Service**: Express.js (v4), Node.js 22, tsx runner, JWT session authentication, and REST API proxy.
- **Data Tier**: 
  - **Cloud Database (Single Source of Truth)**: Supabase PostgreSQL with Multi-Tenant Row Level Security (RLS) policies.
  - **Client Resilience Layer**: IndexedDB local cache via Dexie.js for transparent offline-first usability and bidirectional sync.

---

## ⚙️ Environment Configuration (`.env`)

Declare a `.env` file in the root workspace folder to toggle configuration parameters. A guide is provided in `.env.example`:

```env
# Server Binding Port
PORT=3000

# Server Host Address
HOST=0.0.0.0

# Gemini AI Integration Credentials
GEMINI_API_KEY=your_gemini_api_key_here

# Outbound App URL for web routing
APP_URL=https://your-domain-url.com

# MySQL Database Connection (Leave empty to trigger automatic server-side JSON fallback)
MYSQL_HOST=your-mysql-host.com
MYSQL_PORT=3306
MYSQL_USER=database_user
MYSQL_PASSWORD=database_secure_password
MYSQL_DATABASE=school_sphere_db
```

---

## 🚀 Installation & Setup Procedure

Ready to transition to development or production deployment? Follow these systematic instructions:

### 📥 Prerequisites
- **Node.js**: Version 18.x or above (LTS version recommended).
- **npm**: v9.x or above (delivered automatically with Node.js).
- **MySQL Server** *(Optional)*: Required ONLY if you wish to persistent-host data on a central remote SQL backend rather than local JSON fallback.

---

### 💻 Step 1: Clone and Set Up Directory
Extract your zipped code bundle, or clone the project files directly to your target deployment environment:
```bash
cd school-sphere
```

---

### 📦 Step 2: Install Dependencies
Run the standard installer tool to fetch official dependencies:
```bash
npm install
```

---

### 🛠️ Step 3: Local Development Sandbox (Run Dev Server)
Boot the application inside the development environment. This automatically launches Express on port `3000`, setting up a hot-reloaded development asset pipe:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your web browser to initialize the setup.

---

### 🚀 Step 4: Production Build & Asset Compiling
To compile the application for a fast, production-ready server environment, perform the single bundle build instruction:
```bash
npm run build
```
This single unified process executes two crucial functions:
1. Compiles frontend assets into highly optimized, minified HTML/CSS/JS bundles in `/dist`.
2. Bundles the Express TypeScript backend via `esbuild` into a self-contained, high-speed CJS module at `/dist/server.cjs`.

---

### 🏁 Step 5: Start Production Server
Launch your optimized, compiled production build using standard Node.js execution rules:
```bash
npm run start
```
The server binds to port `3000` on host `0.0.0.0` for high-performance scale.

---

## 💾 Server Data Sync Architecture

When operating on a client-server sync setup, the backend operates as follows:
- **Automatic Setup**: If MySQL credentials are provided, the Express backend automatically bootstraps 11 primary structured tables on startup.
- **Failover Safe**: If credentials are empty or the remote SQL servers are unavailable, the backend outputs helpful diagnostics in `/api/db/status` and gracefully switches to use a local JSON file database at `/school_db_fallback.json`. All student directories, schedules, visual statistics trackers, and SMS records continue to operate with zero interruption!
- **Dexie Replication**: The client-side utilizes Dexie transactions to push local changes up to the fallback array or pull fresh collections.

---

## 🧹 Maintenance & Logging Out

- **Cache Wipes**: If you wish to wipe the IndexedDB cache clear and seed default dummy records into the client database, click the **Reset Database & Start Fresh** action located on the login screen footer.
- **Data Portability**: Easily import or export CSV/Excel sheets for academic transcripts, student registers, and financial history records.
