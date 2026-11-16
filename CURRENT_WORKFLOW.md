# Current Libin Prints workflow

This diagram shows the implemented paths. Quotations and Enquiries can support sales, but they are not automatically connected to Pipeline yet.

```mermaid
flowchart TD
    Start([Customer request]) --> Enquiry[Enquiry: capture contact, product, quantity, quote and follow-up date]
    Start --> Pipeline[Create Pipeline job directly]
    Enquiry -. Manual: create a Pipeline job and re-enter/copy details .-> Pipeline

    Start --> Quote[Create Quotation: customer, line items, discount, GST, validity]
    Quote --> QStatus{Quotation status}
    QStatus -->|Draft / Sent| Quote
    QStatus -->|Accepted| Accepted[Accepted is recorded manually]
    QStatus -->|Rejected / Cancelled| QEnd([Quotation retained in history])
    Accepted -. Manual: create a Pipeline job separately .-> Pipeline
    Quote -. Print / Save PDF in browser .-> Customer[Send quotation to customer manually]

    Pipeline --> PStatus{Pipeline status}
    PStatus -->|New / Progress / Designing / Quoted / Approved / On Hold| Pipeline
    PStatus -->|Cancelled| PEnd([Pipeline ends])
    PStatus -->|Convert to In Job| InDetails[Complete In Job details: stock, printing, finishing, assignment and finance]
    PStatus -->|Convert to Out Job| OutDetails[Complete Out Job details: supplier, description, delivery, assignment and finance]
    InDetails --> Offer[Job offered to assigned users and/or department]
    OutDetails --> Offer
    Offer --> Claim{Employee accepts first?}
    Claim -->|No, another employee accepts| Unavailable[Offer removed from other employees' available board]
    Claim -->|Yes| Private[Only accepter and privileged roles can open full details]
    Private --> Work[Accepter starts work]
    Work --> Progress[Update production/status and job information]
    Progress --> Complete{Production completed?}
    Complete -->|No| Progress
    Complete -->|Yes: In Job printing AND finishing complete; Out Job status Completed| PaymentCheck{Customer balance fully paid?}
    PaymentCheck -->|No| AwaitPayment[Awaiting payment; no Ready delivery]
    AwaitPayment --> RecordFinal[Record remaining customer payment]
    RecordFinal --> AutoDelivery[System creates a Ready delivery]
    PaymentCheck -->|Yes| AutoDelivery
    JobAmountChanged[Customer total increased before dispatch] -->|If balance becomes due again| AwaitPayment
    AutoDelivery --> Dispatch[Delivery team updates Pending / Ready / Dispatched]
    Dispatch --> Delivered[Delivered or Failed]

    InDetails -. Customer advance / payment .-> CustomerPay[Customer Payments]
    OutDetails -. Customer advance / payment .-> CustomerPay
    OutDetails -. Supplier settlement .-> VendorPay[Vendor Payments]
    CustomerPay --> Cash[Optional cash account posting updates balance]
    VendorPay --> Cash
    Finance[Manual Finance: credit in, debit or expense out] --> Cash
    CashTransfer[Cash Transfer between accounts] --> Cash
    Cash --> CashReports[Cash balances and transaction history]
```

## Current module responsibilities

| Module | What happens there | Important handoff |
| --- | --- | --- |
| Enquiries | Record prospective work and a follow-up date, customer contact, job type, quantity, method, quote, and remarks. Completion is tracked as a flag. | Staff create a Pipeline job manually when ready. |
| Quotations | Create a numbered quote with customer snapshot, line items, quantity/rate, discount, GST, validity, terms, and status; print or save the saved quote as PDF. | Accepted status does not create an Enquiry or Pipeline job. Sending is manual; there is no email automation. |
| Pipeline | Track prospective jobs through New, Progress, Designing, Quoted, Approved, or On Hold. Cancelled ends it. | Convert once to either In Job or Out Job. Converted Pipeline record is marked accordingly. |
| In Jobs | Capture in-house print/stock, sheet/click, machine, finishing, customer finance, and staff/department assignment. | Printing and finishing must both be Completed. A Ready delivery is created only when the customer balance is also fully paid. |
| Out Jobs | Capture customer work, supplier (existing Supplier or manual name), job description, due date, supplier/customer finance, and assignment. | Status Completed plus full customer payment creates a Ready delivery. |
| Job Board | Shows eligible offers. Assigned employees or department members can accept. An atomic claim means only one employee accepts. | Only the accepter sees full job details and can start work. Superadmin has broad visibility. |
| Delivery | A Ready delivery is created after production is complete and customer payments cover the full job total. | Update through Dispatched and then Delivered or Failed. A failed delivery can be rescheduled by updating its date/details. |
| Finance | Posts manual Credit (cash in), Debit (cash out), or Expense (cash out) against an account. | Does not settle job balances. Use Customer Payments and Vendor Payments for those. |
| Customer Payments | Record customer receipts against an In Job or Out Job; optionally post to a cash account. | Updates job paid amount/status and, when selected, cash balance. |
| Vendor Payments | Record payments for an Out Job supplier; optionally post to a cash account. | Updates supplier paid amount/status and, when selected, cash balance. |
| Cash Transfers | Move funds between active cash accounts. | Creates transfer-out and transfer-in cash movements. |

## Assignment and visibility

```mermaid
sequenceDiagram
    participant Admin as Creator / Admin
    participant Board as Job Board
    participant Team as Assigned employees / department
    participant Winner as First accepter
    Admin->>Board: Create job and offer to users and/or department
    Board-->>Team: Show brief offer, not full job details
    Team->>Board: Compete to accept
    Board->>Board: Claim only if accepted_by is still empty
    Board-->>Winner: Acceptance succeeds; attach accepter to job
    Board-->>Team: Other claim attempts receive unavailable response
    Winner->>Board: Start work
    Board-->>Winner: Full job details; update access stays with accepter
```

The creator chooses individual users, departments, or both. A department assignment makes its members eligible; a user assignment makes those selected users eligible. Admin, Finance, and Dispatch visibility follows their existing module access. The assigned/accepted worker also needs their relevant job-module and Job Board permissions to use the offer actions.

## Finance flow

```mermaid
flowchart LR
    CustomerReceipts[Customer Payments] -->|optional account| Account[Cash account balance]
    SupplierPayments[Vendor Payments] -->|optional account| Account
    Credit[Finance credit] -->|increase| Account
    Debit[Finance debit] -->|decrease; reject overdraft| Account
    Expense[Finance expense] -->|decrease; reject overdraft| Account
    TransferOut[Cash transfer source] -->|decrease| Account
    TransferIn[Cash transfer destination] -->|increase| Account
    Opening[Job opening advance] -. recorded against job; no account selected in job form .-> Job[Job paid balance]
```

## Deployment note

The Quotations schema migration is `0018`. Apply it with `python manage.py migrate` from `backend/job` before using the new module on a database that has not received this migration. Enable the **Quotations** module in staff roles as needed. See [Quotation module notes](QUOTATIONS.md) and [Finance and supplier module notes](BUSINESS_MODULES.md).
