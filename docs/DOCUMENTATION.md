# مستندات کامل پروژه Clinick — سامانه نوبت‌دهی و مدیریت کلینیک پیشرفته

> این مستند بر اساس بررسی خط‌به‌خط کد منبع (Backend در Go و Frontend در Next.js) تهیه شده و تمام ویژگی‌ها، دامنه‌های کسب‌وکار، نقش‌های کاربری، APIها و معماری سیستم را پوشش می‌دهد.

---

## فهرست

1. [معرفی کلی پروژه](#1-معرفی-کلی-پروژه)
2. [معماری سیستم](#2-معماری-سیستم)
3. [پشته فناوری (Tech Stack)](#3-پشته-فناوری-tech-stack)
4. [نقش‌های کاربری و کنترل دسترسی (RBAC)](#4-نقش‌های-کاربری-و-کنترل-دسترسی-rbac)
5. [دامنه‌های کسب‌وکار (Backend Domains)](#5-دامنه‌های-کسبوکار-backend-domains)
   - 5.1 [احراز هویت (Auth & OTP)](#51-احراز-هویت-auth--otp)
   - 5.2 [مدیریت کلینیک و پروفایل پزشک](#52-مدیریت-کلینیک-و-پروفایل-پزشک-clinic)
   - 5.3 [زمان‌بندی: شیفت‌ها، مرخصی‌ها و بلوک‌های زمانی](#53-زمانبندی-schedule)
   - 5.4 [نوبت‌دهی هوشمند و صف انتظار (Booking & Waiting List)](#54-نوبتدهی-هوشمند-و-صف-انتظار-booking)
   - 5.5 [مالی و کیف پول (Finance)](#55-مالی-و-کیف-پول-finance)
   - 5.6 [پرونده الکترونیک سلامت (EHR)](#56-پرونده-الکترونیک-سلامت-ehr)
   - 5.7 [مدیریت نسخه (Prescription)](#57-مدیریت-نسخه-prescription)
   - 5.8 [مرجع داروها (Medicine — RxNorm)](#58-مرجع-داروها-medicine--rxnorm)
   - 5.9 [اعلان‌رسانی (Notification)](#59-اعلانرسانی-notification)
   - 5.10 [پیش‌ویزیت AI (Previsit)](#510-پیشویزیت-ai-previsit)
6. [قابلیت‌های هر نقش (Frontend)](#6-قابلیتهای-هر-نقش-frontend)
7. [مرجع کامل API](#7-مرجع-کامل-api)
8. [امنیت و یکپارچگی داده](#8-امنیت-و-یکپارچگی-داده)
9. [زیرساخت، استقرار و پیکربندی](#9-زیرساخت-استقرار-و-پیکربندی)
10. [ساختار پوشه‌ها](#10-ساختار-پوشهها)

---

## 1. معرفی کلی پروژه

**Clinick** یک سامانه‌ی جامع و مدرن نوبت‌دهی و مدیریت کلینیک است. این پروژه تنها یک برنامه‌ی ساده‌ی CRUD نیست؛ بلکه شامل منطق کسب‌وکار پیچیده، مدیریت صف هوشمند، کنترل همزمانی تراکنشی برای جلوگیری از رزرو مضاعف، و پشتیبانی کامل از زبان فارسی و تقویم جلالی است.

پروژه از دو بخش اصلی تشکیل شده است:

- **Backend** (زبان Go): یک REST API مبتنی بر Clean Architecture با فریم‌ورک Echo و پایگاه داده MongoDB.
- **Frontend** (Next.js + TypeScript): یک اپلیکیشن وب تکنقطبی (SPA-like) با پشتیبانی RTL، کاملاً فارسی، و قابل نصب به‌عنوان PWA.

منبع منطق کسب‌وکار در [`BackEnd/REQUIREMENTS.md`](BackEnd/REQUIREMENTS.md:1) و قواعد معماری در [`BackEnd/AGENTS.md`](BackEnd/AGENTS.md:1) و [`FrontEnd/FRONTEND_RULES.md`](FrontEnd/FRONTEND_RULES.md:1) آمده‌اند.

---

## 2. معماری سیستم

### 2.1 معماری Backend — Clean Architecture

Backend بر اساس الگوی **Clean Architecture** پیاده‌سازی شده است. قاعده‌ی وابستگی به‌شدت رعایت می‌شود: دامنه‌های داخل `internal/` می‌توانند از `pkg/` ایمپورت کنند، اما `pkg/` **هرگز** نباید از `internal/` چیزی ایمپورت کند.

برنامه از یک نقطه‌ی ورود آغاز می‌شود و سپس کل گراف وابستگی (Dependency Graph) در لایه‌ی bootstrap مونتاژ می‌گردد:

1. بارگذاری پیکربندی (`pkg/config`)
2. راه‌اندازی لاگر ساختاریافته (`pkg/logger` بر پایه‌ی `slog`)
3. اتصال به MongoDB
4. ساخت Repositoryهای عمومی (`pkg/database` — الگوی Repository[T] ژنریک)
5. ایجاد Indexها و Seed اکانت ادمین پیش‌فرض
6. ساخت Serviceهای هر دامنه
7. ساخت Handlerهای HTTP
8. مونتاژ موتور Echo + ثبت مسیرها

نقطه‌ی مونتاژ کل برنامه در [`BackEnd/cmd/clinic-api/bootstrap/app.go`](BackEnd/cmd/clinic-api/bootstrap/app.go:50) (تابع `NewApp()`) قرار دارد.

هر دامنه (`internal/<domain>`) از سه فایل تشکیل شده است:

| فایل | نقش |
|------|-----|
| `<domain>.go` | موجودیت‌ها (Entities) و DTOها (با تگ‌های `bson`/`json`/`validate`) |
| `service.go` | منطق کسب‌وکار (فقط نوع‌های دامنه و خطا برمی‌گرداند) |
| `handler.go` | هندلرهای Echo؛ مسیرها را از طریق `RegisterRoutes` ثبت می‌کند |

> الگوی کلیدی: برای حفظ جهت وابستگی، ارتباط بین دامنه‌ها از طریق **اینترفیس‌های کوچک** و **Adapter**هایی در لایه‌ی bootstrap انجام می‌شود (مثلاً دامنه‌ی booking برای بررسی مرخصی پزشک به `ScheduleService` اینترفیس وابسته است، نه به بسته‌ی schedule).

### 2.2 معماری Frontend — Next.js App Router

Frontend از **App Router** با گروه‌بندی مسیرها بر اساس نقش استفاده می‌کند. هر نقش یک layout جداگانه با گارد احراز هویت مخصوص خود دارد:

- `(patient)` — بیمار
- `admin` — مدیر
- `doctor` — پزشک
- `reception` — منشی

وضعیت احراز هویت در کلاینت با **Zustand** (با `persist` در `localStorage`) مدیریت می‌شود و توکن JWT از طریق یک **interceptor در Axios** به تمام درخواست‌ها افزوده می‌گردد. وضعیت سرور (fetching/caching) با **TanStack React Query** و فرم‌ها با **react-hook-form + zod** مدیریت می‌شوند.

---

## 3. پشته فناوری (Tech Stack)

### Backend

| فناوری | کاربرد |
|--------|--------|
| **Go 1.26** | زبان اصلی |
| **Echo v4** | فریم‌ورک HTTP |
| **MongoDB Driver (official)** | دسترسی به پایگاه داده |
| **go-playground/validator** | اعتبارسنجی ورودی‌ها |
| **golang-jwt/jwt v5** | تولید/اعتبارسنجی JWT |
| **golang-jwt / golang.org/x/crypto (bcrypt)** | هش گذرواژه |
| **lithammer/fuzzysearch** | جست‌وجوی فازی داروها (Damerau-Levenshtein) |
| **godotenv** | بارگذاری فایل `.env` |

### Frontend

| فناوری | کاربرد |
|--------|--------|
| **Next.js 16 (App Router)** + **React 19** | فریم‌ورک اصلی |
| **TypeScript** | تایپ‌ایمنی |
| **Tailwind CSS v4** + **shadcn/ui** | استایل و کامپوننت‌ها |
| **TanStack React Query** | مدیریت وضعیت سرور |
| **Zustand** | وضعیت کلاینت (احراز هویت) |
| **Axios** | کلاینت HTTP |
| **react-hook-form + zod** | فرم‌ها و اعتبارسنجی |
| **jalaali-js** | تقویم جلالی |
| **recharts** | نمودارهای داشبورد |
| **jspdf + html2canvas-pro** | خروجی PDF نسخه |
| **serwist (@serwist/next)** | Service Worker / PWA |
| **sonner** | نوتیفیکیشن‌های Toast |
| **lucide-react** | آیکون‌ها |
| **Vazirmatn** | فونت فارسی |

---

## 4. نقش‌های کاربری و کنترل دسترسی (RBAC)

چهار نقش کاربری در سیستم تعریف شده‌اند (ثابت‌ها در [`BackEnd/internal/user/user.go`](BackEnd/internal/user/user.go:23)):

| نقش | شرح |
|-----|-----|
| **PATIENT** | جست‌وجوی پزشک، رزرو/لغو نوبت، مشاهده پرونده و نسخه، مدیریت کیف پول |
| **DOCTOR** | مشاهده‌ی صف روزانه، نوشتن پرونده (EHR) و نسخه، مدیریت شیفت/مرخصی، ایجاد منشی، مشاهده‌ی درآمد |
| **RECEPTIONIST** | مدیریت صف زنده، پذیرش بیمار حضوری/تلفنی، Check-in/Check-out، مدیریت لیست انتظار |
| **ADMIN** | دسترسی کامل: مدیریت پزشکان و شعب، گزارش‌های مالی، تنظیمات سیستم |

### مکانیزم‌های کنترل دسترسی

- **JWT Auth Middleware** (`pkg/middleware`): تمام اندپوینت‌های حساس با میان‌افزار `JWTAuth` محافظت می‌شوند.
- **Role Auth Middleware**: میان‌افزار `RoleAuth` دسترسی را به نقش(های) مجاز محدود می‌کند (مثلاً فقط `ADMIN`).
- **کنترل مالکیت در Handler**: بسیاری از مسیرها («me») هویت فراخوان را از توکن استخراج می‌کنند تا کاربر فقط به داده‌ی خودش دسترسی داشته باشد.
- **Scoped Receptionist**: هر منشی با فیلد `EmployerID` به یک پزشک مشخص متصل است و فقط می‌تواند صف همان پزشک را ببیند/مدیریت کند (مثال: [`BackEnd/cmd/clinic-api/bootstrap/public.go`](BackEnd/cmd/clinic-api/bootstrap/public.go:466)).
- **جلوگیری از ارتقای امتیاز**: ثبت‌نام عمومی همیشه نقش `PATIENT` می‌سازد؛ اکانت‌های `DOCTOR`/`ADMIN` فقط توسط ادمین و `RECEPTIONIST` فقط توسط پزشک ایجاد می‌شوند.

---

## 5. دامنه‌های کسب‌وکار (Backend Domains)

### 5.1 احراز هویت (Auth & OTP)

دو مکانیزم احراز هویت موازی وجود دارد:

#### الف) احراز هویت با گذرواژه (برای کارکنان)

ثبت‌نام (`/auth/register`)، ورود (`/auth/login`) و دریافت پروفایل (`/auth/profile`). گذرواژه با **bcrypt** هش و ذخیره می‌شود و هرگز در پاسخ‌ها بازگشت داده نمی‌شود (`json:"-"`).

#### ب) احراز هویت با کد یک‌بارمصرف OTP (برای بیماران)

بیماران **منحصراً** با OTP (بدون گذرواژه) وارد می‌شوند (موجودیت‌ها در [`BackEnd/internal/otp/otp.go`](BackEnd/internal/otp/otp.go:1)). سه مرحله دارد:

1. `POST /auth/otp/send` — ارسال کد به شماره موبایل
2. `POST /auth/otp/login` — ورود اکانت موجود با کد
3. `POST /auth/otp/register` — ساخت اکانت جدید `PATIENT` با کد

ویژگی‌های امنیتی OTP:

- **Rate Limiting**: حداقل فاصله‌ی زمانی بین دو درخواست کد (`OTP_RESEND_SECONDS`).
- **تعداد تلاش محدود**: حداکثر تلاش اشتباه قبل از ابطال کد (`OTP_MAX_ATTEMPTS`).
- **قفل موقت**: پس از اتمام سهمیه‌ی resend، شماره برای مدتی قفل می‌شود (`OTPLockSeconds`) — خطای `LockError` با زمان باقی‌مانده.
- **TTL**: کدها در حافظه با تاریخ انقضا نگهداری می‌شوند.
- **ارسال کد** هرگز فلو را لو نمی‌دهد که آیا شماره ثبت شده یا خیر.

#### ج) انتخاب پروایدر پیامک

پروایدر SMS از پیکربندی انتخاب می‌شود (تابع `newSmsSender` در [`BackEnd/cmd/clinic-api/bootstrap/app.go`](BackEnd/cmd/clinic-api/bootstrap/app.go:310)):

- `mock` (پیش‌فرض): کد فقط در لاگ سرور چاپ می‌شود (مناسب توسعه‌ی محلی).
- `iranpayamak`: ارسال واقعی از طریق دروازه‌ی **Iran Payamak** (به‌محض تنظیم `SMS_API_KEY` به‌صورت خودکار فعال می‌شود). کلاینت HTTP در [`BackEnd/internal/notification/iranpayamak.go`](BackEnd/internal/notification/iranpayamak.go:1).

#### د) Seed ادمین پیش‌فرض

در زمان راه‌اندازی، یک اکانت `ADMIN` پیش‌فرض به‌صورت idempotent ساخته می‌شود (شماره و گذرواژه از متغیرهای محیطی `ADMIN_PHONE`/`ADMIN_PASSWORD`).

---

### 5.2 مدیریت کلینیک و پروفایل پزشک (Clinic)

دامنه‌ی clinic مالک موجودیت‌های `Branch` (شعبه) و `DoctorProfile` است ([`BackEnd/internal/clinic/clinic.go`](BackEnd/internal/clinic/clinic.go:54)).

#### پروفایل پزشک (`DoctorProfile`)

به یک اکانت کاربری با نقش `DOCTOR` از طریق `UserID` متصل است و شامل این فیلدهاست:

- `Specialty` — تخصص پزشکی
- `MedicalSystemNumber` — شماره نظام پزشکی
- `VisitDurationMinutes` — مدت پیش‌فرض هر ویزیت (برای تولید اسلات)
- `VisitFee` — هزینه‌ی هر ویزیت (ارز نمایشی، مثلاً تومان)

> نکته‌ی معماری: فیلدهای هویت پزشک (نام/تلفن/کدملی) از بسته‌ی user خوانده و به پروفایل «denormalize» می‌شوند تا کلاینت بدون درخواست اضافی آن‌ها را ببیند. این کار از طریق اینترفیس `UserReader` و یک adapter در bootstrap انجام می‌شود تا بسته‌ی clinic به `internal/user` وابسته نشود.

#### قابلیت‌های خودخدمت پزشک

پزشک می‌تواند **تنها** تنظیمات قیمت‌گذاری پروفایل خودش (مدت ویزیت و ویزیت‌فی) را ویرایش کند (`PUT /doctor/profile`، DTO در [`BackEnd/internal/clinic/clinic.go`](BackEnd/internal/clinic/clinic.go:195))؛ فیلدهای هویت و تخصص توسط ادمین کنترل می‌شوند.

#### مدیریت شعب

CRUD کامل شعبه‌ها (نام، آدرس، اطلاعات تماس) توسط ادمین.

---

### 5.3 زمان‌بندی (Schedule)

دامنه‌ی schedule در [`BackEnd/internal/schedule/schedule.go`](BackEnd/internal/schedule/schedule.go:1) سه موجودیت دارد که در دسترس‌بودن پزشک را کنترل می‌کنند:

#### شیفت (`Shift`)

یک بازه‌ی کاری در یک روز تقویمی مشخص با ظرفیت `MaxPatients`. قابلیت فعال/غیرفعال (`IsActive`) دارد تا بدون حذف، غیرقابل رزرو شود.

- **شیفت تکرارشونده** (`POST /shifts/recurring`): ساخت یک‌باره‌ی شیفت‌ها برای چند روز هفته در یک بازه‌ی تاریخ ([`BackEnd/internal/schedule/schedule.go`](BackEnd/internal/schedule/schedule.go:132)).

#### مرخصی (`Leave`)

یک روز تقویمی کامل که پزشک در آن کار نمی‌کند. هر شیفت یا رزرو در روز مرخصی توسط سرویس booking **رد** می‌شود.

#### بلوک زمانی (`TimeBlock`)

بسته‌ی جزئی از یک روز (مثلاً استراحت ناهار) که بر خلاف مرخصی کامل‌روز نیست و یک پنجره‌ی خاص را غیرقابل دسترس می‌کند (با زمان شروع/پایان به فرمت `HH:MM`).

---

### 5.4 نوبت‌دهی هوشمند و صف انتظار (Booking)

قلب سیستم، دامنه‌ی booking است ([`BackEnd/internal/booking/booking.go`](BackEnd/internal/booking/booking.go:1) و منطق در [`BackEnd/internal/booking/service.go`](BackEnd/internal/booking/service.go:1)).

#### چرخه‌ی حیات نوبت (`Status`)

| وضعیت | معنی |
|-------|------|
| `PENDING` | درخواست شده، تأیید نشده |
| `CONFIRMED` | قطعی شده، اسلات گرفته شده |
| `CHECKED_IN` | بیمار در پذیرش حاضر شده |
| `IN_PROGRESS` | ویزیت آغاز شده (تایمر زنده) |
| `COMPLETED` | ویزیت انجام و بسته شد |
| `NO_SHOW` | بیمار حضور نیافت |
| `CANCELLED` | لغو شد، اسلات آزاد شد |

#### الف) رزرو هوشمند و کنترل همزمانی

پیش از ثبت نوبت، سه شرط بررسی می‌شود (تابع `checkEligibilityTx` در [`BackEnd/internal/booking/service.go`](BackEnd/internal/booking/service.go:309)):

1. **مرخصی**: پزشک نباید در آن روز مرخصی باشد.
2. **احتوای شیفت**: بازه‌ی درخواستی باید **کاملاً** درون یک شیفت فعال جای گیرد.
3. **هم‌پوشانی (Overlap)**: نباید با نوبت تأییدشده‌ی دیگری هم‌پوشانی داشته باشد (اسلات‌های لغوشده آزادند).

**استراتژی کنترل همزمانی (سه لایه‌ای)** — برای جلوگیری از Double-booking:

1. **تراکنش چندسندی MongoDB** (`client.StartSession` / `WithTransaction`): تمام read-check-write در یک تراکنش انجام می‌شود و در صورت write conflict به‌صورت خودکار retry می‌شود.
2. **شرط overlap در خود filter**: نیم‌بازه‌ی half-open `[start, end)` مستقیماً در کوئری اعمال می‌شود.
3. **Index یکتای تدافعی**: یک unique index روی `{doctor_id, start_time}` (partial، فقط برای نوبت‌های غیرلغو) به‌عنوان ضمانت نهایی لایه‌ی ذخیره‌سازی.

همچنین اسلات‌های گذشته (شروع‌شده) قابل رزرو نیستند (`ErrSlotInThePast`). اگر deployment از تراکنش پشتیبانی نکند (mongod مستقل)، سرویس به‌صورت غیرتراکنشی اجرا می‌شود تا در توسعه‌ی محلی همچنان کار کند.

#### ب) سیاست لغو و جریمه

بر اساس REQUIREMENTS بخش 2.C (ثابت‌ها در [`BackEnd/internal/booking/service.go`](BackEnd/internal/booking/service.go:113)):

| زمان لغو قبل از ویزیت | درصد بازگشت وجه |
|------------------------|------------------|
| بیش از **۲۴ ساعت** | ۱۰۰٪ بازگشت |
| بین **۲۴ تا ۳ ساعت** | ۸۰٪ بازگشت (۲۰٪ جریمه) |
| کمتر از **۳ ساعت** | لغو مجاز نیست |

پس از هر لغو، **موتور صف انتظار** به‌صورت best-effort فراخوانی می‌شود تا اولین بیمار منتظر به اسلات آزادشده ارتقا یابد.

#### ج) موتور لیست انتظار هوشمند (Smart Queue)

اگر شیفت پزشک پر باشد، بیمار می‌تواند وارد `WaitingList` شود (موجودیت در [`BackEnd/internal/booking/booking.go`](BackEnd/internal/booking/booking.go:158)):

- **اولویت‌بندی**: `NORMAL` و `URGENT` (اولویت فوری همیشه زودتر ارائه می‌شود).
- **نوع ثبت**: `ONLINE`، `WALKIN` (حضوری)، `PHONE` (تلفنی) — برای ثبت سریع بیماران بدون اکانت.
- **ترتیب FIFO** بر اساس زمان ثبت، با تقدم اولویت URGENT.
- **ارتقای خودکار**: پس از لغو/عدم‌حضور یک نوبت، اولین نفر لیست انتظار به‌صورت تراکنشی به نوبت `CONFIRMED` تبدیل و مطلع می‌شود.
- **تبدیل دستی / ارائه‌ی اسلات**: پذیرش می‌تواند با `convert` یا `offer` (اسلات دلخواه) یک ورودی را به نوبت واقعی تبدیل کند.
- **تغییر اولویت**: با `PATCH /waiting-list/:id/priority`.

#### د) کنترل صف پذیرش (Reception Queue Control)

ترانزیشن‌های حالت نوبت با **به‌روزرسانی شرطی** انجام می‌شوند تا با ترانزیشن‌های همزمان تداخل نکنند:

- `CheckIn` → `CHECKED_IN`
- `StartVisit` → `IN_PROGRESS` (ثبت `VisitStartedAt` برای تایمر زنده)
- `CompleteVisit` → `COMPLETED` (پاک کردن تایمر)
- `MarkNoShow` → `NO_SHOW` (سپس موتور لیست انتظار)

#### هـ) تقویم و تایم‌لاین

- **خلاصه‌ی ماهانه** (`GetMonthlyAppointments` / `GetAppointmentsSummaryByRange`): تفکیک تعداد نوبت‌ها بر اساس وضعیت برای هر روز — با پشتیبانی از **بازه‌ی تاریخ دلخواه** که برای تقویم جلالی پذیرش (که یک ماه جلالی روی دو ماه میلادی می‌نشیند) ضروری است.
- **تایم‌لاین روزانه** (`GetDailyTimeline`): ترکیب شیفت‌ها و نوبت‌های یک روز با denormalize کردن نام/تلفن بیمار.

#### و) تولید اسلات عمومی (بدون احراز هویت)

بیماران قبل از ورود می‌توانند پزشکان را مرور کنند و اسلات‌های قابل‌رزرو ببینند:

- `GET /doctors` و `GET /doctors/:id` — دایرکتوری پزشکان
- `GET /doctors/:id/shifts` — شیفت‌ها
- `GET /doctors/:id/slots` — تجزیه‌ی شیفت به اسلات‌های به‌اندازه‌ی مدت‌ویزیت، با علامت‌گذاری اسلات‌های گرفته‌شده (لایه‌ی bootstrap در [`BackEnd/cmd/clinic-api/bootstrap/public.go`](BackEnd/cmd/clinic-api/bootstrap/public.go:160))

> نکته‌ی معماری مهم: دایرکتوری از **profile id** پزشک استفاده می‌کند، اما شیفت‌ها/نوبت‌ها زیر **user id** ذخیره می‌شوند. اینترفیس `DoctorUserIDResolver` این نگاشت را انجام می‌دهد.

---

### 5.5 مالی و کیف پول (Finance)

دامنه‌ی finance ([`BackEnd/internal/finance/finance.go`](BackEnd/internal/finance/finance.go:1) و منطق در [`BackEnd/internal/finance/service.go`](BackEnd/internal/finance/service.go:1)) چهار موجودیت دارد: `Wallet`، `Transaction`، `Invoice`، `PaymentAttempt`.

#### الف) کیف پول دیجیتال

هر کاربر (بیمار/پزشک) یک کیف پول با موجودی دارد. تمام حرکات مالی به‌صورت **immutable** در دفتر `Transaction` ثبت می‌شوند (Deposit, Withdrawal, Refund, Visit_Fee, Deposit_Forfeit, Revenue_Share).

#### ب) درگاه پرداخت شبیه‌سازی‌شده (Mock Gateway)

یک فلوی پرداخت کامل برای شارژ کیف پول:

1. `POST /finance/mock-pay` — آغاز پرداخت با مبلغ → ساخت `PaymentAttempt` با `TrackingCode` امن.
2. `GET /finance/mock-verify?...` — تأیید با کد رهگیری → واریز به کیف پول.

این فلوی شبیه‌سازی برای توسعه/دمو کامل است و در فرانت‌اند با کامپوننت `PaymentSimulatorDialog` نمایش داده می‌شود.

#### ج) فلوی مالی کامل نوبت

- `POST /finance/pay` — پرداخت **کامل** ویزیت‌فی پیش از ویزیت (ساخت فاکتور `PARTIAL`، تأیید نوبت). واریز به پزشک در این مرحله انجام **نمی‌شود**.
- `POST /finance/settle` — تسویه پس از ویزیت: واریز **۱۰۰٪** ویزیت‌فی به کیف پول پزشک، علامت‌گذاری فاکتور `SETTLED`.
- `POST /finance/cancel` — پردازش لغو: در لغو به‌موقع، بازگشت وجه به بیمار؛ در لغوی دیرهنگام/عدم‌حضور، forfeit بیعانه و واریز آن به پزشک (فاکتور `FORFEITED`).

> کل این فلوی مالی داخل **تراکنش MongoDB** اجرا می‌شود تا موجودی کیف پول و دفتر تراکنش همواره سازگار بمانند (به همین دلیل docker-compose یک **Replica Set** تک‌گره‌ای می‌سازد).

#### د) داشبورد مالی ادمین

`GET /finance/dashboard` یک نمای کلی از KPIها برمی‌گرداند (تعریف در [`BackEnd/internal/finance/finance.go`](BackEnd/internal/finance/finance.go:439)):

- مجموع درآمد، تعداد نوبت‌ها، میانگین نرخ عدم‌حضور (No-Show)
- سری زمانی درآمد ماهانه
- سری زمانی درآمد واریزشده به پزشکان
- روند نرخ عدم‌حضور

#### هـ) گزارش درآمد پزشک

پزشک می‌تواند با انتخاب بازهٔ تاریخی (`from`/`to`) درآمد تسویه‌شده، تعداد ویزیت‌های تسویه‌شده، و مبلغ در انتظار تسویه را ببیند (`DoctorEarningsSummaryResponse`).

---

### 5.6 پرونده الکترونیک سلامت (EHR)

دامنه‌ی ehr ([`BackEnd/internal/ehr/ehr.go`](BackEnd/internal/ehr/ehr.go:1)) شامل سه بخش است:

#### الف) پرونده پزشکی (`MedicalRecord`)

مستندسازی یک ویزیت، متصل به یک نوبت (و در نتیجه یک سه‌تایی بیمار/پزشک/ویزیت). دو قالب پشتیبانی می‌شود:

- **GENERAL** (قدیمی): فیلدهای تخت `Symptoms`، `Diagnosis`، `Prescription`.
- **SOAP** (ساختاریافته): `Subjective`، `Objective`، `Assessment`، `Plan`.

قانون حریم خصوصی کلیدی: فیلد `PrivateNotes` (یادداشت محرمانه‌ی پزشک) **هرگز** به بیمار نشان داده نمی‌شود. این جداسازی در سطح موجودیت با دو DTO مجزا (`ToResponse` برای بیمار و `ToFullResponse` برای پزشک/ادمین) اعمال می‌شود و قابل دور زدن نیست.

#### ب) ادغام SOAP → تکمیل ویزیت

اگر در زمان ایجاد پرونده `complete_visit=true` باشد، نوبت پیوندی به‌صورت خودکار به `COMPLETED` تبدیل می‌شود (با استفاده از اینترفیس `BookingCompleter` که به‌صورت ساختاری توسط booking.Service ارضا می‌شود).

#### ج) یادداشت تریاژ (`TriageNote`)

یک snapshot سبک (پیش از ویزیت) شامل علائم، علائم حیاتی ساختاریافته (`Vitals`: فشار خون، ضربان قلب، دما، تنفس، اکسیژن، وزن، قد) و یادداشت آزاد.

#### د) دایرکتوری «بیماران من» پزشک

`GET /ehr/doctor/patients` یک ردیف تجمیعی به‌ازای هر بیمار برمی‌گرداند (`DoctorPatientSummary`): تعداد کل ویزیت‌ها، ویزیت‌های تکمیل‌شده، آخرین ویزیت و آخرین تشخیص.

---

### 5.6b نظرات بیماران (Review Moderation)

دامنه‌ی review ([`BackEnd/internal/review`](BackEnd/internal/review)): یک نظر به‌ازای هر نوبت تکمیل‌شده (`appointment_id` یکتا). وضعیت‌ها: `PENDING` | `APPROVED` | `REJECTED`. میانگین و تعداد عمومی فقط از نظرات `APPROVED`؛ پاسخ پزشک فقط روی `APPROVED`؛ تغییر وضعیت فقط توسط ادمین.

---

### 5.7 مدیریت نسخه (Prescription)

دامنه‌ی prescription ([`BackEnd/internal/prescription/prescription.go`](BackEnd/internal/prescription/prescription.go:1)) دستور دارویی صادرشده توسط پزشک را مدیریت می‌کند.

- هر نسخه شامل لیستی از `PrescriptionItem` است: نام دارو، `RxCUI`، دوز، فرکانس، مدت، دستورالعمل (sig) و تعداد.
- متصل به بیمار و پزشک، و اختیاری به نوبت یا پرونده (EHR cross-link).
- **حریم خصوصی**: فیلد `Notes` (بافتار بالینی) فقط برای پزشک/ادمین؛ برای بیمار حذف می‌شود.
- چرخه‌ی حیات: `ACTIVE` → `COMPLETED` یا `CANCELLED`.
- **اعلان بیمار**: با `notify_patient=true` یک نوتیفیکیشن best-effورس به بیمار ارسال می‌شود.
- Denormalize نام بیمار/پزشک برای خروجی PDF.

---

### 5.8 مرجع داروها (Medicine — RxNorm) ⭐

یکی از پیشرفته‌ترین دامنه‌ها، مرجع دارو در [`BackEnd/internal/medicine`](BackEnd/internal/medicine:1) است. این دامنه داده‌ی مرجع است و دو مجموعه دارد: ایندکس محلی داروها و علاقه‌مندی‌های هر پزشک.

#### الف) مدل بالینی

مفهوم دارو از توضیح خام RxNorm جدا شده است (`BackEnd/internal/medicine/model/model.go`): نام عمومی تمیز (مثل Ibuprofen)، لیست مواد تشکیل‌دهنده (تاکید روی داروهای ترکیبی)، دسته‌بندی (`generic`/`brand`/`combination`) و وزن اولویت.

#### ب) موتور جست‌وجوی هوشمند چندلایه

جست‌وجو با **رتبه‌بندی بالینی** انجام می‌شود — تطبیق‌ها بر اساس امتیاز اولویت‌بندی می‌شوند:

| نوع تطبیق | امتیاز |
|-----------|--------|
| تطبیق دقیق نام عمومی (`exact_generic`) | ۱۰۰ |
| پیشوند نام عمومی | ۹۵ |
| تطبیق دقیق برند | ۹۰ |
| پیشوند برند | ۸۰ |
| تطبیق فازی (تحمل غلط املایی، Damerau-Levenshtein ≤2) | ۷۵ |
| مترادف (شامل نام‌های فارسی/تلفظ‌شده) | ۷۰ |
| داروی ترکیبی (عمداً تنزل رتبه داده می‌شود) | ۳۰ |

#### ج) نرمالایزر و حذف لهجه/ترجمه

- **Normalizer** (`normalizer/`): نرمال‌سازی متون دارویی (علائم، بزرگ/کوچک).
- **Transliteration** (`normalizer/transliteration.go`): پشتیبانی از نام‌های فارسی و تلفظ‌شده برای جست‌وجوی دوزبانه.
- **Dosage form / clinical**: استخراج شکل دارویی.

#### د) یکپارچگی با RxNorm (NLM)

- **Fallback زنده**: اگر ایندیس محلی نتیجه نداد، به‌صورت اختیاری از API زنده‌ی RxNorm استفاده می‌شود (`MEDICINE_FALLBACK_TO_RXNORM`).
- **Seed خودکار**: در صورت فعال‌بودن `MEDICINE_SEED_ON_BOOT`، ایندیس محلی از RxNorm به‌صورت ناهمگام (best-effort) در زمان راه‌اندازی پر می‌شود. همچنین ابزار مستقل `cmd/medicine-seed` برای seed دستی وجود دارد.

#### هـ) کش LRU و حالت آفلاین

- **کش حافظه‌ی LRU** با TTL قابل‌پیکربندی (`MEDICINE_CACHE_TTL_SECONDS` و `MEDICINE_CACHE_MAX_ENTRIES`) برای جست‌وجوی سریع.
- با غیرفعال‌کردن fallback، سیستم کاملاً **آفلاین** روی ایندیس محلی کار می‌کند.

#### و) علاقه‌مندی‌های پزشک

هر پزشک می‌تواند داروهای پراستفاده را به علاقه‌مندی‌ها اضافه کند (`POST /medicines/favorites`) برای نگارش سریع‌تر نسخه.

---

### 5.9 اعلان‌رسانی (Notification)

دامنه‌ی notification ([`BackEnd/internal/notification/service.go`](BackEnd/internal/notification/service.go:1)) یک لایه‌ی انتزاعی (`Notifier`) ارائه می‌دهد که کانال ارسال را از فراخوان جدا می‌کند. پیام‌های دامنه‌ای:

- تأیید نوبت، لغو نوبت، یادآوری نوبت
- نوبت لیست انتظار (ارتقا)
- موفقیت پرداخت
- صدور نسخه (به فارسی)

> تمام نوتیفیکیشن‌ها **best-effort** هستند و هرگز نباید باعث شکست یک عملیات کسب‌وکار (مثل رزرو) شوند. یک `nil` notifier به‌صورت no-op تحمل می‌شود.

---

### 5.10 پیش‌ویزیت AI (Previsit)

دامنهٔ [`BackEnd/internal/previsit`](BackEnd/internal/previsit) سشن گفت‌وگوی پیش‌ویزیت را به هر نوبت وصل می‌کند. مغز LLM در فولدر جداگانهٔ [`AI/`](AI/) (FastAPI + LangChain + AvalAI) است؛ کلید `AVALAI_API_KEY` فقط آنجا نگه داشته می‌شود و Go با `AI_SERVICE_URL` صدا می‌زند.

- بعد از رزرو: سشن `PENDING` ساخته می‌شود؛ بعد از تأیید نوبت دعوت نرم (SMS) فرستاده می‌شود.
- بیمار مصاحبه ترکیبی (سؤالات ثابت → چت آزاد) را انجام می‌دهد؛ گزارش ساختاریافته + transcript برای پزشک ذخیره می‌شود.
- پزشک در صفحه EHR گزارش را می‌بیند و می‌تواند Subjective SOAP را به‌صورت پیش‌نویس پر کند — بدون ذخیره خودکار در `MedicalRecord`.
- `TriageNote` دست‌نخورده می‌ماند. تشخیص/نسخه توسط AI داده نمی‌شود.

Spec: [`docs/superpowers/specs/2026-11-15-previsit-ai-chat-design.md`](docs/superpowers/specs/2026-11-15-previsit-ai-chat-design.md)

---

## 6. قابلیت‌های هر نقش (Frontend)

ساختار مسیرها بر اساس نقش و با گارد احراز هویت در هر layout است.

### 6.1 بیمار (PATIENT) — [`(patient)`]

ناوبری نوار بالایی در [`FrontEnd/src/app/(patient)/layout.tsx`](FrontEnd/src/app/(patient)/layout.tsx:17):

| صفحه | قابلیت |
|------|--------|
| ریشه (`/`) | هدایت به صفحهٔ ورود یا داشبورد نقش کاربر |
| پزشکان (`/doctors` و `/doctors/[id]`) | جست‌وجو، مشاهده‌ی پروفایل و انتخاب اسلات در `BookingDialog` |
| نوبت‌های من (`/appointments`) | نوبت‌های فعال/گذشته، لغو، تغییر زمان (`RescheduleDialog`)، ثبت نظر پس از ویزیت تکمیل‌شده، لینک پیش‌ویزیت AI |
| پیش‌ویزیت (`/appointments/previsit/[id]`) | چت دستیار پیش‌ویزیت برای همان نوبت |
| نسخه‌ها (`/prescriptions`) | مشاهده و خروجی PDF |
| سوابق پزشکی (`/records`) | مشاهده پرونده (بدون یادداشت محرمانه) |
| کیف پول (`/wallet`) | موجودی، تاریخچه‌ی تراکنش‌ها، شارژ |
| پروفایل | اطلاعات حساب کاربری |

### 6.2 پزشک (DOCTOR) — [`/doctor`]

ناوبری نوار کناری در [`FrontEnd/src/app/doctor/layout.tsx`](FrontEnd/src/app/doctor/layout.tsx:24):

| صفحه | قابلیت |
|------|--------|
| داشبورد (`/doctor/dashboard`) | نمای کلی روز: KPI صف، نوبت‌های پیش‌رو، درآمد/کیف پول، شیفت و مرخصی، دسترسی سریع |
| صف بیماران (`/doctor/queue`) | صف زنده‌ی روزانه با شمارشگر و تایمر ویزیت |
| بیماران من (`/doctor/patients/[id]/ehr`) | دایرکتوری بیماران + نوشتن SOAP، تریاژ، سابقه‌ی پزشکی |
| نسخه‌ها (`/doctor/prescriptions`) | نگارشگر نسخه با جست‌وجوی دارو، علاقه‌مندی‌ها، تاریخچه |
| نظرات (`/doctor/reviews`) | مشاهده‌ی نظرات (همه وضعیت‌ها) و پاسخ عمومی فقط پس از تأیید |
| شیفت‌ها (`/doctor/shifts`) | مدیریت شیفت و بلوک‌های زمانی |
| مرخصی‌ها (`/doctor/leaves`) | ثبت/مدیریت مرخصی |
| منشی‌ها (`/doctor/receptionists`) | ایجاد منشی زیرمجموعه |
| درآمد (`/doctor/earnings`) | گزارش مالی ماهانه |
| تنظیمات ویزیت (`/doctor/settings`) | ویرایش ویزیت‌فی و مدت ویزیت |

### 6.3 منشی (RECEPTIONIST) — [`/reception`]

ناوبری در [`FrontEnd/src/app/reception/layout.tsx`](FrontEnd/src/app/reception/layout.tsx:22) (دسترسی به پزشک هم داده می‌شود چون صف doctor-scoped است):

| صفحه | قابلیت |
|------|--------|
| صف زنده (`/reception/queue`) | مدیریت صف، ثبت سریع حضوری (`QuickRegisterForm`)، check-in، شروع/تکمیل ویزیت، تایمر زنده |
| خط زمانی (`/reception/timeline`) | نمای زمانی شیفت‌ها و نوبت‌های روز |
| تقویم ماهانه (`/reception/calendar`) | تقویم جلالی با تفکیک روزانه |
| لیست انتظار (`/reception/waiting-list`) | مدیریت، تغییر اولویت، ارائه‌ی اسلات (`OfferSlotDialog`) |

### 6.4 ادمین (ADMIN) — [`/admin`]

ناوبری در [`FrontEnd/src/app/admin/layout.tsx`](FrontEnd/src/app/admin/layout.tsx:21):

| صفحه | قابلیت |
|------|--------|
| داشبورد (`/admin/dashboard`) | KPIها و نمودارها (recharts) |
| پزشکان (`/admin/doctors`) | CRUD پروفایل پزشک (`DoctorFormDialog`) و مدیریت شیفت (`ShiftsDialog`) |
| مرخصی‌ها (`/admin/leaves`) | مدیریت مرخصی‌ها |
| نظرات (`/admin/reviews`) | تأیید / رد / پنهان‌سازی نظرات بیماران |
| گزارش‌های مالی (`/admin/financial-reports`) | گزارش‌های مالی کلینیک |

---

## 7. مرجع کامل API

تمام مسیرها زیر پیشوند `/api/v1` هستند. میان‌افزار JWT روی گروه‌های محافظت‌شده اعمال می‌شود. ثبت مسیرها در [`BackEnd/cmd/clinic-api/bootstrap/routes.go`](BackEnd/cmd/clinic-api/bootstrap/routes.go:31).

### احراز هویت
| متد | مسیر | دسترسی | شرح |
|-----|------|--------|-----|
| POST | `/auth/register` | عمومی | ثبت‌نام بیمار |
| POST | `/auth/login` | عمومی | ورود با گذرواژه |
| GET | `/auth/profile` | JWT | پروفایل من |
| POST | `/auth/otp/send` | عمومی | ارسال کد OTP |
| POST | `/auth/otp/login` | عمومی | ورود با OTP |
| POST | `/auth/otp/register` | عمومی | ثبت‌نام با OTP |

### کارکنان
| متد | مسیر | دسترسی | شرح |
|-----|------|--------|-----|
| POST | `/admin/users` | ADMIN | ایجاد پزشک/ادمین |
| POST | `/doctor/receptionists` | DOCTOR | ایجاد منشی زیرمجموعه |

### کلینیک
| متد | مسیر | دسترسی | شرح |
|-----|------|--------|-----|
| CRUD | `/clinics/branches` | ADMIN | مدیریت شعب |
| CRUD | `/clinics/doctors` | ADMIN | مدیریت پروفایل پزشکان |
| GET/PUT | `/doctor/profile` | DOCTOR | پروفایل خودخدمت پزشک |

### زمان‌بندی
| متد | مسیر | دسترسی | شرح |
|-----|------|--------|-----|
| POST/GET/PUT/DELETE | `/schedule/shifts` | ADMIN, DOCTOR | مدیریت شیفت |
| POST | `/schedule/shifts/recurring` | ADMIN, DOCTOR | شیفت تکرارشونده |
| POST/GET/DELETE | `/schedule/leaves` | ADMIN, DOCTOR | مرخصی |
| POST/GET/DELETE | `/schedule/time-blocks` | ADMIN, DOCTOR | بلوک زمانی |

### نوبت‌دهی
| متد | مسیر | دسترسی | شرح |
|-----|------|--------|-----|
| POST | `/bookings/book` | JWT | رزرو نوبت |
| POST | `/bookings/cancel` | JWT | لغو (با سیاست جریمه) |
| POST | `/bookings/reschedule` | JWT | تغییر زمان |
| POST | `/bookings/check-in` | JWT | پذیرش بیمار |
| POST | `/bookings/start-visit` | JWT | شروع ویزیت |
| POST | `/bookings/complete-visit` | JWT | تکمیل ویزیت |
| POST | `/bookings/no-show` | JWT | علامت عدم‌حضور |
| GET | `/bookings/monthly/:doctorID/:year/:month` | JWT | خلاصه‌ی ماهانه |
| GET | `/bookings/timeline/:doctorID/:date` | JWT | تایم‌لاین روزانه |
| POST | `/bookings/waiting-list` | JWT | ورود به لیست انتظار |
| GET | `/bookings/waiting-list/:doctorID/:date` | JWT | مشاهده‌ی لیست |
| POST | `/bookings/waiting-list/:id/convert` | JWT | تبدیل به نوبت |
| POST | `/bookings/waiting-list/:id/offer` | JWT | ارائه‌ی اسلات |
| PATCH | `/bookings/waiting-list/:id/priority` | JWT | تغییر اولویت |

### مسیرهای «من» (مبتنی بر توکن)
| متد | مسیر | شرح |
|-----|------|-----|
| GET | `/doctors/me/schedule` | صف روزانه من |
| GET | `/doctors/me/timeline` | تایم‌لاین من |
| GET | `/bookings/me/monthly/:year/:month` | تقویم ماهانه من |
| GET | `/bookings/me/monthly?from=&to=` | تقویم بازه‌ای من (جلالی) |
| GET | `/bookings/me/appointments` | نوبت‌های من (بیمار) |

### کشف عمومی (بدون احراز هویت)
| متد | مسیر | شرح |
|-----|------|-----|
| GET | `/doctors` | دایرکتوری پزشکان |
| GET | `/doctors/:id` | پروفایل پزشک |
| GET | `/doctors/:id/shifts` | شیفت‌ها |
| GET | `/doctors/:id/slots` | اسلات‌های قابل‌رزرو |
| GET | `/doctors/:id/reviews` | نظرات تأییدشده + میانگین (عمومی) |

### نظرات بیماران
| متد | مسیر | دسترسی | شرح |
|-----|------|--------|-----|
| POST | `/reviews` | PATIENT | ثبت نظر برای نوبت تکمیل‌شده |
| GET | `/reviews/me` | PATIENT | نظرات من |
| GET | `/doctor/reviews` | DOCTOR | نظرات پزشک (همه وضعیت‌ها) |
| POST | `/doctor/reviews/:id/reply` | DOCTOR | پاسخ (فقط APPROVED) |
| GET | `/admin/reviews` | ADMIN | فهرست با فیلتر وضعیت/پزشک |
| PATCH | `/admin/reviews/:id/status` | ADMIN | تأیید / رد / پنهان |

### مالی
| متد | مسیر | دسترسی | شرح |
|-----|------|--------|-----|
| POST | `/finance/mock-pay` | JWT | آغاز شارژ کیف پول |
| GET | `/finance/mock-verify` | JWT | تأیید پرداخت |
| POST | `/finance/pay` | JWT | پرداخت ویزیت‌فی |
| POST | `/finance/settle` | JWT | تسویه و واریز کامل به پزشک |
| POST | `/finance/cancel` | JWT | پردازش لغو |
| GET | `/finance/wallet` | JWT | کیف پول من |
| GET | `/finance/doctor/earnings` | DOCTOR | درآمد پزشک |
| GET | `/finance/doctor/transactions` | DOCTOR | تراکنش‌های پزشک |
| GET | `/finance/doctor/wallet` | DOCTOR | کیف پول پزشک |
| GET | `/finance/dashboard` | ADMIN | داشبورد مالی |

### EHR
| متد | مسیر | دسترسی | شرح |
|-----|------|--------|-----|
| GET | `/ehr/doctor/patients` | JWT | دایرکتوری بیماران من |
| POST | `/ehr/medical-records` | JWT | ایجاد پرونده (SOAP) |
| GET | `/ehr/medical-records/...` | JWT | لیست بر اساس بیمار/پزشک/نوبت |
| POST | `/ehr/triage` | JWT | یادداشت تریاژ |
| GET | `/ehr/triage/...` | JWT | لیست تریاژ |

### پیش‌ویزیت AI
| متد | مسیر | دسترسی | شرح |
|-----|------|--------|-----|
| POST | `/previsit/appointments/:id/session` | PATIENT | تضمین/خواندن سشن |
| GET | `/previsit/appointments/:id` | JWT (مالک/پزشک) | وضعیت و گزارش |
| POST | `/previsit/appointments/:id/turn` | PATIENT | یک نوبت گفت‌وگو |
| GET | `/previsit/appointments/:id/messages` | JWT (مالک/پزشک) | transcript |

### نسخه
| متد | مسیر | دسترسی | شرح |
|-----|------|--------|-----|
| POST | `/prescriptions` | JWT (DOCTOR/ADMIN برای ایجاد) | صدور نسخه |
| GET | `/prescriptions/:id` | JWT | مشاهده |
| GET | `/prescriptions/patient/:patientId` | JWT | نسخه‌های بیمار |
| GET | `/prescriptions/doctor/:doctorId` | JWT | نسخه‌های پزشک |
| PATCH | `/prescriptions/:id/status` | DOCTOR/ADMIN | تغییر وضعیت |

### دارو (DOCTOR)
| متد | مسیر | شرح |
|-----|------|-----|
| GET | `/medicines/search` | جست‌وجوی هوشمند دارو |
| GET | `/medicines/:rxcui` | جزئیات دارو |
| GET | `/medicines/favorites` | علاقه‌مندی‌ها |
| POST | `/medicines/favorites` | افزودن به علاقه‌مندی |
| DELETE | `/medicines/favorites/:rxcui` | حذف از علاقه‌مندی |

---

## 8. امنیت و یکپارچگی داده

- **احراز هویت JWT**: تمام اندپوینت‌های حساس محافظت‌شده؛ توکن در فرانت‌اند در `localStorage` (با Zustand persist) نگهداری و از طریق interceptor به درخواست‌ها افزوده می‌شود.
- **هش گذرواژه**: bcrypt؛ `PasswordHash` هرگز در JSON سریال نمی‌شود.
- **RBAC سخت‌گیرانه**: در سطح middleware و همچنین در داخل handler/service.
- **حریم خصوصی بالینی**: یادداشت محرمانه‌ی EHR و Notes نسخه با DTOهای جداگانه در سطح موجودیت — قابل دور زدن نیست.
- **جلوگیری از double-booking**: تراکنش + retry + index یکتای تدافعی.
- **Indexهای یکپارچگی**: شماره تلفن یکتا، `user_id` یکتا برای پروفایل پزشک و کیف پول، `rxcui` یکتا برای دارو ([`BackEnd/cmd/clinic-api/bootstrap/app.go`](BackEnd/cmd/clinic-api/bootstrap/app.go:323)).
- **اعتبارسنجی ورودی**: `go-playground/validator` در backend و `zod` در frontend.
- **تراکنش‌های اتمیک مالی**: تغییرات کیف پول همواره داخل تراکنش (به همین دلیل MongoDB به‌صورت Replica Set اجرا می‌شود).
- **CORS**: در حالت توسعه permissive (در تولید باید سخت‌گیرانه شود).
- **PWA / Service Worker**: نسخه‌ی قابل‌نصب با `serwist` و manifest.

---

## 9. زیرساخت، استقرار و پیکربندی

### زیرساخت داکر

فایل [`BackEnd/docker-compose.yml`](BackEnd/docker-compose.yml:1) یک MongoDB نسخه 7 به‌صورت **Replica Set تک‌گره‌ای (rs0)** ارائه می‌دهد — که برای پشتیبانی از تراکنش‌های چندسندی (که سرویس finance/booking به آن وابسته‌اند) ضروری است. یک کمکی `init-replset` به‌صورت خودکار در اولین بالا‌آمدن، Replica Set را initiate می‌کند (idempotent و امن برای restart مکرر).

### پیکربندی (Environment Variables)

تمام مقادیر از متغیرهای محیطی با fallback امن بارگذاری می‌شوند ([`BackEnd/pkg/config/config.go`](BackEnd/pkg/config/config.go:102)). مهم‌ترین‌ها:

| متغیر | پیش‌فرض | شرح |
|-------|---------|-----|
| `APP_PORT` | 8080 | پورت سرور |
| `MONGO_URI` | mongodb://localhost:27017 | رشته اتصال MongoDB |
| `MONGO_DB_NAME` | clinic_db | نام دیتابیس |
| `JWT_SECRET` | change-me-in-production | راز JWT |
| `JWT_EXPIRATION_HOURS` | 24 | عمر توکن |
| `ADMIN_PHONE` / `ADMIN_PASSWORD` | — | اکانت ادمین seed |
| `SMS_PROVIDER` / `SMS_API_KEY` | mock | پروایدر OTP |
| `OTP_*` | — | سیاست OTP (طول، انقضا، retry، lock) |
| `RXNORM_BASE_URL` | https://rxnav.nlm.nih.gov/REST | API RxNorm |
| `MEDICINE_SEED_ON_BOOT` | false | seed خودکار داروها |
| `MEDICINE_FALLBACK_TO_RXNORM` | true | fallback زنده |
| `MEDICINE_CACHE_TTL_SECONDS` / `_MAX_ENTRIES` | 300 / 10000 | کش دارو |

> تشخیص هوشمند: با تنظیم `SMS_API_KEY` پروایدر به‌صورت خودکار به `iranpayamak` ارتقا می‌یابد.

### دستورات توسعه (Makefile)

| دستور | کاربرد |
|-------|--------|
| `make run` | اجرای سرور با `go run` |
| `make build` | کامپایل باینری در `bin/` |
| `make docker-up` | بالا آوردن MongoDB + Redis |
| `make seed-medicines` | seed دستی ایندیس دارو از RxNorm |
| `make swagger` | تولید مستند Swagger |

### فرانت‌اند

| دستور | کاربرد |
|-------|--------|
| `npm run dev` | سرور توسعه (پورت 3000) |
| `npm run build` / `start` | build و اجرای production |
| `npm run lint` | ESLint |

---

## 10. ساختار پوشه‌ها

```
Clinick/
├── BackEnd/                      # REST API با Go
│   ├── cmd/
│   │   ├── clinic-api/           # نقطه ورود + bootstrap (مونتاژ گراف برنامه)
│   │   │   ├── main.go
│   │   │   └── bootstrap/        # app.go, routes.go, public.go, server.go, adapter.go
│   │   └── medicine-seed/        # ابزار seed دارو
│   ├── internal/                 # دامنه‌های کسب‌وکار (هرکدام entity/service/handler)
│   │   ├── booking/   clinic/    ehr/    finance/
│   │   ├── medicine/  notification/  otp/
│   │   ├── prescription/   schedule/   user/
│   ├── pkg/                      # pkgهای قابل‌استفاده‌ی مجدد (نمی‌توانند internal را ایمپورت کنند)
│   │   ├── config/  database/   middleware/   jwt/
│   │   ├── errormap/  logger/   requestctx/   validator/
│   ├── docker-compose.yml  Makefile  go.mod  .env
│
├── FrontEnd/                     # Next.js + TypeScript (فارسی/RTL)
│   ├── src/
│   │   ├── app/                  # App Router گروه‌بندی‌شده بر اساس نقش
│   │   │   ├── (auth)/  (patient)/  admin/  doctor/  reception/
│   │   ├── components/           # ui/ (shadcn), shared/, auth/, prescription/, payment/
│   │   ├── hooks/                # Custom React Query hooks
│   │   ├── lib/                  # api.ts, *-api.ts, jalali.ts, utils.ts
│   │   ├── store/                # authStore (Zustand)
│   │   └── types/                # اینترفیس‌های منطبق با DTOهای Go
│   ├── public/                   # فونت‌های Vazirmatn، آیکون‌ها، manifest
│   └── package.json
│
└── docs/                         # مستندات (این فایل)
```

---

> این مستند بازتاب دقیق کد منبع فعلی است. در صورت افزودن قابلیت جدید یا تغییر منطق کسب‌وکار، این فایل باید به‌روزرسانی شود. منبع حقیقت برای قواعد معماری: [`BackEnd/AGENTS.md`](BackEnd/AGENTS.md:1) و [`FrontEnd/FRONTEND_RULES.md`](FrontEnd/FRONTEND_RULES.md:1)، و برای نیازمندی‌های کسب‌وکار: [`BackEnd/REQUIREMENTS.md`](BackEnd/REQUIREMENTS.md:1).
