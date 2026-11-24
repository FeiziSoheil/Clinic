# Project Overview: Advanced Clinic Appointment System

You are building the backend for a comprehensive and modern Clinic Appointment System. 
This is not a simple CRUD app; it includes complex business logic, wallet settlement, and smart queue management.

## 1. User Roles & RBAC
The system serves 4 types of users:
- PATIENT: Can search doctors, book/cancel appointments, manage family accounts, view their EHR (Electronic Health Record), manage wallet balance, and leave a review after a completed visit.
- DOCTOR: Can view their daily schedule, accept/reject patients, write medical records (EHR), view their financial share, and reply to approved patient reviews.
- RECEPTIONIST: Manages the live waiting room, handles walk-in patients, checks in/outs, and overrides schedules if necessary.
- ADMIN (Clinic Manager): Has full access to manage branches, doctor shifts, financial reports, review moderation, and system settings.

## 2. Core Business Features & Workflows
When writing the services, you MUST implement the following business logic:

### A. Smart Booking & Availability
- Doctors have specific shifts (e.g., Monday 09:00 to 13:00) in specific branches.
- Appointments can only be booked if the time slot is strictly within the shift and does not overlap with other confirmed appointments.
- Exceptions/Leaves: If a doctor is on leave, no bookings can be made for that date.

### B. Waiting List Engine (Smart Queue)
- If a doctor's schedule is full, a patient can join the `WaitingList`.
- When an existing appointment is canceled, the backend must automatically trigger a process to fetch the first person in the waiting list (FIFO) and notify them (via the Notification service).

### C. Cancellation & Penalty Policy
- Cancellation > 24 hours before the visit: 100% refund to the user's digital wallet.
- Cancellation between 24h and 3h before the visit: 80% refund (20% penalty fee applied).
- Cancellation < 3 hours before the visit: Not allowed (or 0% refund).

### D. Financial & Wallet System
- Patients pay for appointments using an internal digital `Wallet`.
- When an appointment is settled (or forfeited on no-show), the full visit fee is credited to the doctor's wallet.
- All financial movements must be recorded immutably in a `Transaction` ledger (Deposit, Withdrawal, Refund, Visit_Fee, Revenue_Share, Deposit_Forfeit).

### E. Electronic Health Records (EHR)
- Doctors can create `MedicalRecords` for completed appointments, including Symptoms, Diagnosis, and Private Notes.
- Patients can view their records, but `PrivateNotes` are strictly restricted to Doctors and Admins.

### F. Patient Reviews (Moderation)
- One review per **completed appointment** (unique on `appointment_id`).
- Statuses: `PENDING` → `APPROVED` / `REJECTED`. Admin may later set `APPROVED` → `REJECTED` to hide inappropriate content.
- Public star average and review count are computed **only** from `APPROVED` reviews.
- Patient creates; doctor may reply only when `APPROVED`; admin alone changes status.

## 3. General Requirements
- Performance & Concurrency: The booking process and wallet deductions MUST use database transactions to prevent race conditions (e.g., two patients booking the exact same slot).
- Security: All endpoints must be protected by JWT auth. Strict RBAC must be applied at the handler/middleware level.