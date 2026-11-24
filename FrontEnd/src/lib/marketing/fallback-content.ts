/**
 * ============================================================================
 * CLINICK — FALLBACK MARKETING CONTENT
 * ============================================================================
 * A complete, production-grade Persian content payload used when no remote CMS
 * or live backend is available. It doubles as the canonical example of the
 * {@link MarketingContent} shape and as editable seed data for the admin panel.
 *
 * Imagery uses Unsplash (the only remote host whitelisted in next.config.ts).
 * All copy is bilingual (fa primary, en optional) so the site is multilingual
 * ready without further changes.
 * ============================================================================
 */

import type { MarketingContent } from "./types";

/** Centralized Unsplash base for consistent, optimized, royalty-free imagery. */
const IMG = "https://images.unsplash.com";

/** Local imagery from /public/Images (Persian filenames are URL-encoded). */
const LOCAL_IMG = (filename: string) =>
  `/Images/${encodeURIComponent(filename)}`;

export function getFallbackContent(locale: MarketingContent["locale"]): MarketingContent {
  return {
    locale,

    settings: {
      clinicName: {
        fa: "کلینیک تخصصی سپاس",
        en: "Sepas Specialty Clinic",
      },
      tagline: {
        fa: "مراقبت پزشکیِ حرفه‌ای، با تجربه‌ای آرام و مطمئن",
        en: "Expert medical care, delivered with a calm and trusted experience",
      },
      description: {
        fa: "کلینیک چندتخصصی سپاس با تیمی از پزشکان مجرب، فناوری روز و رویکردی انسان‌محور، مراقبت بهداشتی در سطح بین‌المللی را در قلب شهر شما ارائه می‌کند.",
        en: "A multi-specialty clinic bringing international-standard care to your city through an experienced team, modern technology and a human-first approach.",
      },
      logoUrl: undefined,
      logoMark: "سپاس",
      primaryPhone: "۰۲۱-۹۱۰۰۲۰۳۰",
      emergencyPhone: "۰۲۱-۹۱۰۰۲۰۴۰",
      email: "info@sepasclinic.ir",
      address: {
        fa: "تهران، خیابان ولیعصر، بالاتر از میدان ونک، برج سپاس، طبقهٔ همکف",
        en: "Tehran, Valiasr St., above Vanak Sq., Sepas Tower, Ground floor",
      },
      branches: [
        {
          id: "vanak",
          name: { fa: "شعبهٔ مرکزی ونک", en: "Vanak (Main)" },
          address: {
            fa: "تهران، میدان ونک",
            en: "Tehran, Vanak Square",
          },
          phone: "۰۲۱-۹۱۰۰۲۰۳۰",
          isMain: true,
        },
        {
          id: "west",
          name: { fa: "شعبهٔ غرب", en: "West Branch" },
          address: {
            fa: "تهران، شهرک غرب",
            en: "Tehran, Shahrak-e Gharb",
          },
          phone: "۰۲۱-۹۱۰۰۲۰۵۰",
        },
      ],
      workingHours: [
        { day: { fa: "شنبه تا چهارشنبه", en: "Sat–Wed" }, hours: { fa: "۸:۰۰ تا ۲۱:۰۰", en: "8:00–21:00" } },
        { day: { fa: "پنجشنبه", en: "Thursday" }, hours: { fa: "۸:۰۰ تا ۱۸:۰۰", en: "8:00–18:00" } },
        { day: { fa: "جمعه", en: "Friday" }, hours: { fa: "اضطراری ۲۴ ساعته", en: "Emergency 24/7" } },
      ],
      socials: [
        { platform: "instagram", label: { fa: "اینستاگرام", en: "Instagram" }, url: "https://instagram.com" },
        { platform: "telegram", label: { fa: "تلگرام", en: "Telegram" }, url: "https://telegram.org" },
        { platform: "whatsapp", label: { fa: "واتساپ", en: "WhatsApp" }, url: "https://whatsapp.com" },
        { platform: "linkedin", label: { fa: "لینکدین", en: "LinkedIn" }, url: "https://linkedin.com" },
      ],
      insurances: [
        { fa: "بیمه سلامت", en: "Health Insurance" },
        { fa: "بیمه ایران", en: "Iran Insurance" },
        { fa: "بیمه آسیا", en: "Asia Insurance" },
        { fa: "بیمه دانا", en: "Dana Insurance" },
        { fa: "بیمه پاسارگاد", en: "Pasargad Insurance" },
      ],
      legalBadges: [
        { label: { fa: "نماد اعتماد الکترونیکی", en: "eTrust Symbol" }, href: "#" },
        { label: { fa: "ساماندهی پزشکان", en: "Medical Council Verified" }, href: "#" },
      ],
    },

    announcements: [
      { id: "a1", icon: "Clock", text: { fa: "پذیرش و پاسخگویی ۲۴ ساعته در شعبهٔ مرکزی", en: "24/7 admission at the main branch" } },
      { id: "a2", icon: "CalendarCheck", text: { fa: "رزرو آنلاین نوبت بدون مراجعهٔ حضوری", en: "Book appointments online — no waiting in line" } },
      { id: "a3", icon: "ShieldCheck", text: { fa: "پذیرش بیش از ۳۰ بیمهٔ تکمیلی", en: "30+ supplementary insurances accepted" } },
    ],

    nav: [
      { label: { fa: "خانه", en: "Home" }, href: "/" },
      { label: { fa: "خدمات", en: "Services" }, href: "/#services" },
      { label: { fa: "پزشکان", en: "Doctors" }, href: "/doctors" },
      { label: { fa: "درباره ما", en: "About" }, href: "/#about" },
      { label: { fa: "نظرات", en: "Testimonials" }, href: "/#testimonials" },
      { label: { fa: "مقالات", en: "Articles" }, href: "/#articles" },
      { label: { fa: "سوالات متداول", en: "FAQ" }, href: "/#faq" },
      { label: { fa: "تماس با ما", en: "Contact" }, href: "/#contact" },
    ],

    hero: {
      eyebrow: { fa: "پلتفرم سلامت آنلاین", en: "The online healthcare platform" },
      title: {
        fa: "نوبت‌دهی، پرونده پزشکی و نسخهٔ دیجیتال،",
        en: "Book, manage and get prescriptions —",
      },
      highlight: { fa: "در یک پلتفرم امن سلامت", en: "one secure healthcare platform" },
      description: {
        fa: "نوبت بگیرید، سوابق پزشکی و نتایج آزمایش را مدیریت کنید، نسخهٔ الکترونیک دریافت کنید و درمان خود را از هر دستگاهی دنبال کنید؛ همه‌چیز در یک پلتفرم برای بیماران، پزشکان و کلینیک‌ها.",
        en: "Book appointments, manage medical records & lab results, receive e-prescriptions and follow your treatment from any device — one platform for patients, doctors and clinics.",
      },
      primaryCta: {
        label: { fa: "رزرو نوبت", en: "Book Appointment" },
        href: "/booking",
        icon: "CalendarCheck",
      },
      secondaryCta: {
        label: { fa: "کشف امکانات", en: "Explore Features" },
        href: "/#features",
        icon: "Sparkles",
      },
      imageUrl: `${IMG}/photo-1631217868264-e5b90bb7e133?auto=format&fit=crop&w=1200&q=80`,
      imageAlt: { fa: "محیط مدرن کلینیک سپاس", en: "Modern interior of Sepas Clinic" },
      floatingCards: [
        {
          id: "fc1",
          icon: "CalendarCheck2",
          title: { fa: "رزرو نوبت موفق", en: "Appointment confirmed" },
          subtitle: { fa: "دکتر رضوی — سه‌شنبه ۱۰:۳۰", en: "Dr. Razavi — Wed 10:30" },
          tone: "brand",
        },
        {
          id: "fc2",
          icon: "FileText",
          title: { fa: "نسخهٔ الکترونیک", en: "E-prescription" },
          subtitle: { fa: "همگام با پروندهٔ شما", en: "Synced to your record" },
          tone: "success",
        },
        {
          id: "fc3",
          icon: "HeartPulse",
          title: { fa: "پروندهٔ پزشکی", en: "Medical record" },
          subtitle: { fa: "تاریخچهٔ کامل درمان", en: "Full treatment history" },
          tone: "gold",
        },
      ],
      trustBadges: [
        { fa: "پذیرش ۲۴ ساعته", en: "24/7 admission" },
        { fa: "بیش از ۱۵ تخصص", en: "15+ specialties" },
        { fa: "۲۵ سال سابقه", en: "25 years of care" },
      ],
    },

    stats: {
      eyebrow: { fa: "در یک نگاه", en: "At a glance" },
      title: { fa: "اعدادی که اعتماد می‌سازند", en: "Numbers that build trust" },
      items: [
        { id: "s1", value: 80, suffix: "+", label: { fa: "پزشک متخصص", en: "Specialist doctors" }, icon: "Stethoscope" },
        { id: "s2", value: 25, suffix: " سال", label: { fa: "سابقهٔ فعالیت", en: "Years of service" }, icon: "Award" },
        { id: "s3", value: 320, suffix: "هزار+", label: { fa: "بیمار راضی", en: "Happy patients" }, icon: "Users" },
        { id: "s4", value: 98, suffix: "%", label: { fa: "رضایت مراجعین", en: "Patient satisfaction" }, icon: "Smile" },
        { id: "s5", value: 15, suffix: "+", label: { fa: "تخصص پزشکی", en: "Medical specialties" }, icon: "Activity" },
        { id: "s6", value: 6, suffix: "", label: { fa: "شعبه فعال", en: "Active branches" }, icon: "MapPin" },
      ],
    },

    about: {
      eyebrow: { fa: "دربارهٔ ما", en: "About us" },
      title: { fa: "جایی که علم، فناوری و همدلی به هم می‌رسند", en: "Where science, technology and empathy meet" },
      description: {
        fa: "کلینیک سپاس با باوری ساده آغاز شد: مراقبت پزشکیِ باکیفیت نباید استرس‌زا باشد. ما محیطی ساخته‌ایم که در آن بیمار در مرکز توجه است و هر گام از مسیر درمان شفاف، سریع و قابل اعتماد است.",
      },
      paragraphs: [
        {
          fa: "از روز نخست تأسیس در سال ۱۳۷۸، رسالت ما ارائهٔ مراقبتی فراتر از درمان بیماری بوده است؛ تجربه‌ای که در آن بیمار احساس می‌کند شنیده شده، درک شده و در امان است.",
        },
        {
          fa: "امروز با تیمی متشکل از پزشکان برجسته و فناوری روز دنیا، استانداردهای مراقبت سلامت را در سطح بین‌المللی تعریف می‌کنیم و همچنان به همان باور اولیه وفاداریم.",
        },
      ],
      mission: {
        fa: "ارائهٔ مراقبت پزشکیِ ایمن، دقیق و انسان‌محور و تسهیل دسترسی همهٔ افراد جامعه به سلامت باکیفیت.",
        en: "Deliver safe, precise and human-centered care, making quality health accessible to all.",
      },
      vision: {
        fa: "تبدیل شدن به مرجع مورد اعتماد مراقبت سلامت با تجربه‌ای لوکس، شفاف و مبتنی بر فناوری.",
        en: "Become the most trusted healthcare destination through a premium, transparent, tech-enabled experience.",
      },
      values: [
        { icon: "ShieldCheck", title: { fa: "اعتماد و شفافیت", en: "Trust & transparency" }, description: { fa: "هر تصمیم درمانی روشن و قابل پیگیری است.", en: "Every treatment decision is clear and trackable." } },
        { icon: "HeartHandshake", title: { fa: "همدلی با بیمار", en: "Compassion" }, description: { fa: "بیمار همواره در مرکز توجه قرار دارد.", en: "The patient is always at the center." } },
        { icon: "Sparkles", title: { fa: "کیفیت بی‌چون‌وچرا", en: "Uncompromising quality" }, description: { fa: "التزام به بالاترین استانداردهای روز.", en: "Committed to the highest modern standards." } },
        { icon: "Lightbulb", title: { fa: "نوآوری مستمر", en: "Continuous innovation" }, description: { fa: "بهره‌گیری از فناوری برای تجربهٔ بهتر.", en: "Leveraging technology for a better experience." } },
      ],
      imageUrl: LOCAL_IMG("درباره ما.jpg"),
      imageAlt: { fa: "تیم پزشکی کلینیک سپاس", en: "The Sepas medical team" },
      badges: [
        { fa: "دارای تأییدیهٔ وزارت بهداشت", en: "Ministry of Health certified" },
        { fa: "گواهی ISO 9001", en: "ISO 9001 certified" },
      ],
    },

    services: {
      eyebrow: { fa: "خدمات درمانی", en: "Medical services" },
      title: { fa: "هر آنچه برای سلامت شما لازم دارید، زیر یک سقف", en: "Everything you need for your health, under one roof" },
      description: {
        fa: "از مراقبت‌های پیشگیرانه تا درمان‌های تخصصی؛ طیف کاملی از خدمات پزشکی توسط تیمی از متخصصان مجرب.",
      },
      items: [
        {
          id: "cardio", slug: "cardiology", icon: "HeartPulse",
          title: { fa: "قلب و عروق", en: "Cardiology" },
          description: { fa: "تشخیص و درمان بیماری‌های قلبی با تجهیزات پیشرفته و متخصصان مجرب.", en: "Diagnosis and treatment of heart conditions with advanced equipment." },
          imageUrl: LOCAL_IMG("قلب و عروق.webp"),
          features: [{ fa: "نوار قلب و اکو", en: "ECG & Echo" }, { fa: "تست ورزش", en: "Stress test" }],
          href: "/services/cardiology",
        },
        {
          id: "derma", slug: "dermatology", icon: "Sparkles",
          title: { fa: "پوست و زیبایی", en: "Dermatology" },
          description: { fa: "مراقبت و درمان تخصصی مشکلات پوستی، مو و زیبایی با جدیدترین روش‌ها.", en: "Specialized skin, hair and aesthetic care with the latest methods." },
          imageUrl: LOCAL_IMG("پوست و زیبایی.webp"),
          features: [{ fa: "لیزر پوست", en: "Laser therapy" }, { fa: "زیبایی پوست", en: "Aesthetics" }],
          href: "/services/dermatology",
        },
        {
          id: "women", slug: "gynecology", icon: "Flower2",
          title: { fa: "زنان و زایمان", en: "Gynecology" },
          description: { fa: "مراقبت جامع سلامت زنان در تمامی مراحل زندگی با محیطی امن و خصوصی.", en: "Comprehensive women's healthcare in a safe, private setting." },
          imageUrl: LOCAL_IMG("زنان و زایمان.webp"),
          features: [{ fa: "مشاوره تخصصی", en: "Specialist counseling" }, { fa: "تصویربرداری", en: "Imaging" }],
          href: "/services/gynecology",
        },
        {
          id: "ortho", slug: "orthopedics", icon: "Bone",
          title: { fa: "ارتوپدی و فیزیوتراپی", en: "Orthopedics" },
          description: { fa: "درمان آسیب‌های استخوان، مفاصل و توانبخشی با برنامه‌های تخصصی.", en: "Treatment of bone and joint injuries and specialized rehab." },
          imageUrl: LOCAL_IMG("ارتوپدی و فیزیوتراپی.webp"),
          features: [{ fa: "فیزیوتراپی", en: "Physiotherapy" }, { fa: "توانبخشی", en: "Rehabilitation" }],
          href: "/services/orthopedics",
        },
        {
          id: "pediatric", slug: "pediatrics", icon: "Baby",
          title: { fa: "اطفال و نوزادان", en: "Pediatrics" },
          description: { fa: "مراقبت تخصصی و مهربانانه از سلامت کودکان از بدو تولد تا نوجوانی.", en: "Specialized, gentle care for children from birth to adolescence." },
          imageUrl: LOCAL_IMG("اطفال و نوزادان.webp"),
          features: [{ fa: "واکسیناسیون", en: "Vaccination" }, { fa: "رشد کودک", en: "Growth tracking" }],
          href: "/services/pediatrics",
        },
        {
          id: "dental", slug: "dentistry", icon: "Smile",
          title: { fa: "دندانپزشکی", en: "Dentistry" },
          description: { fa: "خدمات جامع دندانپزشکی از زیبایی تا ایمپلنت در محیطی استریل و مدرن.", en: "Comprehensive dentistry from aesthetics to implants." },
          imageUrl: LOCAL_IMG("دندانپزشکی.webp"),
          features: [{ fa: "ایمپلت", en: "Implants" }, { fa: "ارتودنسی", en: "Orthodontics" }],
          href: "/services/dentistry",
        },
        {
          id: "psych", slug: "psychology", icon: "Brain",
          title: { fa: "روانشناسی و روانپزشکی", en: "Psychology" },
          description: { fa: "حمایت تخصصی از سلامت روان در فضایی امن، محرمانه و بدون قضاوت.", en: "Specialized mental-health support in a safe, confidential space." },
          imageUrl: LOCAL_IMG("روانشناسی و روانپزشکی.png"),
          features: [{ fa: "مشاوره فردی", en: "Individual therapy" }, { fa: "رواندرمانی", en: "Psychotherapy" }],
          href: "/services/psychology",
        },
        {
          id: "lab", slug: "laboratory", icon: "TestTube2",
          title: { fa: "آزمایشگاه و تصویربرداری", en: "Lab & Imaging" },
          description: { fa: "آزمایش‌های تشخیصی و تصویربرداری دیجیتال با دقت بالا و نتیجه‌گیری سریع.", en: "Diagnostic tests and digital imaging with fast, accurate results." },
          imageUrl: LOCAL_IMG("آزمایشگاه و تصویربرداری.webp"),
          features: [{ fa: "نتیجه آنلاین", en: "Online results" }, { fa: "تصویربرداری", en: "Imaging" }],
          href: "/services/laboratory",
        },
      ],
    },

    doctors: {
      eyebrow: { fa: "تیم پزشکی", en: "Our physicians" },
      title: { fa: "پزشکانی که به آن‌ها اعتماد می‌کنید", en: "Doctors you can trust" },
      description: {
        fa: "تیمی از متخصصان برجسته با سال‌ها تجربه و تعهد به مراقبت بیمارمحور.",
      },
      items: [
        {
          id: "d1", slug: "razavi",
          name: { fa: "دکتر سارا رضوی", en: "Dr. Sara Razavi" },
          specialty: { fa: "متخصص قلب و عروق", en: "Cardiologist" },
          imageUrl: `${IMG}/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=600&q=80`,
          medicalCouncilId: "۱۲۳۴۵",
          yearsExperience: 14,
          rating: 4.9,
          reviewsCount: 320,
          daysAvailable: [{ fa: "شنبه", en: "Sat" }, { fa: "دوشنبه", en: "Mon" }, { fa: "چهارشنبه", en: "Wed" }],
          bio: { fa: "متخصص بیماری‌های قلبی با تخصص ویژه در اکوکاردیوگرافی.", en: "Cardiac specialist focused on echocardiography." },
          languages: [{ fa: "فارسی", en: "Persian" }, { fa: "انگلیسی", en: "English" }],
          clinic: { fa: "کلینیک سپاس — ونک", en: "Sepas Clinic — Vanak" },
          fee: 250000,
          nextSlot: { fa: "امروز ۱۶:۰۰", en: "Today 16:00" },
          availableToday: true,
          onlineConsult: true,
          verified: true,
          profileHref: "/doctors/razavi",
          bookHref: "/booking?doctor=razavi",
        },
        {
          id: "d2", slug: "mohseni",
          name: { fa: "دکتر علی محسنی", en: "Dr. Ali Mohseni" },
          specialty: { fa: "متخصص ارتوپدی", en: "Orthopedic Surgeon" },
          imageUrl: `${IMG}/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=600&q=80`,
          medicalCouncilId: "۲۳۴۵۶",
          yearsExperience: 18,
          rating: 4.8,
          reviewsCount: 410,
          daysAvailable: [{ fa: "یکشنبه", en: "Sun" }, { fa: "سه‌شنبه", en: "Tue" }],
          bio: { fa: "جراح ارتوپدی با تخصص در آسیب‌های ورزشی و مفصل زانو." },
          clinic: { fa: "کلینیک سپاس — غرب", en: "Sepas Clinic — West" },
          fee: 300000,
          nextSlot: { fa: "فردا ۱۰:۰۰", en: "Tomorrow 10:00" },
          availableToday: false,
          onlineConsult: false,
          verified: true,
          profileHref: "/doctors/mohseni",
          bookHref: "/booking?doctor=mohseni",
        },
        {
          id: "d3", slug: "karimi",
          name: { fa: "دکتر نگار کریمی", en: "Dr. Negar Karimi" },
          specialty: { fa: "متخصص پوست و زیبایی", en: "Dermatologist" },
          imageUrl: `${IMG}/photo-1594824476967-48c8b964273f?auto=format&fit=crop&w=600&q=80`,
          medicalCouncilId: "۳۴۵۶۷",
          yearsExperience: 11,
          rating: 4.9,
          reviewsCount: 540,
          daysAvailable: [{ fa: "شنبه", en: "Sat" }, { fa: "دوشنبه", en: "Mon" }],
          bio: { fa: "متخصص پوست با تخصص در لیزر و زیبایی پوست." },
          clinic: { fa: "کلینیک سپاس — ونک", en: "Sepas Clinic — Vanak" },
          fee: 220000,
          nextSlot: { fa: "امروز ۱۸:۳۰", en: "Today 18:30" },
          availableToday: true,
          onlineConsult: true,
          verified: true,
          profileHref: "/doctors/karimi",
          bookHref: "/booking?doctor=karimi",
        },
        {
          id: "d4", slug: "ahmadi",
          name: { fa: "دکتر رضا احمدی", en: "Dr. Reza Ahmadi" },
          specialty: { fa: "متخصص اطفال", en: "Pediatrician" },
          imageUrl: `${IMG}/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=600&q=80`,
          medicalCouncilId: "۴۵۶۷۸",
          yearsExperience: 16,
          rating: 5.0,
          reviewsCount: 480,
          daysAvailable: [{ fa: "یکشنبه", en: "Sun" }, { fa: "چهارشنبه", en: "Wed" }],
          bio: { fa: "متخصص کودکان با رویکردی مهربانانه و خانوادهمحور." },
          clinic: { fa: "کلینیک سپاس — مرکزی", en: "Sepas Clinic — Central" },
          fee: 200000,
          nextSlot: { fa: "امروز ۱۵:۰۰", en: "Today 15:00" },
          availableToday: true,
          onlineConsult: false,
          verified: true,
          profileHref: "/doctors/ahmadi",
          bookHref: "/booking?doctor=ahmadi",
        },
      ],
    },

    features: {
      eyebrow: { fa: "امکانات کلینیک", en: "Clinic features" },
      title: { fa: "تجربه‌ای بی‌دردسر، از اولین تماس تا پس از درمان", en: "A seamless experience, from first call to follow-up" },
      description: {
        fa: "هر امکانی که فناوری به ما می‌دهد را به نفع آسایش شما به کار گرفته‌ایم؛ این‌جا فقط اصطلاحات فنی نیست، بلکه مزایای واقعی برای شماست.",
      },
      items: [
        {
          id: "f1", icon: "FileText", tone: "brand", featured: true,
          title: { fa: "پروندهٔ الکترونیک سلامت", en: "Electronic health records" },
          description: { fa: "تمام سوابق پزشکی شما — ویزیت‌ها، آزمایش‌ها، نسخه‌ها و نسخه‌ها — در یک پروندهٔ امن، همیشه و همه‌جا در دسترس.", en: "All your medical history — visits, labs, prescriptions — in one secure record, accessible anywhere, anytime." },
          benefits: [
            { fa: "دسترسی ۲۴/۷ از هر دستگاهی", en: "24/7 access from any device" },
            { fa: "همگام‌سازی خودکار با کلینیک", en: "Auto-syncs with the clinic" },
            { fa: "اشتراک‌گذاری امن با پزشکان", en: "Securely share with doctors" },
          ],
        },
        { id: "f2", icon: "ReceiptText", tone: "success", title: { fa: "نسخهٔ دیجیتال", en: "E-prescriptions" }, description: { fa: "نسخهٔ پزشک بلافاصله روی گوشی شما، بدون کاغذ و اتلاف وقت.", en: "Prescriptions on your phone instantly — no paper, no waiting." } },
        { id: "f3", icon: "CalendarCheck2", tone: "brand", title: { fa: "رزرو آنلاین هوشمند", en: "Smart online booking" }, description: { fa: "در چند ثانیه و بدون تماس تلفنی نوبت بگیرید.", en: "Book in seconds, no phone call needed." } },
        { id: "f4", icon: "CreditCard", tone: "info", title: { fa: "پرداخت آنلاین", en: "Online payment" }, description: { fa: "پرداخت امن و سریع، قبل یا بعد از ویزیت.", en: "Secure payment before or after your visit." } },
        { id: "f5", icon: "Zap", tone: "gold", title: { fa: "پذیرش سریع", en: "Fast admission" }, description: { fa: "فرآیند پذیرش در چند دقیقه، بدون صف و کاغذبازی.", en: "Admission in minutes — no queues, no paperwork." } },
        { id: "f6", icon: "ListOrdered", tone: "brand", title: { fa: "صف انتظار هوشمند", en: "Smart queue" }, description: { fa: "نوبت خود را زنده ببینید و سر وقت در کلینیک حاضر شوید.", en: "See your turn live and arrive just in time." } },
        { id: "f7", icon: "BellRing", tone: "info", title: { fa: "یادآوری نوبت", en: "Appointment reminders" }, description: { fa: "پیامک و اعلان هوشمند تا هیچ نوبتی فراموش نشود.", en: "Smart SMS & push so you never miss an appointment." } },
        { id: "f8", icon: "History", tone: "success", colSpan: 2, title: { fa: "سوابق درمان", en: "Treatment history" }, description: { fa: "همهٔ ویزیت‌ها، آزمایش‌ها و نسخه‌ها در یک جا.", en: "All visits, tests and prescriptions in one place." } },
      ],
    },

    process: {
      eyebrow: { fa: "فرآیند دریافت نوبت", en: "How it works" },
      title: { fa: "رزرو نوبت در شش گام ساده", en: "Booking in six simple steps" },
      description: {
        fa: "از انتخاب پزشک تا مشاهدهٔ سوابق درمان؛ مسیری شفاف و بدون پیچیدگی.",
      },
      steps: [
        { id: "p1", icon: "UserSearch", title: { fa: "انتخاب پزشک", en: "Choose a doctor" }, description: { fa: "از میان متخصصان، پزشک مناسب خود را انتخاب کنید.", en: "Pick the right specialist for you." } },
        { id: "p2", icon: "Clock", title: { fa: "انتخاب زمان", en: "Pick a time" }, description: { fa: "زمان آزاد مناسب با برنامهٔ خود را رزرو کنید.", en: "Reserve a free slot that suits you." } },
        { id: "p3", icon: "CheckCircle2", title: { fa: "ثبت نهایی", en: "Confirm" }, description: { fa: "نوبت شما با یک کلیک ثبت و تأیید می‌شود.", en: "Confirmed with a single click." } },
        { id: "p4", icon: "Hospital", title: { fa: "مراجعه", en: "Visit" }, description: { fa: "سر وقت در کلینیک حاضر شوید، بدون انتظار.", en: "Arrive on time — no waiting." } },
        { id: "p5", icon: "FileText", title: { fa: "دریافت نسخه", en: "Get prescription" }, description: { fa: "نسخهٔ الکترونیک بلافاصله در دسترس شماست.", en: "Your e-prescription is instantly available." } },
        { id: "p6", icon: "History", title: { fa: "مشاهدهٔ سوابق", en: "Track history" }, description: { fa: "همهٔ سوابق درمانی در پروندهٔ شما ثبت می‌شود.", en: "Everything is saved to your record." } },
      ],
    },

    amenities: {
      eyebrow: { fa: "امکانات رفاهی", en: "Comfort & amenities" },
      title: { fa: "آرامش از لحظهٔ ورود تا لحظهٔ ترک", en: "Comfort from arrival to departure" },
      description: {
        fa: "هر جزئیات محیط برای راحتی شما طراحی شده است.",
      },
      items: [
        { id: "am1", icon: "Car", title: { fa: "پارکینگ اختصاصی", en: "Dedicated parking" }, description: { fa: "پارکینگ امن و رایگان برای مراجعین.", en: "Free, secure parking for visitors." } },
        { id: "am2", icon: "Accessibility", title: { fa: "دسترسی مناسب", en: "Accessibility" }, description: { fa: "ساختار مناسب برای افراد کم‌توان جسمی و سالمندان.", en: "Wheelchair & senior-friendly access." } },
        { id: "am3", icon: "Sofa", title: { fa: "اتاق انتظار مدرن", en: "Modern waiting lounge" }, description: { fa: "فضایی آرام و راحت برای همراهان.", en: "A calm, comfortable lounge for companions." } },
        { id: "am4", icon: "Wifi", title: { fa: "اینترنت رایگان", en: "Free Wi-Fi" }, description: { fa: "اینترنت پرسرعت رایگان در سراسر کلینیک.", en: "Free high-speed Wi-Fi throughout." } },
        { id: "am5", icon: "Pill", title: { fa: "داروخانه", en: "Pharmacy" }, description: { fa: "داروخانه مجهز در محل برای راحتی شما.", en: "On-site pharmacy for your convenience." } },
        { id: "am6", icon: "ArrowUpDown", title: { fa: "آسانسور و راه‌پله", en: "Elevators" }, description: { fa: "دسترسی آسان به همهٔ طبقات.", en: "Easy access to all floors." } },
      ],
    },

    testimonials: {
      eyebrow: { fa: "نظرات بیماران", en: "Patient stories" },
      title: { fa: "تجربه‌هایی که اعتماد می‌سازند", en: "Experiences that build trust" },
      description: {
        fa: "صدای واقعی بیمارانی که سلامت خود را به ما سپردند.",
      },
      items: [
        { id: "t1", name: { fa: "مریم حسینی" }, age: { fa: "۳۴ ساله", en: "34" }, specialty: { fa: "قلب و عروق", en: "Cardiology" }, date: { fa: "فروردین ۱۴۰۴", en: "Apr 2025" }, verified: true, rating: 5, quote: { fa: "از لحظهٔ ورود تا خروج، همه‌چیز بی‌نقص بود. پزشک با حوصله گوش داد و هیچ صفی ندیدم.", en: "Flawless from arrival to departure. The doctor listened patiently and there was no queue." } },
        { id: "t2", name: { fa: "امیر رستگار" }, age: { fa: "۴۱ ساله", en: "41" }, role: { fa: "بیمار قلب" }, specialty: { fa: "قلب و عروق", en: "Cardiology" }, date: { fa: "اسفند ۱۴۰۳", en: "Mar 2025" }, verified: true, rating: 5, quote: { fa: "رزرو آنلاین فوق‌العاده سریع بود و یادآوری پیامکی فراموشم نشد. تجربه‌ای کاملاً متفاوت.", en: "Online booking was super fast and the SMS reminder meant I never forgot. A totally different experience." } },
        { id: "t3", name: { fa: "زهرا کاظمی" }, age: { fa: "۲۹ ساله", en: "29" }, specialty: { fa: "پوست و زیبایی", en: "Dermatology" }, date: { fa: "بهمن ۱۴۰۳", en: "Feb 2025" }, verified: true, rating: 4.9, quote: { fa: "محیط تمیز و مدرن، پرسنل مهربان و حرفه‌ای. آرامشی که حس می‌کنید بی‌نظیر است.", en: "Clean modern space, kind professional staff. The calm you feel is unmatched." } },
        { id: "t4", name: { fa: "محمد تقی‌پور" }, age: { fa: "۳۸ ساله", en: "38" }, role: { fa: "پدر بیمار کودک" }, specialty: { fa: "اطفال", en: "Pediatrics" }, date: { fa: "دی ۱۴۰۳", en: "Jan 2025" }, verified: true, rating: 5, quote: { fa: "برای فرزندم نوبت گرفتم؛ پزشک کودکان فوق‌العاده صبور و دلسوز بود. ممنونم.", en: "Booked for my child; the pediatrician was incredibly patient and caring." } },
      ],
    },

    faq: {
      eyebrow: { fa: "سوالات متداول", en: "FAQ" },
      title: { fa: "پاسخ به پرسش‌های پرتکرار شما", en: "Answers to your common questions" },
      items: [
        { id: "q1", question: { fa: "چگونه نوبت رزرو کنم؟" }, answer: { fa: "از طریق دکمهٔ «رزرو آنلاین نوبت» در سایت، پزشک و زمان دلخواه را انتخاب کرده و در چند دقیقه نوبت بگیرید. امکان رزرو تلفنی نیز وجود دارد." } },
        { id: "q2", question: { fa: "آیا بیمهٔ من پذیرفته می‌شود؟" }, answer: { fa: "بله، ما با بیش از ۳۰ بیمهٔ پایه و تکمیلی طرف قراردادیم. فهرست کامل بیمه‌ها در بخش تماس قابل مشاهده است." } },
        { id: "q3", question: { fa: "نتایج آزمایش را چگونه دریافت کنم؟" }, answer: { fa: "نتایج آزمایش و تصویربرداری به‌صورت آنلاین در پروندهٔ الکترونیک شما قرار می‌گیرد و از طریق پیامک اطلاع‌رسانی می‌شود." } },
        { id: "q4", question: { fa: "اگر نوبت را لغو کنم چه می‌شود؟" }, answer: { fa: "شما می‌توانید نوبت خود را تا ۴ ساعت قبل از زمان ویزیت به‌صورت آنلاین لغو یا تغییر دهید، بدون هیچ هزینه‌ای." } },
        { id: "q5", question: { fa: "آیا امکان ویزیت آنلاین وجود دارد؟" }, answer: { fa: "بله، برای برخی تخصص‌ها مشاورهٔ آنلاین (تله‌مدیسین) فعال است که هنگام رزرو قابل انتخاب است." } },
        { id: "q6", question: { fa: "ساعات کاری کلینیک چیست؟" }, answer: { fa: "شنبه تا چهارشنبه ۸ تا ۲۱، پنجشنبه ۸ تا ۱۸ و خدمات اورژانس در شعبهٔ مرکزی به‌صورت شبانه‌روزی ارائه می‌شود." } },
      ],
    },

    articles: {
      eyebrow: { fa: "مقالات پزشکی", en: "Health articles" },
      title: { fa: "دانش سلامت، با زبانی ساده", en: "Health knowledge, simply explained" },
      description: {
        fa: "آخرین مطالب آموزشی و راهنمایی‌های کاربردی برای سبک زندگی سالم‌تر.",
      },
      items: [
        {
          id: "ar1", slug: "heart-health",
          title: { fa: "۷ عادت ساده برای سلامت قلب", en: "7 simple habits for a healthy heart" },
          excerpt: { fa: "تغییرات کوچک در سبک زندگی چطور می‌توانند خطر بیماری‌های قلبی را کاهش دهند." },
          category: { fa: "قلب و عروق", en: "Cardiology" },
          imageUrl: LOCAL_IMG("۷ عادت ساده برای سلامت قلب.png"),
          readingTime: 5,
          publishedAt: "2025-03-12",
          href: "/articles/heart-health",
        },
        {
          id: "ar2", slug: "child-nutrition",
          title: { fa: "تغذیهٔ سالم کودکان؛ راهنمای والدین", en: "Healthy child nutrition: a parent's guide" },
          excerpt: { fa: "اصول تغذیهٔ متعادل برای رشد سالم کودکان در سنین مختلف." },
          category: { fa: "اطفال", en: "Pediatrics" },
          imageUrl: LOCAL_IMG("تغذیه سالم کودکا.webp"),
          readingTime: 6,
          publishedAt: "2025-02-28",
          href: "/articles/child-nutrition",
        },
        {
          id: "ar3", slug: "skin-care-summer",
          title: { fa: "مراقبت از پوست در تابستان", en: "Summer skincare essentials" },
          excerpt: { fa: "چگونه از پوست خود در برابر آفتاب و گرما محافظت کنیم." },
          category: { fa: "پوست", en: "Dermatology" },
          imageUrl: LOCAL_IMG("مراقبت از پوست در تابستان.webp"),
          readingTime: 4,
          publishedAt: "2025-02-10",
          href: "/articles/skin-care-summer",
        },
      ],
    },

    finalCta: {
      eyebrow: { fa: "همین حالا شروع کنید", en: "Get started" },
      title: { fa: "اولین قدم به سوی سلامتی را همین امروز بردارید", en: "Take your first step toward health today" },
      description: {
        fa: "تیم ما آماده است تا با مراقبتی حرفه‌ای و انسان‌محور، همراه سلامتی شما باشد.",
      },
      primaryCta: { label: { fa: "رزرو آنلاین نوبت", en: "Book now" }, href: "/booking", icon: "CalendarCheck" },
      secondaryCta: { label: { fa: "تماس با ما", en: "Contact us" }, href: "tel:02191002030", icon: "PhoneCall" },
    },
  };
}
