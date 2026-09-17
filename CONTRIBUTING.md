# Contributing to Bhumi3D

Thanks for contributing to **Bhumi3D**.

This guide documents the exact Windows setup process we followed on a fresh laptop to get Bhumi3D running successfully. It includes the normal setup steps **and the problems/workarounds we actually encountered**, so a new teammate can follow the same path without guessing.

## 1. What Bhumi3D Uses

Bhumi3D currently uses:

- **Frontend:** React + Vite
- **3D map:** CesiumJS
- **Backend:** FastAPI
- **Language:** Python
- **Database:** PostgreSQL
- **Spatial extension:** PostGIS
- **Version control:** Git + GitHub

Current local development flow:

```text
React + Cesium
      ↓
FastAPI
      ↓
PostgreSQL + PostGIS
```

## 2. Software to Install First

Install these before cloning the repository:

1. **Git for Windows**
2. **Python 3.13**
3. **Node.js**
4. **PostgreSQL 18**
5. **PostGIS**
6. **pgAdmin 4**
7. **Visual Studio Code**

The setup confirmed working used:

```text
Git        2.55.0.windows.5
Python     3.13.15
Node.js    24.21.0
npm        11.19.0
PostgreSQL 18.6
```

Exact patch versions do not have to match.

## 3. Recommended VS Code Extensions

No VS Code extension is strictly required just to run Bhumi3D, but these are recommended:

```text
Python — Microsoft
Pylance — Microsoft
ESLint — Microsoft
Prettier - Code formatter — Prettier
GitHub Pull Requests — GitHub
```

Do **not** use Live Server for Bhumi3D. The frontend is run with Vite.

## 4. Verify Git and Python

Open PowerShell and run:

```powershell
git --version
python --version
```

Both commands should print version numbers.

Example confirmed output:

```text
git version 2.55.0.windows.5
Python 3.13.15
```

If either command is not recognized, reinstall that program and make sure it is added to Windows PATH.

## 5. Verify Node.js

Run:

```powershell
node --version
```

Confirmed working output:

```text
v24.21.0
```

If `node` is not recognized, check:

```powershell
Test-Path "C:\Program Files\nodejs\node.exe"
```

If it returns `False`, install Node.js. If it returns `True` but `node` is still not recognized, close PowerShell completely and open a new window.

## 6. npm PowerShell Issue We Encountered

Running:

```powershell
npm --version
```

may give:

```text
File C:\Program Files\nodejs\npm.ps1 cannot be loaded because running scripts is disabled on this system.
```

This is a PowerShell execution-policy issue.

### Recommended workaround

Use:

```powershell
npm.cmd --version
```

Confirmed working output:

```text
11.19.0
```

For Bhumi3D, continue using:

```powershell
npm.cmd install
npm.cmd run dev
```

instead of:

```powershell
npm install
npm run dev
```

You may also choose to run:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

and answer `Y`, but this is not required if `npm.cmd` works.

If Windows Security shows a warning similar to:

```text
Part of this app has been blocked
Some features of UnknownApp may not work because we can't confirm who published them.
```

do **not** disable Windows Security just for Bhumi3D. Use `npm.cmd`.

## 7. Verify PostgreSQL

The normal command is:

```powershell
psql --version
```

On the fresh laptop, PostgreSQL was installed correctly but `psql` was not globally available in PATH.

Find the executable with:

```powershell
Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter psql.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
```

Confirmed locations included:

```text
C:\Program Files\PostgreSQL\18\bin\psql.exe
C:\Program Files\PostgreSQL\18\pgAdmin 4\runtime\psql.exe
```

Verify PostgreSQL directly with:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" --version
```

Confirmed working output:

```text
psql (PostgreSQL) 18.6
```

Bhumi3D does **not** require `psql` to be globally available in PATH. As long as PostgreSQL is installed and pgAdmin can connect, development can continue.

## 8. Optional: Add PostgreSQL to PATH

If you want `psql --version` to work globally, add:

```text
C:\Program Files\PostgreSQL\18\bin
```

to Windows PATH:

```text
Start
→ search "Environment Variables"
→ Edit the system environment variables
→ Environment Variables
→ User variables
→ Path
→ Edit
→ New
→ C:\Program Files\PostgreSQL\18\bin
→ OK
```

Close every PowerShell window and open a new one.

If `psql --version` still does not work, just use the full executable path shown above and continue.

## 9. Verify PostGIS

Run:

```powershell
Test-Path "C:\Program Files\PostgreSQL\18\share\extension\postgis.control"
```

Expected:

```text
True
```

If it returns `False`, install PostGIS using Stack Builder:

```text
Stack Builder
→ select PostgreSQL 18
→ Spatial Extensions
→ PostGIS
```

## 10. Verify pgAdmin

Open **pgAdmin 4** and confirm you can connect to the PostgreSQL 18 server using the password you chose during installation.

You will need that password later in `backend/.env`.

Do not commit your PostgreSQL password to GitHub.

## 11. Clone Bhumi3D Fresh From GitHub

Do not copy an old project folder if you can avoid it.

The confirmed working project location was:

```text
X:\SIH - 2026\Bhumi3D
```

Run:

```powershell
cd "X:\SIH - 2026"
git clone https://github.com/priyanshusinghnegi96/Bhumi3D.git
```

Because the repo is private, Git may say:

```text
info: please complete authentication in your browser...
```

Complete GitHub authentication in the browser.

Then:

```powershell
cd .\Bhumi3D
```

## 12. Verify the Git Clone

Run:

```powershell
git status
```

Expected:

```text
On branch main
Your branch is up to date with 'origin/main'.

nothing to commit, working tree clean
```

Check the latest commit:

```powershell
git log -1 --oneline
```

At the time of this setup, the latest commit was:

```text
bb5dfd6 Remove accidental nested Bhumi3D repository
```

The hash will change later; that is normal.

Inspect the project:

```powershell
Get-ChildItem -Force
```

Expected structure:

```text
Bhumi3D/
├── .git/
├── backend/
├── data/
├── database/
├── docs/
├── frontend/
├── processing/
├── .gitignore
├── README.md
└── SETUP.md
```

There should **not** be another `Bhumi3D/` repo nested inside it.

## 13. Create the bhumi3d Database

Open **pgAdmin 4**.

Navigate to:

```text
Servers
→ PostgreSQL 18
→ Databases
→ right-click Databases
→ Create
→ Database...
```

Use:

```text
Database: bhumi3d
Owner: postgres
```

Save it.

## 14. Enable PostGIS

Open the Query Tool specifically from:

```text
Servers
→ PostgreSQL 18
→ Databases
→ bhumi3d
→ right-click bhumi3d
→ Query Tool
```

Run:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

Verify:

```sql
SELECT PostGIS_Version();
```

A PostGIS version should be returned.

## 15. Database Setup Files

The repository contains:

```text
database/
├── cadastral_validation.sql
├── demo_boundary_violation.sql
├── README.md
├── reset_four_plot_demo.sql
└── setup_bhumi3d_demo.sql
```

For a fresh setup, use the consolidated setup file first.

## 16. Run setup_bhumi3d_demo.sql First

In pgAdmin Query Tool, open:

```text
X:\SIH - 2026\Bhumi3D\database\setup_bhumi3d_demo.sql
```

Execute the **entire file**.

Do not run validation queries before this file successfully finishes.

## 17. Error We Encountered: relation "parcels" does not exist

If you run:

```sql
SELECT COUNT(*) AS parcels FROM parcels;
```

and get:

```text
ERROR: relation "parcels" does not exist
SQL state: 42P01
```

then either:

1. `setup_bhumi3d_demo.sql` was not executed successfully, or
2. the Query Tool is connected to the wrong database.

Check:

```sql
SELECT current_database();
```

Expected:

```text
bhumi3d
```

Then check:

```sql
SELECT to_regclass('public.parcels');
```

If it returns `NULL`, the setup file has not created the table yet.

Open the Query Tool specifically from the `bhumi3d` database and run the full `setup_bhumi3d_demo.sql` file again.

## 18. Run Cadastral Validation Setup

After `setup_bhumi3d_demo.sql` succeeds, run:

```text
X:\SIH - 2026\Bhumi3D\database\cadastral_validation.sql
```

## 19. Run the Demo Boundary Violation Script

Then run:

```text
X:\SIH - 2026\Bhumi3D\database\demo_boundary_violation.sql
```

This intentionally makes **B04** cross the Plot 04 boundary so spatial validation has a known cadastral violation to detect.

## 20. Verify the Database

Run:

```sql
SELECT COUNT(*) AS parcels FROM parcels;
SELECT COUNT(*) AS properties FROM properties;
SELECT COUNT(*) AS imported_features FROM imported_features;
```

Then:

```sql
SELECT *
FROM building_plot_validation;
```

The fresh base demo should contain approximately:

```text
4 plots
4 buildings
16 floors
64 3D properties
```

B04 should be the deliberate boundary-violation example.

## 21. Backend Setup

Open PowerShell:

```powershell
cd "X:\SIH - 2026\Bhumi3D\backend"
```

## 22. Create the Python Virtual Environment

Run:

```powershell
python -m venv venv
```

This command may finish with **no visible output**. That is normal.

Verify:

```powershell
Test-Path .\venv\Scripts\Activate.ps1
```

Expected:

```text
True
```

Do not recreate the venv every time you start Bhumi3D.

## 23. Activate the Virtual Environment

Run:

```powershell
.\venv\Scripts\Activate.ps1
```

The prompt should change to:

```text
(venv) PS X:\SIH - 2026\Bhumi3D\backend>
```

If PowerShell blocks activation, run:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

then activate again.

## 24. Install Backend Dependencies

With `(venv)` visible:

```powershell
pip install -r requirements.txt
```

## 25. Create backend/.env

Check:

```powershell
Test-Path .\.env.example
```

If `True`:

```powershell
Copy-Item .env.example .env
```

Open:

```powershell
code .env
```

Set:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bhumi3d
DB_USER=postgres
DB_PASSWORD=YOUR_POSTGRES_PASSWORD
```

Replace `YOUR_POSTGRES_PASSWORD` with your own local PostgreSQL password.

Never commit `.env`.

## 26. VS Code .env Warning We Encountered

VS Code may display:

```text
An environment file is configured but terminal environment injection is disabled.
Enable "python.terminal.useEnvFile" to use environment variables from .env files in terminals.
```

This warning does **not** stop Bhumi3D.

The backend uses `python-dotenv`, so `main.py` can read `.env` itself.

You may ignore the warning.

If desired:

```text
Ctrl + ,
```

Search:

```text
python.terminal.useEnvFile
```

and enable it.

## 27. Start FastAPI

With `(venv)` active:

```powershell
uvicorn main:app --reload
```

Confirmed successful output looked like:

```text
INFO: Will watch for changes in these directories: [...]
INFO: Uvicorn running on http://127.0.0.1:8000
INFO: Started reloader process [...]
INFO: Started server process [...]
INFO: Waiting for application startup.
INFO: Application startup complete.
```

Keep this terminal open.

Backend:

```text
http://127.0.0.1:8000
```

Swagger:

```text
http://127.0.0.1:8000/docs
```

## 28. Frontend Setup

Open a **second PowerShell terminal**.

Do not stop the backend terminal.

Run:

```powershell
cd "X:\SIH - 2026\Bhumi3D\frontend"
```

## 29. Install Frontend Dependencies

Because PowerShell blocked `npm.ps1`, use:

```powershell
npm.cmd install
```

## 30. Prepare Cesium Static Files

Create the target folder:

```powershell
New-Item -ItemType Directory -Force public\cesiumStatic
```

Copy Cesium assets:

```powershell
Copy-Item -Recurse -Force node_modules\cesium\Build\Cesium\Assets public\cesiumStatic\
Copy-Item -Recurse -Force node_modules\cesium\Build\Cesium\Workers public\cesiumStatic\
Copy-Item -Recurse -Force node_modules\cesium\Build\Cesium\ThirdParty public\cesiumStatic\
Copy-Item -Recurse -Force node_modules\cesium\Build\Cesium\Widgets public\cesiumStatic\
```

## 31. Start the Frontend

Run:

```powershell
npm.cmd run dev
```

Vite normally prints:

```text
http://localhost:5173
```

If port 5173 is busy, use the alternate URL shown by Vite.

## 32. Final Verification

Open the Vite URL.

A successful fresh setup showed:

```text
Backend: Connected
```

and approximately:

```text
4 Plots
4 Buildings
16 Floors
64 3D Properties
```

The following were confirmed working:

- Bhumi3D page loads
- Cesium map loads
- Backend connection is green
- Land plots display
- Building geometry displays
- Cadastral hierarchy loads
- Search works
- Property details work
- Spatial IDs display
- Import GeoJSON button is present
- Batch Generate button is present
- Generate Vertical Parcels button is present
- Add Property button is present

Example searched property:

```text
Building: B01
Floor: 04
Unit: 403
Spatial ID: RJ-JPR-DEMO-0001-B01-L04-U403
```

## 33. Base Demo vs Batch Demo

A fresh database setup currently produces:

```text
4 plots
4 buildings
16 floors
64 properties
```

The later batch-demo state may contain approximately:

```text
4 plots
8 buildings
30 floors
105 properties
```

So `4 / 4 / 16 / 64` after a fresh setup is correct.

## 34. Normal Daily Startup

After first-time setup, use two terminals.

### Terminal 1 — Backend

```powershell
cd "X:\SIH - 2026\Bhumi3D\backend"
.\venv\Scripts\Activate.ps1
uvicorn main:app --reload
```

### Terminal 2 — Frontend

```powershell
cd "X:\SIH - 2026\Bhumi3D\frontend"
npm.cmd run dev
```

Then open:

```text
http://localhost:5173
```

or the URL printed by Vite.

## 35. Stop Bhumi3D Safely

Frontend terminal:

```text
Ctrl + C
```

Backend terminal:

```text
Ctrl + C
```

Optionally:

```powershell
deactivate
```

Closing pgAdmin does not delete the database.

## 36. Git Workflow for Contributors

Before working:

```powershell
cd "X:\SIH - 2026\Bhumi3D"
git checkout main
git pull
```

Create a branch:

```powershell
git checkout -b feature/your-feature-name
```

Examples:

```text
feature/blender-model-import
feature/dashboard-polish
feature/lidar-processing
fix/property-search
fix/cadastral-validation
```

After changes:

```powershell
git status
git add .
git commit -m "Describe your change"
git push -u origin feature/your-feature-name
```

Then open a Pull Request on GitHub.

## 37. Files That Must Not Be Committed

Do not commit:

```text
backend/.env
backend/venv/
frontend/node_modules/
frontend/public/cesiumStatic/
database backups
large LiDAR datasets
large drone imagery datasets
passwords
API keys
```

## 38. Important Database Rule

PostgreSQL database rows are **not stored in Git**.

If you change tables, triggers, views, PostGIS validation rules, schema, or demo data, also update or add SQL files under:

```text
database/
```

Do not make important database changes only through pgAdmin without saving the SQL.

## 39. Troubleshooting Summary

### `python -m venv venv` shows no output

Normal.

Verify:

```powershell
Test-Path .\venv\Scripts\Activate.ps1
```

### `npm` is blocked by PowerShell

Use:

```powershell
npm.cmd
```

Examples:

```powershell
npm.cmd --version
npm.cmd install
npm.cmd run dev
```

### `psql` is not recognized

Use:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" --version
```

Global PATH is convenient but not required.

### `relation "parcels" does not exist`

Run:

```sql
SELECT current_database();
```

It must return:

```text
bhumi3d
```

Then run the full:

```text
database/setup_bhumi3d_demo.sql
```

### Backend fails to connect to PostgreSQL

Check:

```text
PostgreSQL service is running
bhumi3d database exists
PostGIS extension exists
backend/.env exists
DB_PASSWORD is correct
DB_NAME=bhumi3d
DB_USER=postgres
DB_HOST=localhost
DB_PORT=5432
```

### VS Code warns about .env terminal injection

It can be ignored because Bhumi3D loads `.env` using `python-dotenv`.

### Cesium loads incorrectly

Make sure:

```text
frontend/public/cesiumStatic/
```

contains:

```text
Assets
Workers
ThirdParty
Widgets
```

### Backend terminal appears busy

Expected. `uvicorn main:app --reload` occupies its terminal while running.

### Frontend terminal appears busy

Expected. `npm.cmd run dev` occupies its terminal while running.

## 40. Quick Start for an Already-Configured Laptop

### Backend

```powershell
cd "X:\SIH - 2026\Bhumi3D\backend"
.\venv\Scripts\Activate.ps1
uvicorn main:app --reload
```

### Frontend

```powershell
cd "X:\SIH - 2026\Bhumi3D\frontend"
npm.cmd run dev
```

### Browser

```text
http://localhost:5173
```

Confirm:

```text
Backend: Connected
```

and begin development.

## 41. Prototype Terminology

Bhumi3D currently uses proposed linked spatial IDs for vertical properties.

These are prototype IDs used by the project.

Do **not** describe the current child-ID format as an official government 3D ULPIN standard.

## 42. Successful Fresh-Setup Checklist

A completely fresh Windows setup was successfully brought to this state:

```text
Git ✅
Python ✅
Node.js ✅
npm ✅
PostgreSQL ✅
PostGIS ✅
pgAdmin ✅
GitHub clone ✅
bhumi3d database ✅
database schema/demo ✅
FastAPI ✅
React/Vite ✅
Cesium ✅
Backend connected ✅
Property search ✅
Cadastral hierarchy ✅
3D property visualization ✅
```

If you reach the same state, your Bhumi3D development environment is ready.
