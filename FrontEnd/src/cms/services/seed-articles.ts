import type { PMDocument, PMNode } from "../types/document";

function text(value: string): PMNode {
  return { type: "text", text: value };
}

function paragraph(...parts: string[]): PMNode {
  return {
    type: "paragraph",
    content: parts.length ? parts.map(text) : undefined,
  };
}

function heading(level: number, value: string, id: string): PMNode {
  return {
    type: "heading",
    attrs: { level, id },
    content: [text(value)],
  };
}

function callout(
  variant: "info" | "warning" | "success" | "danger",
  title: string,
  body: string,
): PMNode {
  return {
    type: "callout",
    attrs: { variant, title },
    content: [paragraph(body)],
  };
}

/** Seed documents aligned with marketing article teasers. */
export const SEED_DOCUMENTS: Record<string, PMDocument> = {
  "heart-health": {
    type: "doc",
    content: [
      heading(2, "چرا سلامت قلب مهم است؟", "why-heart"),
      paragraph(
        "بیماری‌های قلبی-عروقی یکی از شایع‌ترین علل مرگ‌ومیر در جهان هستند. خبر خوب این است که بسیاری از عوامل خطر با عادت‌های روزانه قابل کنترل‌اند.",
      ),
      callout(
        "info",
        "نکته کلیدی",
        "حتی ۳۰ دقیقه پیاده‌روی در روز می‌تواند فشار خون و کلسترول را بهبود دهد.",
      ),
      heading(2, "۷ عادت ساده", "seven-habits"),
      {
        type: "orderedList",
        content: [
          {
            type: "listItem",
            content: [paragraph("مصرف بیشتر سبزیجات و فیبر")],
          },
          {
            type: "listItem",
            content: [paragraph("کاهش نمک و غذاهای فرآوری‌شده")],
          },
          {
            type: "listItem",
            content: [paragraph("فعالیت بدنی منظم")],
          },
          {
            type: "listItem",
            content: [paragraph("خواب کافی و باکیفیت")],
          },
          {
            type: "listItem",
            content: [paragraph("ترک دخانیات")],
          },
          {
            type: "listItem",
            content: [paragraph("مدیریت استرس")],
          },
          {
            type: "listItem",
            content: [paragraph("معاینات دوره‌ای قلب")],
          },
        ],
      },
      {
        type: "quoteCard",
        attrs: {
          quote: "قلب سالم، نتیجهٔ انتخاب‌های کوچک اما مداوم است.",
          author: "تیم قلب و عروق کلینیک",
          role: "متخصصان قلب",
        },
      },
      heading(2, "چه زمانی به پزشک مراجعه کنیم؟", "when-to-see-doctor"),
      paragraph(
        "درد قفسه سینه، تنگی نفس ناگهانی، تپش قلب شدید یا خستگی غیرعادی را جدی بگیرید و فوراً ارزیابی پزشکی انجام دهید.",
      ),
      {
        type: "buttonBlock",
        attrs: {
          label: "رزرو نوبت قلب و عروق",
          href: "/booking",
          variant: "primary",
        },
      },
    ],
  },
  "child-nutrition": {
    type: "doc",
    content: [
      heading(2, "اصول تغذیه متعادل کودکان", "balanced-nutrition"),
      paragraph(
        "رشد سالم کودکان به ترکیب مناسب پروتئین، کربوهیدرات، چربی‌های مفید، ویتامین‌ها و مواد معدنی وابسته است.",
      ),
      callout(
        "success",
        "پیشنهاد عملی",
        "بشقاب رنگارنگ بسازید: نصف سبزیجات، یک‌چهارم پروتئین، یک‌چهارم غلات کامل.",
      ),
      heading(2, "اشتباهات رایج والدین", "common-mistakes"),
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [paragraph("جایگزین کردن وعده با تنقلات شیرین")],
          },
          {
            type: "listItem",
            content: [paragraph("اجبار به خوردن کامل بشقاب")],
          },
          {
            type: "listItem",
            content: [paragraph("کمبود منابع آهن و کلسیم")],
          },
        ],
      },
      {
        type: "accordionBlock",
        attrs: {
          items: [
            {
              id: "a1",
              title: "کودک بدغذا است؛ چه کنیم؟",
              content:
                "تنوع را حفظ کنید، فشار نیاورید، و وعده‌های منظم با میان‌وعده‌های سالم ارائه دهید.",
            },
            {
              id: "a2",
              title: "مکمل لازم است؟",
              content:
                "در صورت کمبود اثبات‌شده با آزمایش، پزشک ممکن است مکمل تجویز کند؛ خودسرانه شروع نکنید.",
            },
          ],
        },
      },
    ],
  },
  "skin-care-summer": {
    type: "doc",
    content: [
      heading(2, "حفاظت در برابر آفتاب", "sun-protection"),
      paragraph(
        "اشعه UV در تابستان شدیدتر است. ضدآفتاب با SPF مناسب، لباس محافظ و اجتناب از ساعات اوج آفتاب ضروری‌اند.",
      ),
      callout(
        "warning",
        "هشدار",
        "ضدآفتاب را هر دو ساعت یک‌بار تمدید کنید، به‌ویژه بعد از شنا یا تعریق.",
      ),
      heading(2, "روتین ساده تابستانی", "summer-routine"),
      {
        type: "taskList",
        content: [
          {
            type: "taskItem",
            attrs: { checked: false },
            content: [paragraph("پاکسازی ملایم صبح و شب")],
          },
          {
            type: "taskItem",
            attrs: { checked: false },
            content: [paragraph("مرطوب‌کننده سبک")],
          },
          {
            type: "taskItem",
            attrs: { checked: false },
            content: [paragraph("ضدآفتاب روزانه")],
          },
        ],
      },
      {
        type: "dividerBlock",
        attrs: { style: "brand" },
      },
      paragraph(
        "در صورت سوختگی، تاول یا تغییرات مشکوک پوستی، به متخصص پوست مراجعه کنید.",
      ),
    ],
  },
};
