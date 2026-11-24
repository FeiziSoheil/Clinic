// Package article implements the enterprise CMS article domain.
//
// Content body is stored as ProseMirror JSON (bson.M) — never HTML as the
// primary source of truth. Status lifecycle mirrors the frontend CMS model.
package article

import (
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Status is the editorial lifecycle of an article.
type Status string

const (
	StatusDraft     Status = "DRAFT"
	StatusPublished Status = "PUBLISHED"
	StatusScheduled Status = "SCHEDULED"
	StatusArchived  Status = "ARCHIVED"
	StatusPrivate   Status = "PRIVATE"
	StatusPreview   Status = "PREVIEW"
	StatusRevision  Status = "REVISION"
)

// Author is a denormalized author card embedded on the article.
type Author struct {
	ID        string `bson:"id" json:"id"`
	Name      string `bson:"name" json:"name"`
	AvatarURL string `bson:"avatar_url,omitempty" json:"avatar_url,omitempty"`
	Bio       string `bson:"bio,omitempty" json:"bio,omitempty"`
}

// CoverImage is the hero media for an article card / OG image.
type CoverImage struct {
	URL         string `bson:"url" json:"url"`
	Alt         string `bson:"alt" json:"alt"`
	Width       int    `bson:"width,omitempty" json:"width,omitempty"`
	Height      int    `bson:"height,omitempty" json:"height,omitempty"`
	BlurDataURL string `bson:"blur_data_url,omitempty" json:"blur_data_url,omitempty"`
	Caption     string `bson:"caption,omitempty" json:"caption,omitempty"`
}

// SEO holds search / social metadata (separate from body JSON).
type SEO struct {
	MetaTitle       string   `bson:"meta_title,omitempty" json:"meta_title,omitempty"`
	MetaDescription string   `bson:"meta_description,omitempty" json:"meta_description,omitempty"`
	CanonicalURL    string   `bson:"canonical_url,omitempty" json:"canonical_url,omitempty"`
	OGImage         string   `bson:"og_image,omitempty" json:"og_image,omitempty"`
	Keywords        []string `bson:"keywords,omitempty" json:"keywords,omitempty"`
	Robots          string   `bson:"robots,omitempty" json:"robots,omitempty"`
	TwitterCard     string   `bson:"twitter_card,omitempty" json:"twitter_card,omitempty"`
}

// Article is one CMS article document.
// Content is ProseMirror JSON (typically { "type": "doc", "content": [...] }).
type Article struct {
	ID             primitive.ObjectID `bson:"_id" json:"id"`
	Title          string             `bson:"title" json:"title"`
	Slug           string             `bson:"slug" json:"slug"`
	Excerpt        string             `bson:"excerpt" json:"excerpt"`
	CoverImage     *CoverImage        `bson:"cover_image,omitempty" json:"cover_image,omitempty"`
	Category       string             `bson:"category" json:"category"`
	Tags           []string           `bson:"tags" json:"tags"`
	Author         Author             `bson:"author" json:"author"`
	Status         Status             `bson:"status" json:"status"`
	SEO            SEO                `bson:"seo" json:"seo"`
	Content        bson.M             `bson:"content" json:"content"`
	ReadingMinutes int                `bson:"reading_minutes" json:"reading_minutes"`
	PublishedAt    *time.Time         `bson:"published_at,omitempty" json:"published_at,omitempty"`
	ScheduledAt    *time.Time         `bson:"scheduled_at,omitempty" json:"scheduled_at,omitempty"`
	CreatedAt      time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt      time.Time          `bson:"updated_at" json:"updated_at"`
}

// CreateArticleRequest is the admin create/update payload.
type CreateArticleRequest struct {
	Title       string      `json:"title" validate:"required,min=2,max=200"`
	Slug        string      `json:"slug" validate:"required,min=2,max=200"`
	Excerpt     string      `json:"excerpt" validate:"max=500"`
	CoverImage  *CoverImage `json:"cover_image"`
	Category    string      `json:"category" validate:"required,min=1,max=100"`
	Tags        []string    `json:"tags"`
	Author      *Author     `json:"author"`
	Status      string      `json:"status" validate:"omitempty,oneof=DRAFT PUBLISHED SCHEDULED ARCHIVED PRIVATE PREVIEW REVISION"`
	SEO         *SEO        `json:"seo"`
	Content     bson.M      `json:"content" validate:"required"`
	PublishedAt *time.Time  `json:"published_at"`
	ScheduledAt *time.Time  `json:"scheduled_at"`
}

// ArticleResponse is the API DTO (hex id).
type ArticleResponse struct {
	ID             string      `json:"id"`
	Title          string      `json:"title"`
	Slug           string      `json:"slug"`
	Excerpt        string      `json:"excerpt"`
	CoverImage     *CoverImage `json:"cover_image,omitempty"`
	Category       string      `json:"category"`
	Tags           []string    `json:"tags"`
	Author         Author      `json:"author"`
	Status         string      `json:"status"`
	SEO            SEO         `json:"seo"`
	Content        bson.M      `json:"content"`
	ReadingMinutes int         `json:"reading_minutes"`
	PublishedAt    *time.Time  `json:"published_at,omitempty"`
	ScheduledAt    *time.Time  `json:"scheduled_at,omitempty"`
	CreatedAt      time.Time   `json:"created_at"`
	UpdatedAt      time.Time   `json:"updated_at"`
}

// ArticleSummary is a list-row DTO without the full content tree.
type ArticleSummary struct {
	ID             string     `json:"id"`
	Title          string     `json:"title"`
	Slug           string     `json:"slug"`
	Excerpt        string     `json:"excerpt"`
	Category       string     `json:"category"`
	Tags           []string   `json:"tags"`
	Status         string     `json:"status"`
	CoverImageURL  string     `json:"cover_image_url,omitempty"`
	AuthorName     string     `json:"author_name"`
	ReadingMinutes int        `json:"reading_minutes"`
	PublishedAt    *time.Time `json:"published_at,omitempty"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

// ListResponse wraps paginated summaries.
type ListResponse struct {
	Items    []*ArticleSummary `json:"items"`
	Total    int               `json:"total"`
	Page     int               `json:"page"`
	PageSize int               `json:"page_size"`
}

// ToResponse maps the entity to the wire DTO.
func (a *Article) ToResponse() *ArticleResponse {
	if a == nil {
		return nil
	}
	return &ArticleResponse{
		ID:             a.ID.Hex(),
		Title:          a.Title,
		Slug:           a.Slug,
		Excerpt:        a.Excerpt,
		CoverImage:     a.CoverImage,
		Category:       a.Category,
		Tags:           a.Tags,
		Author:         a.Author,
		Status:         string(a.Status),
		SEO:            a.SEO,
		Content:        a.Content,
		ReadingMinutes: a.ReadingMinutes,
		PublishedAt:    a.PublishedAt,
		ScheduledAt:    a.ScheduledAt,
		CreatedAt:      a.CreatedAt,
		UpdatedAt:      a.UpdatedAt,
	}
}

// ToSummary maps the entity to a list row.
func (a *Article) ToSummary() *ArticleSummary {
	if a == nil {
		return nil
	}
	cover := ""
	if a.CoverImage != nil {
		cover = a.CoverImage.URL
	}
	return &ArticleSummary{
		ID:             a.ID.Hex(),
		Title:          a.Title,
		Slug:           a.Slug,
		Excerpt:        a.Excerpt,
		Category:       a.Category,
		Tags:           a.Tags,
		Status:         string(a.Status),
		CoverImageURL:  cover,
		AuthorName:     a.Author.Name,
		ReadingMinutes: a.ReadingMinutes,
		PublishedAt:    a.PublishedAt,
		UpdatedAt:      a.UpdatedAt,
	}
}
