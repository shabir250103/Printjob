# First hardening release

Implemented scope: account administration, private browser session data, and posted-payment integrity. This is the first phase of the architecture review, not completion of its entire roadmap.

## Access rules

- Active superusers retain full module access.
- Other users need an active profile. Missing roles grant no default permissions; explicit overrides can grant specific modules to an active profile without a role.
- An inactive role or profile denies module access even if an allow override exists.
- Role permissions must be JSON booleans for known modules.
- Delegated administrators cannot modify superusers, Django staff accounts, or accounts whose current or dormant grants exceed their own permissions.
- Role assignment, role editing, and permission overrides cannot grant permissions beyond the caller's access. Privileged-account roles are protected.
- Profile/override ownership and override module identity cannot be changed by editing existing records.
- Password resets revoke existing API tokens.
- Claimants must retain the corresponding job-module permission to read or attach documents; superusers retain their broader document access.
- Permission override responses and the frontend permission display use the same deny-by-default policy.

Existing role and override records are not rewritten. Before rollout, a superuser should assign suitable roles to employees who previously relied on missing-profile or missing-role access. No automatic broad-access legacy role is created.

## Browser privacy

Logout, account changes, authentication failure, permission changes, and cross-tab authentication changes cancel/remove cached queries and remount private screen state. API responses belonging to older sessions are rejected, including delayed 401 responses that could otherwise sign out the new user. Temporary authentication-refresh network failures do not remove a valid local session.

## Money

- Job creation and pipeline conversion still accept opening customer/supplier advances. They now post payment records within the creation transaction, attributed to the creating user with method `Opening advance`.
- Opening advances do not automatically affect a cash account: the job form does not select one. These receipts are explicitly recorded without a cash-account link.
- Job PATCH/PUT requests cannot change posted advances or force a different payment status. Unchanged values are accepted for compatibility.
- Current and requested values are validated together. Customer and supplier totals cannot be reduced below their respective posted advances.
- Payment statuses are derived from amounts. Zero-value jobs with no receipts remain pending.
- Job API edits acquire the job row before validation/save on databases that support row locking. SQLite does not supply SELECT FOR UPDATE row locking; production concurrency/idempotency work remains necessary.
- Django job administration shows finance fields read-only and directs new-job creation through the application. Its descriptive saves update only changed non-financial fields, avoiding stale financial overwrites.
- Staff Out Job edit forms omit admin-only finance fields; their list also omits hidden finance columns. Create forms display calculated payment status.

Existing historical advances are not backfilled into payment history in this release. Reconcile them before using payment sums as a complete historical ledger. Existing invoices and GST calculations are unchanged; choosing the authoritative invoice/job amount is still a separate policy decision.

## Verification

Backend: `python manage.py test libinjobs` from `backend/job`.

Frontend: `npm test` and `npm run build` from `frontend`.

The added tests cover delegated-account restrictions, permission defaults and inactive roles, password-token revocation, opening receipts, payment-edit rejection, below-paid total rejection, staff completion, session switching/revocation, delayed HTTP responses, and staff edit payloads. They use synthetic test data only.

No database schema migration or business-data rewrite is required for this release. Restart the backend and refresh/rebuild the frontend when deploying.

## Remaining roadmap

Request idempotency and database concurrency testing; pipeline conversion exclusivity across all write paths; guarded delivery transitions; pause/resume; invoice reconciliation; historical opening-balance reconciliation; connected reference files and job workspace; operations reconciliation and report completeness.
