# Libin Prints Backend Workflow

Current access and financial safeguards are documented in [First hardening release](../../SECURITY_AND_PAYMENT_HARDENING.md). Accounts without configured access no longer receive legacy full access; opening advances are recorded as payments, and job edits cannot overwrite posted money.

## 1. Request lifecycle

```text
Client request
    -> Token authentication
    -> Role and module-permission check
    -> Serializer validation
    -> ViewSet/API action
    -> Transactional service (for sensitive workflows)
    -> Django model and database constraints
    -> JSON response
```

All business APIs are under `/api/`. After login, the client sends the token as:

```http
Authorization: Token <token>
```

## 2. Authentication and authorization

1. The client posts `username` and `password` to `POST /api/auth/login/`.
2. Django validates the credentials and returns a token, user profile, role, department, and effective module permissions.
3. `GET /api/auth/me/` reloads the current user and permissions.
4. Each module request passes through `ModuleAccessPermission`.
5. Superusers can access every module.
6. For regular profiled users, an explicit user override is evaluated first; otherwise the role default is used.
7. `POST /api/auth/logout/` deletes the current user's token.

Permission modules include dashboard, pipeline, in jobs, out jobs, delivery, stock, customers, machines, cash, wastage, finance, accounts, reports, notifications, follow-ups, users, and permissions.

## Shared job offers (first acceptance wins)

New pending in-jobs and pending/sent out-jobs appear on the job board until accepted. `GET /api/in-jobs/available/` and `GET /api/out-jobs/available/` show the same open offers to every active user with the corresponding module permission. If a job has assigned departments, only users in one of those departments see it; a job with no assigned department is open to all users with module access. Superusers can see all offers. The legacy `assigned_users` list is for collaborators and does not restrict offer visibility.

`POST /api/{in-jobs|out-jobs}/{id}/accept/` atomically claims an eligible offer for the first requester, records `accepted_by` and `accepted_at`, and adds that person to `assigned_users`. Later attempts return HTTP 409. Only the claimant appears in `GET /api/{in-jobs|out-jobs}/my-jobs/` and may call `POST /api/{in-jobs|out-jobs}/{id}/start/`. Other manually assigned users remain recorded as collaborators, but cannot see the claimed task's details. Directly setting `in_progress` before a start is rejected. These endpoints require both Job Board and the corresponding In Jobs or Out Jobs module permission. Migration 0008 preserves existing roles' board access based on their prior job permissions.

Available offers and creation/conversion responses contain only job number, type, priority, and status. They omit customer, contact, price, remarks, and other full fields. Regular In Jobs/Out Jobs lists and detail/edit URLs return only records accepted by the current user; unaccepted jobs are visible as previews only on the Job Board. Detailed pending/out-job reports and job documents are likewise restricted to the claimant. Once claimed, the offer disappears from everyone else's available list and only the claimant receives full job data.

Superusers are the exception: In Jobs and Out Jobs list/detail/edit endpoints return all jobs, including unaccepted offers and jobs claimed by other staff. Their job documents and pending/out-job reports are likewise unrestricted by claimant. Staff users retain the accepted-by-self privacy rule, and `my-jobs` remains personal even for a superuser.

`GET /api/job-board/accepted-summary/` is restricted to superusers. It aggregates accepted In/Out Jobs across employees and returns totals plus each employee's accepted project number, name, customer, status, and acceptance time. Unaccepted offers are excluded; the regular user-facing list and detail permissions remain unchanged.

Out Job creation uses `GET /api/out-jobs/create-options/` for active customers and eligible assignees. `POST /api/out-jobs/` and Pipeline `POST /api/pipeline-jobs/{id}/convert-to-out-job/` accept customer/supplier details, description, quantity, priority, delivery choices, remarks, and assignments. The conversion route also accepts admin finance and supplier-payment fields. Supplier expenses and general expenses are stored separately; profit subtracts both. Customer and supplier advances may not exceed their respective totals. Out Job detail/list APIs restrict finance and supplier-payment values to superusers; supplier expenses remain part of the general job details. New Out Jobs start pending: start/completion happen through the Job Board, and delivery completion is recorded in the Delivery module.

When the Out Job form does not specify users or departments, the saved job has no assignment and is an open offer to eligible Job Board users. The regular Out Jobs list intentionally contains only jobs accepted by the current user; a successful create response returns the new job number even before it appears in that list. Optional Out Job contact, description, transport, remarks, and invoice text fields allow database NULL; missing numeric amounts use zero, delivery checkboxes use false, and optional customer/Pipeline links and delivery date remain nullable.

## 3. Setup and master data

Administrators normally configure the following before processing jobs:

1. Departments: `GET/POST /api/departments/`
2. Roles: `GET/POST /api/roles/`
3. Users and profiles: `GET/POST /api/users/`
4. Permission overrides: `GET/POST /api/permission-overrides/`
5. Customer types and customers: `/api/customer-types/`, `/api/customers/`
6. Machines: `/api/machines/`
7. Stock items: `/api/stock-items/`
8. Cash accounts: `/api/cash-accounts/`

## 4. Enquiry and pipeline workflow

```text
Customer enquiry
    -> Optional follow-up
    -> Pipeline job (PL-YYYY-NNNNNN)
    -> Designing / quoted / approved
    -> Convert once to either:
       |-> In Job  (internal production)
       `-> Out Job (external vendor)
```

1. Sales can record an enquiry in `/api/follow-ups/` and mark it complete later.
2. A pipeline job is created through `POST /api/pipeline-jobs/`.
3. The backend automatically generates a number such as `PL-2026-000001`.
4. The Pipeline form offers `new`, `progress`, and `cancelled`; older `designing`, `quoted`, `approved`, and `on_hold` statuses remain supported for existing workflows.
5. The Pipeline form accepts client name, job date/type, priority/status, designer, contact, size, quantity, printing method (Digital, Offset, Screen Printing, Flex, Foam, Signage, ID Card, Gifting, or Others), quote, remarks, and optional multiple `reference_files` in one multipart create/edit request. Each reference/example design file must be PDF, JPG, JPEG, or PNG and at most 10 MB. They are appended as `JobDocument` records (kind `reference`), returned as `reference_documents` names and IDs, and can be downloaded with Pipeline permission at `GET /api/job-documents/{id}/download/`. Existing single `reference_image` uploads remain supported for compatibility; authorized users view those through `GET /api/pipeline-jobs/{id}/reference-image/`.
6. An approved pipeline item is converted using one of these mutually exclusive actions:
   - `POST /api/pipeline-jobs/{id}/convert-to-in-job/`
   - `POST /api/pipeline-jobs/{id}/convert-to-out-job/`
7. Conversion copies the customer, contact, job type, quantity, priority, and remarks.
8. Out-job conversion requires a vendor.
9. Database locking and an atomic transaction prevent the same pipeline job from being converted twice.

For in-house conversion, `GET /api/pipeline-jobs/{id}/in-job-options/` supplies active customers, stock from every category, machines, eligible users, departments, and job types. The conversion POST accepts the complete In Job form: counter readings; job name/date/type/customer/contact/file; individual users or `everyone_in_department`; stock, paper, GSM, size, quantity, side, sheets, wastage, printer/designer/machine; finishing and delivery choices; finance, GST, and remarks. A name such as `bas_Naidu_300gsm_SS_Matt_1+7-8sheet` auto-parses initials, customer, GSM, side, lamination, colour, and sheet count. Selected customer and stock fill their related fields; explicitly supplied field values take precedence. `current_count = morning_count + counter_click_count`, while production `click_count = sheet_count` regardless of quantity or side. The default active machine is selected if no machine is supplied; GST defaults to 18%. The action creates one pending In Job offer, not an accepted job: only the eventual accepter can access full details, as described above.

Direct In Job creation uses `GET /api/in-jobs/create-options/` for the same customer, stock, machine, staff, department, and job-type choices, plus unconverted Pipeline jobs when the caller has Pipeline access. `POST /api/in-jobs/` accepts the full In Job form, including optional `pipeline_job` and `everyone_in_department`. Linking a Pipeline job uses the same atomic one-time conversion and updates its status to `converted_in`; an unlinked job is created directly. Customer/stock/name auto-fill, explicit-field precedence, default machine, GST default, and production clicks equal to sheet count apply to both routes. Editing sheet count updates click count; editing quantity or side does not alter it. The direct-create response remains a limited job offer until someone accepts it.

In Job dropdowns can add reusable options through `POST /api/in-job-options/` with `field_name`, `label`, and, for fixed workflow fields, `base_value`. Supported fields are priority, side, payment status, job type, lamination, and binding. Custom priority/side/payment labels map to a built-in value (`low`/`normal`/`high`/`urgent`, `SS`/`DS`, or `unpaid`/`partial`/`paid`) rather than changing calculation or payment semantics. In Job records retain the selected custom-label IDs while canonical fields keep workflow logic intact. The create-option lists include these options; data-backed dropdowns use their existing master-data create APIs.

## 5. Internal production workflow

An internal job receives an `IN-YYYY-NNNNNN` number.

```text
Pending printing
    -> In progress
    -> Printing completed
    -> Finishing pending/in progress
    -> Finishing completed
    -> Ready delivery created automatically
```

The record contains customer and job details, paper/stock selection, sheet and click counts, machines, designer, assigned users/departments, printing and finishing status, amounts, GST, and payment status.

Typical operations are:

1. Update production details through `/api/in-jobs/{id}/`.
2. Attach job files through `/api/job-documents/`.
3. Consume paper using `/api/stock-items/{id}/adjust/` with movement type `out` and the in-job ID.
4. Record printing or finishing loss in `/api/wastage/`.
5. Record daily machine counts in `/api/machine-counters/`.
6. Create the invoice and record customer payments.
7. Once both printing and finishing are marked `completed`, the backend creates one `ready` delivery automatically (or promotes an existing `pending` delivery). Repeated saves do not duplicate it. The completed production statuses cannot be reopened; delivery is progressed separately.

Printing and finishing each support `pending`, `in_progress`, `completed`, `on_hold`, and `cancelled`.

## 6. Outsourced production workflow

An outsourced job receives an `OUT-YYYY-NNNNNN` number.

```text
Pending
    -> Sent to vendor
    -> In progress
    -> Ready
    -> Completed
    -> Ready delivery created automatically
```

The out job tracks both sides of the transaction:

- Customer total, customer advance, customer balance, and payment status.
- Vendor total, vendor advance, vendor balance, and vendor payment status.

Customer money is posted through `/api/customer-payments/`; vendor money is posted through `/api/vendor-payments/`.

Marking an accepted and started out-job `completed` creates one `ready` delivery (or promotes its existing `pending` delivery). Completion cannot be reversed through the job status field.

## 7. Stock workflow

Stock changes are made only through:

`POST /api/stock-items/{id}/adjust/`

Supported movement types are:

- `in`: adds received stock.
- `out`: removes consumed stock.
- `wastage`: removes wasted stock.
- `adjustment`: sets the verified balance to the supplied quantity.

The operation locks the stock row, prevents negative balances, updates `current_stock`, and writes an immutable stock-movement history entry. Movements may reference one in job or one out job. `/api/stock-movements/` is read-only.

## 8. Machine workflow

1. Machines are managed at `/api/machines/`.
2. Status changes use `POST /api/machines/{id}/set-status/`.
3. Stopped or breakdown states require a reason.
4. Every status change creates a read-only history entry.
5. One counter record per machine per day stores morning count, ending count, and booked job clicks.
6. The backend calculates actual clicks and the difference from booked clicks.

## 9. Delivery workflow

Each delivery belongs to exactly one in job or one out job.

```text
Pending -> Ready -> Dispatched -> Delivered
                            `-> Failed
```

Delivery records include the date, address, contact, method, transporter, charges, and instructions. They are managed at `/api/deliveries/`. Production completion copies the job's customer/contact into the ready delivery. Delivery staff then enter address/method and advance it through dispatch and delivered/failed. In/out job API responses include read-only `delivery_status` so the production screen shows the handoff.

## 10. Invoice, payment, and cash workflow

### Customer payment

```text
Customer payment
    -> Validate against outstanding job balance
    -> Create payment record
    -> Update job advance and payment status
    -> Credit selected cash account
    -> Create immutable cash transaction
```

The entire operation is atomic. An overpayment fails without partially updating the job or account.

### Vendor payment

```text
Vendor payment
    -> Validate against vendor balance
    -> Create vendor payment
    -> Update vendor advance/status
    -> Debit selected cash account
    -> Create immutable cash transaction
```

### Cash transfer

`POST /api/cash-transfers/` locks both accounts, debits the source, credits the destination, and creates balanced transfer ledger records in one transaction. The source and destination must differ, and the source cannot become negative.

Invoices belong to exactly one job. GST amount and grand total are calculated from subtotal and GST percentage.

## 11. Notifications

- `GET /api/notifications/` returns only the logged-in user's notifications.
- `POST /api/notifications/{id}/mark-read/` marks one notification read.
- `POST /api/notifications/mark-all-read/` marks the filtered notification collection read.
- Notifications can be filtered by read state and type.

## 12. Dashboard and reports

`GET /api/dashboard/` returns job totals, active pipeline count, printing/completed/delivered counts, pending-payment count, low-stock count, current-day machine clicks and wastage, available cash, urgent jobs, and unread notifications.

Report endpoints under `/api/reports/` provide:

- Daily and monthly summaries
- Production totals
- User performance
- Machine usage
- Stock and low-stock information
- Customer totals
- Out jobs and deliveries
- Pending jobs
- Wastage
- Finance totals
- Cash accounts and recent transactions

## 13. Transaction and validation boundaries

The following operations use database transactions and row locks where balances or workflow exclusivity matter:

- Pipeline conversion
- Stock adjustment
- Machine status change
- Customer payment
- Vendor payment
- Cash transfer

Model constraints additionally enforce non-negative stock and cash balances, positive movement/payment quantities, unique job numbers, one machine counter per day, and exactly-one-job relationships for documents, invoices, deliveries, and customer payments.

