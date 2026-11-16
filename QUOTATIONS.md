# Quotation module

- Open **Quotations** from the sidebar. Create and edit forms open on separate pages.
- Select an existing customer or enter customer details manually. Saved contact and address fields are snapshots, so changing the customer master does not rewrite an existing quotation.
- Add up to 100 line items with description, quantity, and unit price. Quantities must be positive; prices can be zero.
- Set the quotation date, optional valid-until date, discount amount, GST percentage, notes, and terms.
- References use `QUO-` plus the database ID and remain stable after edits.
- Server totals round each item to two decimals, subtract discount, then calculate GST with decimal half-up rounding. Client totals are estimates; saved server totals are authoritative.
- Status options: Draft, Sent, Accepted, Rejected, Cancelled. These are manually recorded statuses; Sent does not email the customer and Accepted does not automatically create a job.
- Open a saved quotation to print it or use the browser's Save as PDF option. The printed document uses saved values, not unsaved edits.
- Quotations do not post cash, receipts, invoices, or supplier payments. Use the existing production and payment modules separately.
- Records cannot be deleted through this API; use Cancelled to retain history. This first version allows edits in every status and does not include revision history or automatic conversion to Pipeline.

## Access and API

Superadmins have access automatically. Enable **Quotations** in staff Roles or Permissions. It is independent of Finance and Customers administration.

- `GET/POST /api/quotations/`
- `GET/PATCH/PUT /api/quotations/{id}/`
- `GET /api/quotations/customers/` provides customer autofill choices for authorized quotation users.

Required creation fields: `customer_name`, `items` (each item: `description`, `quantity`, `unit_price`). Optional contact/address/validity/notes/terms fields accept null. `quotation_number`, `totals`, `grand_total`, author, and timestamps are server-controlled.

Apply migration `0018` on each deployment with `python manage.py migrate` from `backend/job`, restart Django, and deploy the updated frontend.
