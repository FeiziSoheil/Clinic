package article

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"clinic-api/pkg/database"
	"clinic-api/pkg/logger"
)

type seedSpec struct {
	slug        string
	title       string
	excerpt     string
	category    string
	tags        []string
	coverURL    string
	publishedAt time.Time
	content     bson.M
}

func pmText(value string) bson.M {
	return bson.M{"type": "text", "text": value}
}

func pmParagraph(parts ...string) bson.M {
	content := make([]bson.M, 0, len(parts))
	for _, p := range parts {
		content = append(content, pmText(p))
	}
	return bson.M{"type": "paragraph", "content": content}
}

func pmHeading(level int, value, id string) bson.M {
	return bson.M{
		"type":    "heading",
		"attrs":   bson.M{"level": level, "id": id},
		"content": []bson.M{pmText(value)},
	}
}

func pmDoc(nodes ...bson.M) bson.M {
	return bson.M{"type": "doc", "content": nodes}
}

func demoArticleSpecs() []seedSpec {
	return []seedSpec{
		{
			slug:     "heart-health",
			title:    "۷ عادت ساده برای سلامت قلب",
			excerpt:  "تغییرات کوچک در سبک زندگی چطور می‌توانند خطر بیماری‌های قلبی را کاهش دهند.",
			category: "قلب و عروق",
			tags:     []string{"قلب", "سبک زندگی", "پیشگیری"},
			coverURL: "/Images/۷ عادت ساده برای سلامت قلب.png",
			publishedAt: time.Date(2025, 3, 12, 10, 0, 0, 0, time.UTC),
			content: pmDoc(
				pmHeading(2, "چرا سلامت قلب مهم است؟", "why-heart"),
				pmParagraph("بیماری‌های قلبی-عروقی یکی از شایع‌ترین علل مرگ‌ومیر در جهان هستند. خبر خوب این است که بسیاری از عوامل خطر با عادت‌های روزانه قابل کنترل‌اند."),
				pmHeading(2, "۷ عادت ساده", "seven-habits"),
				pmParagraph("مصرف بیشتر سبزیجات، کاهش نمک، فعالیت بدنی منظم، خواب کافی، ترک دخانیات، مدیریت استرس و معاینات دوره‌ای قلب از مهم‌ترین گام‌ها هستند."),
			),
		},
		{
			slug:     "child-nutrition",
			title:    "تغذیهٔ سالم کودکان؛ راهنمای والدین",
			excerpt:  "اصول تغذیهٔ متعادل برای رشد سالم کودکان در سنین مختلف.",
			category: "اطفال",
			tags:     []string{"اطفال", "تغذیه", "والدین"},
			coverURL: "/Images/تغذیه سالم کودکا.webp",
			publishedAt: time.Date(2025, 2, 28, 10, 0, 0, 0, time.UTC),
			content: pmDoc(
				pmHeading(2, "اصول تغذیه متعادل کودکان", "balanced-nutrition"),
				pmParagraph("رشد سالم کودکان به ترکیب مناسب پروتئین، کربوهیدرات، چربی‌های مفید، ویتامین‌ها و مواد معدنی وابسته است."),
				pmHeading(2, "اشتباهات رایج والدین", "common-mistakes"),
				pmParagraph("جایگزین کردن وعده با تنقلات شیرین، اجبار به خوردن کامل بشقاب و کمبود منابع آهن و کلسیم از اشتباهات رایج هستند."),
			),
		},
		{
			slug:     "skin-care-summer",
			title:    "مراقبت از پوست در تابستان",
			excerpt:  "چگونه از پوست خود در برابر آفتاب و گرما محافظت کنیم.",
			category: "پوست",
			tags:     []string{"پوست", "آفتاب", "تابستان"},
			coverURL: "/Images/مراقبت از پوست در تابستان.webp",
			publishedAt: time.Date(2025, 2, 10, 10, 0, 0, 0, time.UTC),
			content: pmDoc(
				pmHeading(2, "حفاظت در برابر آفتاب", "sun-protection"),
				pmParagraph("اشعه UV در تابستان شدیدتر است. ضدآفتاب با SPF مناسب، لباس محافظ و اجتناب از ساعات اوج آفتاب ضروری‌اند."),
				pmHeading(2, "روتین ساده تابستانی", "summer-routine"),
				pmParagraph("پاکسازی ملایم صبح و شب، مرطوب‌کننده سبک و ضدآفتاب روزانه پایهٔ مراقبت تابستانی پوست هستند."),
			),
		},
	}
}

// SeedDemoArticles inserts the marketing demo articles when their slugs are absent.
// The seeder is idempotent and safe to run on every boot.
func SeedDemoArticles(ctx context.Context, repo *database.Repository[Article]) (int, error) {
	inserted := 0
	author := defaultAuthor()
	now := time.Now().UTC()

	for _, spec := range demoArticleSpecs() {
		existing, err := repo.FindOne(ctx, bson.M{"slug": spec.slug})
		if err == nil && existing != nil {
			continue
		}
		if err != nil && !errors.Is(err, database.ErrNotFound) {
			return inserted, err
		}

		publishedAt := spec.publishedAt
		doc := Article{
			ID:      primitive.NewObjectID(),
			Title:   spec.title,
			Slug:    spec.slug,
			Excerpt: spec.excerpt,
			CoverImage: &CoverImage{
				URL: spec.coverURL,
				Alt: spec.title,
			},
			Category:       spec.category,
			Tags:           spec.tags,
			Author:         author,
			Status:         StatusPublished,
			SEO:            SEO{Robots: "index,follow", TwitterCard: "summary_large_image", MetaTitle: spec.title, MetaDescription: spec.excerpt, Keywords: spec.tags},
			Content:        spec.content,
			ReadingMinutes: estimateReadingMinutes(spec.content),
			PublishedAt:    &publishedAt,
			CreatedAt:      now,
			UpdatedAt:      now,
		}

		if _, err := repo.Insert(ctx, doc); err != nil {
			return inserted, err
		}
		inserted++
		logger.Get().Info("seeder: demo article created", "slug", spec.slug, "id", doc.ID.Hex())
	}

	if inserted > 0 {
		logger.Get().Info("seeder: demo articles seed complete", "count", inserted)
	}
	return inserted, nil
}
