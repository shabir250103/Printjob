# Enquiries, Suppliers, and Finance

## Screens and permissions

- `/enquiries`: replaces Follow-ups. Existing records and `followups` role grants are retained. Old screen URLs redirect, and `/api/follow-ups/` remains compatible. The new API is `/api/enquiries/`. Fields include enquiry date, customer name, contact, job type, size, quantity, printing method, quote, remarks, and completed flag.
- `/suppliers`: supplier name, contact person, mobile, email, GST number, address, services, notes, and active flag. Optional contact fields accept null. Requires the new `suppliers` permission; grant it in Roles or Permissions. Superadmins have access automatically. Deactivate suppliers rather than deleting them.
- `/finance`: manual credit, debit, and expense ledger plus all-time manual totals and current active account balances. Requires `finance`. Existing customer receipts and supplier job payment screens remain separate and are linked here.

Create forms open on their own pages. Supplier and enquiry edits use the existing edit dialog.

## Supplier connection

Out Job creation and Pipeline-to-Out-Job conversion offer an Existing Supplier dropdown. Selection saves a protected supplier foreign key and a supplier-name snapshot in the existing `vendor` field. Manual supplier names remain supported for compatibility. Existing text-only jobs are not automatically linked by name, avoiding ambiguous matches. Finance entries can optionally reference a supplier, but do not settle that supplier's job balance.

## Finance posting

POST `/api/finance-entries/` with:

```json
{
  "entry_type": "expense",
  "amount": "250.50",
  "entry_date": "2026-10-18",
  "account": 1,
  "category": "Utilities",
  "description": "Office electricity",
  "request_key": "8b5157c0-197d-4fd4-91aa-ad9ed86a34f9"
}
```

Use a real active account ID. Optional fields: `supplier`, `category`, `reference_no`.

- Credit adds cash; debit and expense subtract cash. Amounts must be positive and overdrafts are rejected.
- Posting the entry, cash movement, and account balance is atomic. Entries are append-only through both API and Django admin.
- Keep the same UUID when retrying the same submission. Repeats return the original entry without posting twice; changed details under the same UUID are rejected. The React form retains its UUID for retries during that form session. After a reload or uncertain response, check the ledger before creating a new submission.
- GET `/api/finance-entries/` lists entries; `?search=` searches type, description, category, reference, and supplier name.
- GET `/api/finance-entries/summary/` returns manual totals and active cash balances. Totals exclude job receipts, supplier job payments, and transfers, so they are not a complete financial statement.
- GET `/api/finance-entries/accounts/` and `/suppliers/` provide permitted choices without requiring cash-account administration or supplier-management permissions.
- `/cash-accounts` allows users with `cash` permission to create accounts with opening balances. The existing model supports one account per account type.

Use Customer Payments and Vendor Payments to settle jobs; do not duplicate these payments as manual finance entries. This is a cash-movement register, not a double-entry general ledger or accounts-payable reconciliation system.

For delivery release, production must be complete and the customer's full job total must be recorded as paid. The final Customer Payment automatically creates or releases the Ready delivery if production has already finished. If payment arrives first, the Ready delivery is created when production is completed. Delivery API and admin validation enforce this gate.

## Database rollout

Migrations `0016` and `0017` add supplier and finance-entry tables, enquiry contact number, the supplier permission choice, and an optional supplier relationship on Out Jobs. Existing enquiries and job records are preserved. No historical money movements or supplier identities are inferred.

Run `python manage.py migrate` from `backend/job` on each deployed environment and restart Django and the frontend. PostgreSQL is recommended for production concurrent financial posting; SQLite does not provide PostgreSQL-style row locks. Regression tests use synthetic test records, not production records.
