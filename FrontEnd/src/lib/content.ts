/**
 * ============================================================================
 * CLINICK — STATIC CONTENT (services / articles / insurance) — spec §9, §10, §12
 * ============================================================================
 * Typed fallback content for the clinic content sections. The backend doesn't
 * expose these collections yet; this mirrors the CMS-shaped pattern in
 * `lib/marketing/*` so swapping to a real endpoint is a one-line resolver
 * change. All copy is Persian (RTL primary).
 * ============================================================================
 */

export interface Service {
  slug: string;
  title: string;
  description: string;
  durationMinutes: number;
  iconName: string; // lucide name via the marketing Icon registry
}

export interface Article {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  readingMinutes: number;
}

export interface InsurancePartner {
  name: string;
  coverageNote: string;
}

export const SERVICES: Service[] = [
  {
    slug: "general-consultation",
    title: "ویزیت عمومی",
    description: "معاینه و مشاورهٔ اولیه برای تشخیص و مسیر درمان.",
    durationMinutes: 15,
    iconName: "Stethoscope",
  },
  {
    slug: "cardiology",
    title: "قلب و عروق",
    description: "نوار قلب، اکو و مشاورهٔ تخصصی قلب.",
    durationMinutes: 30,
    iconName: "HeartPulse",
  },
  {
    slug: "dermatology",
    title: "پوست و مو",
    description: "درمان جوش، اگزما و مراقبت‌های زیبایی پوست.",
    durationMinutes: 15,
    iconName: "Smile",
  },
  {
    slug: "pediatrics",
    title: "اطفال",
    description: "ویزیت و واکسیناسیون نوزادان و کودکان.",
    durationMinutes: 20,
    iconName: "Baby",
  },
  {
    slug: "lab",
    title: "آزمایشگاه",
    description: "تست‌های تشخیصی با نتیجهٔ سریع و قابل اعتماد.",
    durationMinutes: 10,
    iconName: "TestTube2",
  },
  {
    slug: "pharmacy",
    title: "داروخانه",
    description: "تأمین دارو و مشاورهٔ مصرف دارویی.",
    durationMinutes: 5,
    iconName: "Pill",
  },
];

export const ARTICLES: Article[] = [
  {
    slug: "healthy-heart",
    title: "۷ راه برای حفظ سلامت قلب",
    excerpt: "تغذیه، فعالیت و خواب کافی چگونه ریسک قلبی را کاهش می‌دهند.",
    category: "قلب و عروق",
    readingMinutes: 5,
  },
  {
    slug: "skin-care-winter",
    title: "مراقبت از پوست در زمستان",
    excerpt: "روتین ساده برای جلوگیری از خشکی و التهاب پوست سرد.",
    category: "پوست و مو",
    readingMinutes: 4,
  },
  {
    slug: "child-vaccination",
    title: "راهنمای واکسیناسیون کودکان",
    excerpt: "جدول زمانی واکسن‌ها و نکاتی برای والدین.",
    category: "اطفال",
    readingMinutes: 6,
  },
];

export const INSURANCE_PARTNERS: InsurancePartner[] = [
  { name: "بیمه سلامت ایران", coverageNote: "پوشش کامل ویزیت" },
  { name: "بیمه تامین اجتماعی", coverageNote: "تا ۷۰٪ هزینه" },
  { name: "بیمه پاسارگاد", coverageNote: "پوشش پایه" },
  { name: "بیمه ملت", coverageNote: "پوشش پایه" },
  { name: "بیمه آرمان", coverageNote: "تا ۶۰٪ هزینه" },
  { name: "نیروهای مسلح", coverageNote: "پوشش کامل" },
];

export function findService(slug: string): Service | undefined {
  return SERVICES.find((s) => s.slug === slug);
}

export function findArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}
