/**
 * Script to capture crisp screenshots of all key views in Clinick.
 * Uses Playwright to mock API endpoints where helpful and capture authentic screenshots.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.resolve(__dirname, '../docs/screenshots');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const BASE_URL = 'http://localhost:3005';

// Realistic mock data
const mockDoctors = [
  {
    id: "doc-1",
    user_id: "usr-doc-1",
    first_name: "دکتر آرمان",
    last_name: "خرمی",
    full_name: "دکتر آرمان خرمی",
    specialty: "متخصص قلب و عروق",
    medical_system_number: "47821",
    visit_duration_minutes: 30,
    visit_fee: 450000,
    rating: 4.9,
    bio: "فلوشیپ آنژیوپلاستی با ۱۲ سال سابقه بالینی و پژوهشی در درمان آریتمی‌های قلبی."
  },
  {
    id: "doc-2",
    user_id: "usr-doc-2",
    first_name: "دکتر شیرین",
    last_name: "اعتمادی",
    full_name: "دکتر شیرین اعتمادی",
    specialty: "متخصص پوست، مو و زیبایی",
    medical_system_number: "51209",
    visit_duration_minutes: 20,
    visit_fee: 350000,
    rating: 4.8,
    bio: "بورد تخصصی ناسیونال، متخصص درماتولوژی، لیزر و جوان‌سازی پوست."
  },
  {
    id: "doc-3",
    user_id: "usr-doc-3",
    first_name: "دکتر بابک",
    last_name: "رادمنش",
    full_name: "دکتر بابک رادمنش",
    specialty: "متخصص مغز و اعصاب (نورولوژی)",
    medical_system_number: "38914",
    visit_duration_minutes: 30,
    visit_fee: 480000,
    rating: 4.7,
    bio: "عضو انجمن مغز و اعصاب ایران، فوق‌تخصص سردرد و بیماری‌های نورودژنراتیو."
  },
  {
    id: "doc-4",
    user_id: "usr-doc-4",
    first_name: "دکتر مریم",
    last_name: "صادقی",
    full_name: "دکتر مریم صادقی",
    specialty: "متخصص اطفال و کودکان",
    medical_system_number: "62105",
    visit_duration_minutes: 25,
    visit_fee: 300000,
    rating: 4.9,
    bio: "متخصص رشد و تکامل نوزادان، گوارش و تغذیه کودکان."
  }
];

const mockFinanceDashboard = {
  summary: {
    total_revenue: 148500000,
    total_appointments: 342,
    avg_no_show_rate: 4.2
  },
  revenue_trend: [
    { month: "فروردین", revenue: 18500000 },
    { month: "اردیبهشت", revenue: 22000000 },
    { month: "خرداد", revenue: 24800000 },
    { month: "تیر", revenue: 21500000 },
    { month: "مرداد", revenue: 28000000 },
    { month: "شهریور", revenue: 33700000 }
  ],
  doctor_earnings_trend: [
    { month: "فروردین", doctor_earnings: 14800000 },
    { month: "اردیبهشت", doctor_earnings: 17600000 },
    { month: "خرداد", doctor_earnings: 19800000 },
    { month: "تیر", doctor_earnings: 17200000 },
    { month: "مرداد", doctor_earnings: 22400000 },
    { month: "شهریور", doctor_earnings: 26900000 }
  ],
  no_show_trend: [
    { month: "فروردین", no_show_rate: 5.1 },
    { month: "اردیبهشت", no_show_rate: 4.5 },
    { month: "خرداد", no_show_rate: 3.8 },
    { month: "تیر", no_show_rate: 4.2 },
    { month: "مرداد", no_show_rate: 3.5 },
    { month: "شهریور", no_show_rate: 4.0 }
  ]
};

const mockDoctorSchedule = {
  items: [
    {
      id: "apt-1",
      patient_name: "سارا محمدی",
      patient_phone: "09121112233",
      start_time: "09:00",
      end_time: "09:30",
      status: "COMPLETED",
      tracking_code: "CLK-1049",
      chief_complaint: "بررسی دوره‌ای فشار خون و اکوکاردیوگرافی"
    },
    {
      id: "apt-2",
      patient_name: "علی کریمی",
      patient_phone: "09123334455",
      start_time: "09:30",
      end_time: "10:00",
      status: "IN_PROGRESS",
      tracking_code: "CLK-1050",
      chief_complaint: "تپش قلب حاد و تنگی نفس فعالیتی"
    },
    {
      id: "apt-3",
      patient_name: "رضا حسینی",
      patient_phone: "09125556677",
      start_time: "10:00",
      end_time: "10:30",
      status: "CONFIRMED",
      tracking_code: "CLK-1051",
      chief_complaint: "درد قفسه سینه سمت چپ"
    },
    {
      id: "apt-4",
      patient_name: "مهسا ابراهیمی",
      patient_phone: "09127778899",
      start_time: "10:30",
      end_time: "11:00",
      status: "CONFIRMED",
      tracking_code: "CLK-1052",
      chief_complaint: "مشاوره آزمایش‌های قلبی و چربی خون"
    }
  ]
};

const mockTimelineResponse = {
  date: new Date().toISOString().slice(0, 10),
  shift: {
    start_time: "08:30",
    end_time: "14:00",
    total_slots: 10,
    booked_slots: 6
  },
  appointments: [
    {
      id: "apt-1",
      tracking_code: "CLK-801",
      patient_id: "p-1",
      patient_name: "محمد جوادی",
      patient_phone: "09121234567",
      start_time: "09:00",
      end_time: "09:30",
      status: "COMPLETED",
      visit_fee: 450000,
      is_previsit_completed: true
    },
    {
      id: "apt-2",
      tracking_code: "CLK-802",
      patient_id: "p-2",
      patient_name: "نیلوفر کاظمی",
      patient_phone: "09129876543",
      start_time: "09:30",
      end_time: "10:00",
      status: "IN_PROGRESS",
      visit_fee: 450000,
      is_previsit_completed: true
    },
    {
      id: "apt-3",
      tracking_code: "CLK-803",
      patient_id: "p-3",
      patient_name: "فرهاد شریفی",
      patient_phone: "09124445566",
      start_time: "10:00",
      end_time: "10:30",
      status: "CONFIRMED",
      visit_fee: 450000,
      is_previsit_completed: false
    },
    {
      id: "apt-4",
      tracking_code: "CLK-804",
      patient_id: "p-4",
      patient_name: "سمیرا نیک‌نام",
      patient_phone: "09123332211",
      start_time: "10:30",
      end_time: "11:00",
      status: "PENDING",
      visit_fee: 450000,
      is_previsit_completed: false
    }
  ]
};

const mockPatientAppointments = [
  {
    id: "apt-101",
    tracking_code: "CLK-9421",
    doctor_name: "دکتر آرمان خرمی",
    specialty: "متخصص قلب و عروق",
    date: new Date().toISOString().slice(0, 10),
    time: "10:00",
    status: "CONFIRMED",
    payment_status: "PAID",
    amount: 450000,
    has_previsit: true
  },
  {
    id: "apt-95",
    tracking_code: "CLK-8104",
    doctor_name: "دکتر شیرین اعتمادی",
    specialty: "متخصص پوست و زیبایی",
    date: "2026-10-15",
    time: "16:30",
    status: "COMPLETED",
    payment_status: "PAID",
    amount: 350000,
    has_previsit: true
  }
];

async function captureAll() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  async function setupContextAndPage(userRole) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2, // High resolution for beautiful screenshots
      locale: 'fa-IR',
    });

    const page = await context.newPage();

    // Mock API requests
    await page.route('**/api/v1/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/finance/dashboard')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockFinanceDashboard) });
      }
      if (url.includes('/finance/doctor/wallet') || url.includes('/finance/wallet')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ balance: 42500000, locked_balance: 1500000, currency: "IRR" }) });
      }
      if (url.includes('/finance/doctor/earnings') || url.includes('/doctor/earnings')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_earnings: 38200000, visits_count: 94, month_label: "آبان ۱۴۰۵" }) });
      }
      if (url.includes('/doctor/schedule') || url.includes('/bookings/doctor/schedule')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDoctorSchedule) });
      }
      if (url.includes('/daily-timeline') || url.includes('/timeline')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockTimelineResponse) });
      }
      if (url.includes('/bookings/patient') || url.includes('/patient/appointments') || url.includes('/bookings?patient_id')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPatientAppointments) });
      }
      if (url.includes('/doctors') || url.includes('/admin/doctors')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDoctors) });
      }
      if (url.includes('/schedule/leaves')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }
      if (url.includes('/schedule/shifts')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }
      if (url.includes('/auth/profile')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: "user-1",
            role: userRole,
            phone: "09121234567",
            first_name: userRole === 'ADMIN' ? 'مدیر' : (userRole === 'DOCTOR' ? 'دکتر آرمان' : (userRole === 'RECEPTIONIST' ? 'مریم' : 'سارا')),
            last_name: userRole === 'ADMIN' ? 'سیستم' : (userRole === 'DOCTOR' ? 'خرمی' : (userRole === 'RECEPTIONIST' ? 'کاویانی' : 'محمدی')),
            national_code: "0012345678"
          })
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    if (userRole) {
      await page.addInitScript((role) => {
        const user = {
          id: "user-1",
          role: role,
          phone: "09121234567",
          first_name: role === 'ADMIN' ? 'مدیر' : (role === 'DOCTOR' ? 'دکتر آرمان' : (role === 'RECEPTIONIST' ? 'مریم' : 'سارا')),
          last_name: role === 'ADMIN' ? 'سیستم' : (role === 'DOCTOR' ? 'خرمی' : (role === 'RECEPTIONIST' ? 'کاویانی' : 'محمدی')),
          national_code: "0012345678"
        };
        localStorage.setItem('auth-storage', JSON.stringify({
          state: { user, token: 'mock-jwt-token-clinick' },
          version: 0
        }));
      }, userRole);
    }

    return { context, page };
  }

  console.log('Capturing Landing & Public Pages...');
  {
    const { context, page } = await setupContextAndPage(null);
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '01_landing_hero.png'), fullPage: false });
    await page.screenshot({ path: path.join(OUTPUT_DIR, '01_landing_full.png'), fullPage: true });

    await page.goto(`${BASE_URL}/booking`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '02_booking.png'), fullPage: false });

    await page.goto(`${BASE_URL}/doctors`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '03_doctors.png'), fullPage: false });

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '04_login.png'), fullPage: false });

    await page.goto(`${BASE_URL}/articles`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '05_articles.png'), fullPage: false });

    await context.close();
  }

  console.log('Capturing Admin Panel...');
  {
    const { context, page } = await setupContextAndPage('ADMIN');
    await page.goto(`${BASE_URL}/admin/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '06_admin_dashboard.png'), fullPage: false });

    await page.goto(`${BASE_URL}/admin/doctors`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '07_admin_doctors.png'), fullPage: false });

    await page.goto(`${BASE_URL}/admin/financial-reports`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '08_admin_financial.png'), fullPage: false });

    await context.close();
  }

  console.log('Capturing Doctor Panel...');
  {
    const { context, page } = await setupContextAndPage('DOCTOR');
    await page.goto(`${BASE_URL}/doctor/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '09_doctor_dashboard.png'), fullPage: false });

    await page.goto(`${BASE_URL}/doctor/queue`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '10_doctor_queue.png'), fullPage: false });

    await page.goto(`${BASE_URL}/doctor/shifts`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '11_doctor_shifts.png'), fullPage: false });

    await context.close();
  }

  console.log('Capturing Reception Panel...');
  {
    const { context, page } = await setupContextAndPage('RECEPTIONIST');
    await page.goto(`${BASE_URL}/reception/timeline`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '12_reception_timeline.png'), fullPage: false });

    await page.goto(`${BASE_URL}/reception/queue`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '13_reception_queue.png'), fullPage: false });

    await context.close();
  }

  console.log('Capturing Patient Portal...');
  {
    const { context, page } = await setupContextAndPage('PATIENT');
    await page.goto(`${BASE_URL}/appointments`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '14_patient_appointments.png'), fullPage: false });

    await page.goto(`${BASE_URL}/wallet`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '15_patient_wallet.png'), fullPage: false });

    await context.close();
  }

  await browser.close();
  console.log('All screenshots captured successfully!');
}

captureAll().catch(err => {
  console.error('Error during capture:', err);
  process.exit(1);
});
