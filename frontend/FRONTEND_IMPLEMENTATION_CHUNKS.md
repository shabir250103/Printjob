# Libin Prints React frontend: modules and implementation chunks

Recent hardening: private query/screen state is cleared across session and permission changes; staff Out Job edits omit admin-only finance inputs; payment status is calculated from recorded amounts. Customer/vendor payment creation uses searchable job and named cash-account choices. See [First hardening release](../SECURITY_AND_PAYMENT_HARDENING.md) for rollout requirements and tests.

This plan describes the React app in `D:\libinprints\frontend` and its Django REST API in `D:\libinprints\backend\job`. All API paths below start with `/api/`. **Current** means there is a usable screen or action in the React app today; **next** means the backend endpoint exists but the described frontend feature still needs work.

## Shared API contract

| User action | Request | Frontend behavior |
| --- | --- | --- |
| Sign in | `POST /api/auth/login/` with `{username, password}` | Save returned token; load user and module permissions. |
| Reopen app | `GET /api/auth/me/` | Restore user and permissions from the saved token. |
| Sign out | `POST /api/auth/logout/` | Revoke token and clear local session. |
| List/search CRUD records | `GET /api/<resource>/?search=<text>` | Show table and loading/empty/error states. Search is supported by the CRUD ViewSets; payment/transfer lists do not currently use the shared search filter. |
| Create record | `POST /api/<resource>/` with JSON or multipart form data | Open `/<module>/new` as a full page; show validation errors and return to the list after success. |
| Edit record | `PATCH /api/<resource>/{id}/` with the visible, non-empty form fields | Refresh the list and lookup choices after success. |

The HTTP client adds `Authorization: Token <token>` to protected requests. React route and menu visibility use the `permissions` object returned by login or `/auth/me/`; Django still enforces the permission on every API request. A `401` clears the local session. The development Vite server proxies `/api/` to Django at `http://127.0.0.1:8000` by default.

The shared CRUD form sends numeric IDs for single related records and arrays of numeric IDs for assigned users/departments. Example: `{"designer": 3, "assigned_users": [3, 5], "assigned_departments": [1, 2]}`. Creation now has a dedicated route for every resource, and role creation uses `/roles/new`; editing still uses a dialog. Pipeline conversion has full pages at `/pipeline/{id}/convert-to-in-job` and `/pipeline/{id}/convert-to-out-job`. The app does not yet have dedicated job detail pages, pagination, delete controls, or universal relation pickers.

## Shared job board

The `/job-board` screen is available to anyone with Job Board permission plus in-job or out-job module access. It polls `GET /in-jobs/available/`, `GET /out-jobs/available/`, and the corresponding `/my-jobs/` endpoints every 10 seconds. Available jobs are broadcast as limited previews to permitted users in the assigned department (or all permitted users when no department is specified). Staff press **Accept job**, which posts to `/{kind}/{id}/accept/`; the first successful claim unlocks the full details in **My accepted jobs**, and only that user can press **Start work**. The claimed job disappears from all other users' lists. In-job and out-job forms can still record multiple collaborators, but collaborators cannot see a claimed job's details unless they were the claimant.

Production-to-delivery handoff: after pipeline conversion, the claimant starts work from the Job Board. In Jobs require both printing and finishing to be `completed`; Out Jobs require status `completed`. Saving the final status creates/promotes one `ready` Delivery record. The job lists show its `delivery_status` and a success message with a Deliveries link for permitted users. Delivery staff then update the delivery itself to dispatched/delivered or failed.

The superadmin-only Job Board tab shows how many employees accepted offers, total accepted In/Out Jobs, each employee's accepted count, and the associated project number, name, customer, status, and acceptance time. It uses `GET /job-board/accepted-summary/`; regular employees continue to see only their own accepted jobs.

Superadmins also see every created, assigned, and accepted In/Out Job in the main job lists. Those lists add creator and accepter columns for superadmins. Regular staff still see only jobs they accepted in these lists; open offers remain on the Job Board.

## Chunk 1 — Identity, navigation, and dashboard

**Current frontend:** `/login`, the authenticated app shell, permission-aware sidebar, `/`, and `/notifications`.

| Module | Function | Backend API | State |
| --- | --- | --- | --- |
| Login/session | Sign in, restore session, sign out | `POST /auth/login/`, `GET /auth/me/`, `POST /auth/logout/` | Current |
| Permissions | Hide restricted routes/menu entries | Permission map in auth response; backend module permission on each request | Current |
| Dashboard | Show job, printing, payment, cash, stock, machine, wastage, and notification KPIs | `GET /dashboard/` | Current |
| Recent jobs | Show latest in-house and outsourced jobs | `GET /in-jobs/`, `GET /out-jobs/` | Current, basic list |
| Notifications | List own notifications, filter by read state/type, mark one or all read, and show a live unread badge | `GET /notifications/`, `GET /notifications/?read=false`, `POST /notifications/{id}/mark-read/`, `POST /notifications/mark-all-read/` | Current |

Dashboard metric cards now open filtered printing, delivery, low-stock, and unread-notification lists. The top bar refreshes the unread count every 30 seconds and immediately after a mark-read action. Chunk 1 is complete at its planned scope.

## Chunk 2 — Organization and master data

Configure this chunk before assigning staff or processing jobs.

| Module / route | Function | Backend API | State |
| --- | --- | --- | --- |
| Departments `/departments` | Create, edit, activate/deactivate teams | `GET/POST /departments/`, `PATCH /departments/{id}/` | Current |
| Users `/users` | Create/edit staff, select a role and department; password is write-only | `GET/POST /users/`, `PATCH /users/{id}/`, `GET /roles/?is_active=true`, `GET /departments/?is_active=true` | Current |
| Roles `/roles` | Define module defaults per role with a permission switch for every module | `GET/POST /roles/`, `PATCH /roles/{id}/` | Current |
| Per-user permission overrides `/permissions` | Choose a user, compare role defaults, and allow/deny individual modules | `GET /permission-overrides/user-options/`, `GET /permission-overrides/?user={id}`, `POST /permission-overrides/`, `PATCH /permission-overrides/{id}/` | Current |
| User profiles | Maintain role, department and profile active status | `GET/POST /user-profiles/`, `PATCH /user-profiles/{id}/` | Next: user form handles common fields, no separate screen |
| Customer types | Define customer classifications | `GET/POST /customer-types/`, `PATCH /customer-types/{id}/` | Next: no React screen |
| Customers `/customers` | Maintain contacts, GST and addresses | `GET/POST /customers/`, `PATCH /customers/{id}/` | Current |
| Machines `/machines` | Maintain equipment and default/active state | `GET/POST /machines/`, `PATCH /machines/{id}/` | Current |
| Stock items `/stock` | Define material variants and minimum levels | `GET/POST /stock-items/`, `PATCH /stock-items/{id}/` | Current |
| Cash accounts | Define accounts and view balances | `GET/POST /cash-accounts/`, `PATCH /cash-accounts/{id}/` | Next: no React screen |

The access portion of Chunk 2 is complete: an administrator can create a department, role and user, assign the user to a role/department, set role defaults and per-user overrides, and select the resulting user/department in job forms. The signed-in user's permissions refresh on window focus, every 60 seconds, and after relevant edits. React hides restricted menu entries and routes; Django checks every API request. If dashboard access is denied, login opens the first permitted screen. Customer types, cash accounts and a separate user-profile screen remain for later master-data work.

## Chunk 3 — Sales: follow-ups and pipeline

```text
Follow-up → Pipeline brief → Design/quote/approval → Convert to In Job or Out Job
```

| Module / route | Function | Backend API | State |
| --- | --- | --- | --- |
| Follow-ups `/follow-ups` | Create/edit enquiry details, due date and completion | `GET/POST /follow-ups/`, `PATCH /follow-ups/{id}/` | Current |
| Pipeline `/pipeline` | Create/edit client, date, type, priority, status, designer, contact, size, quantity, method, quote, remarks, and multiple reference/example design files; add more files on edit | `GET/POST /pipeline-jobs/`, `PATCH /pipeline-jobs/{id}/`, `GET /job-documents/{id}/download/` | Current |
| Designer choices | Choose an active user from the pipeline module | `GET /pipeline-jobs/assignment-options/` | Current |
| Convert internally | Full sectioned In Job form with job-name parsing, customer/stock auto-fill, counters, assignments, production, finishing, delivery, and finance | `GET /pipeline-jobs/{id}/in-job-options/`, `POST /pipeline-jobs/{id}/convert-to-in-job/` | Current action |
| Convert externally | Create one outsourced job; vendor required | `POST /pipeline-jobs/{id}/convert-to-out-job/` | Current action |
| Job files | Attach reference/design/proof files to exactly one job | `GET/POST /job-documents/` | Next: upload screen absent |

**Next:** Pipeline detail page with general document upload and explicit status progression. The dedicated reference-image input is already available in the Pipeline create/edit dialog, and uses multipart upload when an image is selected. Backend conversion prevents a second conversion. The pipeline designer is prefilled into the In Job designer field; the production assignment is selected separately in the conversion form. Assigned users receive a limited offer and only the accepter sees full details.

## Chunk 4 — Production: internal and outsourced jobs

| Module / route | Function | Backend API | State |
| --- | --- | --- | --- |
| In Jobs `/in-jobs` | Manage paper, quantity, clicks, designer, machine, staff, departments, printing/finishing status and cost | `GET/POST /in-jobs/`, `PATCH /in-jobs/{id}/` | Current, shared table/edit form |
| New In Job `/in-jobs/new` | Full grouped create page: parse job name, optionally link Pipeline, auto-fill customer/stock, assign users/department, show Click Count equal to Sheet Count, calculate balance/profit, choose finishing and delivery; each configurable dropdown has an in-page Add new form that saves and selects the choice without leaving the unfinished job | `GET /in-jobs/create-options/`, `POST /in-jobs/`, `POST /in-job-options/` and master-data APIs | Current |
| In Job choices | Load active users, departments and machines without user-admin access | `GET /in-jobs/assignment-options/`, `?kind=departments`, `?kind=machines` | Current |
| Out Jobs `/out-jobs/new` and Pipeline conversion | Dedicated sectioned form for customer/supplier details, description, quantity, delivery, remarks, and admin-only customer/supplier finance. No assignment inputs are shown; unassigned jobs are offered to eligible Job Board users until one accepts. After save, the new job number is confirmed on the Job Board (or the Out Jobs page if board access is unavailable), since the regular Out Jobs list shows accepted jobs only. Supplier expenses and other expenses are separate; balances and profit calculate live. | `GET /out-jobs/create-options/`, `POST /out-jobs/`, `POST /pipeline-jobs/{id}/convert-to-out-job/` | Current |
| Out Job choices | Load active users/departments | `GET /out-jobs/assignment-options/`, `?kind=departments` | Current |

**Next:** Dedicated job detail pages with grouped sections for brief, assignment, production, money, files and delivery. Show assigned names instead of only IDs, support meaningful status transitions and link straight to job stock usage, wastage and payments. Avoid editing received payment totals directly; use payment endpoints.

## Chunk 5 — Shop-floor operations and delivery

| Module / route | Function | Backend API | State |
| --- | --- | --- | --- |
| Stock `/stock` | See available/minimum quantities and low-stock flag | `GET /stock-items/`, `GET /stock-items/?low_stock=true` | Current list; filter next |
| Stock movement | Add, consume, write off or set verified stock balance | `POST /stock-items/{id}/adjust/` | Current action |
| Stock history | Audit each movement | `GET /stock-movements/` | Next: no React screen |
| Machine status `/machines` | Change running/stopped/breakdown/maintenance state with reason | `POST /machines/{id}/set-status/` | Current action |
| Machine counters | Enter one daily counter, show actual and booked click difference | `GET/POST /machine-counters/`, `PATCH /machine-counters/{id}/` | Next: no React screen |
| Machine history | View recorded status changes | `GET /machine-status-history/` | Next: no React screen |
| Wastage `/wastage` | Record quantity, reason, machine/material/job and date | `GET/POST /wastage/`, `PATCH /wastage/{id}/` | Current; related fields are numeric IDs |
| Deliveries `/deliveries` | Create/update a delivery for exactly one in/out job; status, contact, method and charges | `GET/POST /deliveries/`, `PATCH /deliveries/{id}/` | Current; job fields are numeric IDs |

**Next:** Replace manual related IDs with job/material/machine selectors, add stock movement and machine counter/history screens, and surface delivery actions from each job detail page. The stock adjustment endpoint is the only valid way to change an existing stock balance.

## Chunk 6 — Invoices, customer/vendor payments, and cash

| Module / route | Function | Backend API | State |
| --- | --- | --- | --- |
| Invoices `/invoices` | Create/edit one invoice per in/out job, display GST and total | `GET/POST /invoices/`, `PATCH /invoices/{id}/` | Current; job ID typed manually |
| Customer payments `/customer-payments` | Post advance/payment/balance to a job | `GET/POST /customer-payments/` | Current, create and list |
| Vendor payments `/vendor-payments` | Post vendor payment to an out job | `GET/POST /vendor-payments/` | Current, create and list |
| Cash transfers `/cash-transfers` | Move money between two accounts | `GET/POST /cash-transfers/` | Current, create and list |
| Cash accounts | Show configured accounts and current balances | `GET /cash-accounts/` | Next: no dedicated screen |
| Cash ledger | Show read-only transaction history | `GET /cash-transactions/` | Next: no dedicated screen |

**Next:** Replace manual job/account IDs with searchable selectors, show balance before posting, add payment confirmation and receipts, and connect invoice/payment views to their job detail pages. Payment and transfer endpoints are transactional; the frontend must display their validation errors without assuming a partial payment succeeded.

## Chunk 7 — Reports and operational review

| Module / route | Function | Backend API | State |
| --- | --- | --- | --- |
| Reports `/reports` | View daily, monthly, production, machine, stock, finance and wastage outputs | `GET /reports/daily/`, `/monthly/`, `/production/`, `/machine-usage/`, `/stock/`, `/finance/`, `/wastage/` | Current, basic renderer |
| Additional reports | User performance, customers, outsourced jobs, deliveries, pending work and cash | `GET /reports/user-performance/`, `/customers/`, `/out-jobs/`, `/deliveries/`, `/pending/`, `/cash/` | Next: backend ready, no React tabs |
| Date selection | Limit date-aware reports | `?date=YYYY-MM-DD`, `?month=YYYY-MM`, or `?from=YYYY-MM-DD&to=YYYY-MM-DD` where supported | Next: controls absent |

**Next:** Purpose-built tables and charts, filters, CSV/print exports, and report links from dashboard KPIs. Do not imply a date filter exists on endpoints that currently ignore it.

## Frontend code ownership

| Concern | File |
| --- | --- |
| HTTP base URL, token header, API error formatting | `src/api/client.ts` |
| Login/session/permission state | `src/auth/AuthContext.tsx` |
| Routes and route guards | `src/App.tsx` |
| Sidebar navigation | `src/components/AppShell.tsx` |
| Module definitions, table columns and form fields | `src/config/resources.ts` |
| Shared list, search, create/edit and workflow actions | `src/pages/CrudPage.tsx` |
| Shared input dialog and relation choices | `src/components/RecordDialog.tsx` |
| Dashboard, notifications and reports | `src/pages/DashboardPage.tsx`, `NotificationsPage.tsx`, `ReportsPage.tsx` |

The recommended implementation order is **1 → 2 → 3 → 4 → 5 → 6 → 7**. Existing shared screens provide the starting point for every chunk; each chunk becomes complete when its listed **next** work is implemented and verified against the API.
