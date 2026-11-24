package article

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"

	"clinic-api/internal/user"
	"clinic-api/pkg/database"
)

var (
	ErrNotFound        = errors.New("article: not found")
	ErrForbidden       = errors.New("article: forbidden")
	ErrInvalidObjectID = errors.New("article: invalid object id")
	ErrInvalidStatus   = errors.New("article: invalid status")
	ErrEmptyTitle      = errors.New("article: title is required")
	ErrEmptySlug       = errors.New("article: slug is required")
	ErrEmptyContent    = errors.New("article: content is required")
	ErrSlugTaken       = errors.New("article: slug already exists")
)

// Service owns article CMS business rules.
type Service struct {
	repo *database.Repository[Article]
}

// NewService constructs an article Service.
func NewService(repo *database.Repository[Article]) *Service {
	return &Service{repo: repo}
}

func validStatus(s string) (Status, bool) {
	switch Status(s) {
	case StatusDraft, StatusPublished, StatusScheduled, StatusArchived,
		StatusPrivate, StatusPreview, StatusRevision:
		return Status(s), true
	default:
		return "", false
	}
}

func estimateReadingMinutes(content bson.M) int {
	// Rough heuristic from stringified JSON length (Persian + Latin).
	raw, err := bson.MarshalExtJSON(content, false, false)
	if err != nil || len(raw) == 0 {
		return 1
	}
	// ~200 words/min ≈ ~1000 chars/min for mixed scripts.
	chars := utf8.RuneCount(raw) / 4 // content is JSON-heavy; discount structure
	mins := chars / 1000
	if mins < 1 {
		return 1
	}
	if mins > 60 {
		return 60
	}
	return mins
}

func defaultAuthor() Author {
	return Author{
		ID:   "author-clinic",
		Name: "تیم محتوای کلینیک",
		Bio:  "محتوای آموزشی سلامت به زبان ساده",
	}
}

// Create inserts a new article (admin).
func (s *Service) Create(ctx context.Context, role string, req *CreateArticleRequest) (*ArticleResponse, error) {
	if role != string(user.RoleAdmin) {
		return nil, ErrForbidden
	}
	title := strings.TrimSpace(req.Title)
	slug := strings.TrimSpace(req.Slug)
	if title == "" {
		return nil, ErrEmptyTitle
	}
	if slug == "" {
		return nil, ErrEmptySlug
	}
	if req.Content == nil || len(req.Content) == 0 {
		return nil, ErrEmptyContent
	}

	existing, err := s.repo.FindOne(ctx, bson.M{"slug": slug})
	if err == nil && existing != nil {
		return nil, ErrSlugTaken
	}
	if err != nil && !errors.Is(err, database.ErrNotFound) {
		return nil, err
	}

	status := StatusDraft
	if req.Status != "" {
		st, ok := validStatus(req.Status)
		if !ok {
			return nil, ErrInvalidStatus
		}
		status = st
	}

	now := time.Now().UTC()
	author := defaultAuthor()
	if req.Author != nil && strings.TrimSpace(req.Author.Name) != "" {
		author = *req.Author
	}
	seo := SEO{Robots: "index,follow", TwitterCard: "summary_large_image"}
	if req.SEO != nil {
		seo = *req.SEO
		if seo.Robots == "" {
			seo.Robots = "index,follow"
		}
	}

	var publishedAt *time.Time
	if status == StatusPublished {
		t := now
		if req.PublishedAt != nil {
			t = req.PublishedAt.UTC()
		}
		publishedAt = &t
	}

	doc := Article{
		ID:             primitive.NewObjectID(),
		Title:          title,
		Slug:           slug,
		Excerpt:        strings.TrimSpace(req.Excerpt),
		CoverImage:     req.CoverImage,
		Category:       strings.TrimSpace(req.Category),
		Tags:           req.Tags,
		Author:         author,
		Status:         status,
		SEO:            seo,
		Content:        req.Content,
		ReadingMinutes: estimateReadingMinutes(req.Content),
		PublishedAt:    publishedAt,
		ScheduledAt:    req.ScheduledAt,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if doc.Tags == nil {
		doc.Tags = []string{}
	}

	if _, err := s.repo.Insert(ctx, doc); err != nil {
		return nil, err
	}
	return doc.ToResponse(), nil
}

// Update replaces an article (admin).
func (s *Service) Update(ctx context.Context, role, idHex string, req *CreateArticleRequest) (*ArticleResponse, error) {
	if role != string(user.RoleAdmin) {
		return nil, ErrForbidden
	}
	oid, err := primitive.ObjectIDFromHex(idHex)
	if err != nil {
		return nil, ErrInvalidObjectID
	}
	existing, err := s.repo.FindByID(ctx, oid)
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	title := strings.TrimSpace(req.Title)
	slug := strings.TrimSpace(req.Slug)
	if title == "" {
		return nil, ErrEmptyTitle
	}
	if slug == "" {
		return nil, ErrEmptySlug
	}
	if req.Content == nil || len(req.Content) == 0 {
		return nil, ErrEmptyContent
	}

	if slug != existing.Slug {
		clash, err := s.repo.FindOne(ctx, bson.M{"slug": slug})
		if err == nil && clash != nil && clash.ID != existing.ID {
			return nil, ErrSlugTaken
		}
		if err != nil && !errors.Is(err, database.ErrNotFound) {
			return nil, err
		}
	}

	status := existing.Status
	if req.Status != "" {
		st, ok := validStatus(req.Status)
		if !ok {
			return nil, ErrInvalidStatus
		}
		status = st
	}

	author := existing.Author
	if req.Author != nil && strings.TrimSpace(req.Author.Name) != "" {
		author = *req.Author
	}
	seo := existing.SEO
	if req.SEO != nil {
		seo = *req.SEO
	}

	now := time.Now().UTC()
	publishedAt := existing.PublishedAt
	if status == StatusPublished && publishedAt == nil {
		t := now
		if req.PublishedAt != nil {
			t = req.PublishedAt.UTC()
		}
		publishedAt = &t
	}

	update := bson.M{
		"$set": bson.M{
			"title":           title,
			"slug":            slug,
			"excerpt":         strings.TrimSpace(req.Excerpt),
			"cover_image":     req.CoverImage,
			"category":        strings.TrimSpace(req.Category),
			"tags":            req.Tags,
			"author":          author,
			"status":          status,
			"seo":             seo,
			"content":         req.Content,
			"reading_minutes": estimateReadingMinutes(req.Content),
			"published_at":    publishedAt,
			"scheduled_at":    req.ScheduledAt,
			"updated_at":      now,
		},
	}
	if err := s.repo.Update(ctx, oid, update); err != nil {
		return nil, err
	}
	updated, err := s.repo.FindByID(ctx, oid)
	if err != nil {
		return nil, err
	}
	return updated.ToResponse(), nil
}

// Delete removes an article (admin).
func (s *Service) Delete(ctx context.Context, role, idHex string) error {
	if role != string(user.RoleAdmin) {
		return ErrForbidden
	}
	oid, err := primitive.ObjectIDFromHex(idHex)
	if err != nil {
		return ErrInvalidObjectID
	}
	if err := s.repo.Delete(ctx, oid); err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return ErrNotFound
		}
		return err
	}
	return nil
}

// GetByIDOrSlug returns a full article for admin or public consumers.
func (s *Service) GetByIDOrSlug(ctx context.Context, idOrSlug string, publicOnly bool) (*ArticleResponse, error) {
	var doc *Article
	var err error
	if oid, parseErr := primitive.ObjectIDFromHex(idOrSlug); parseErr == nil {
		doc, err = s.repo.FindByID(ctx, oid)
	} else {
		doc, err = s.repo.FindOne(ctx, bson.M{"slug": idOrSlug})
	}
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if publicOnly && doc.Status != StatusPublished && doc.Status != StatusPreview {
		return nil, ErrNotFound
	}
	return doc.ToResponse(), nil
}

// List returns paginated summaries with optional filters.
func (s *Service) List(ctx context.Context, status, category, q string, page, pageSize int, publicOnly bool) (*ListResponse, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	filter := bson.M{}
	if publicOnly {
		filter["status"] = StatusPublished
	} else if status != "" {
		if _, ok := validStatus(status); !ok {
			return nil, ErrInvalidStatus
		}
		filter["status"] = status
	}
	if category != "" {
		filter["category"] = category
	}
	if q != "" {
		filter["$or"] = []bson.M{
			{"title": bson.M{"$regex": q, "$options": "i"}},
			{"excerpt": bson.M{"$regex": q, "$options": "i"}},
			{"slug": bson.M{"$regex": q, "$options": "i"}},
		}
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "updated_at", Value: -1}}).
		SetSkip(int64((page - 1) * pageSize)).
		SetLimit(int64(pageSize))

	docs, err := s.repo.FindAllWithOpts(ctx, filter, opts)
	if err != nil {
		return nil, err
	}

	// Count without pagination for total.
	all, err := s.repo.FindAll(ctx, filter)
	if err != nil {
		return nil, err
	}

	items := make([]*ArticleSummary, 0, len(docs))
	for _, d := range docs {
		items = append(items, d.ToSummary())
	}
	return &ListResponse{
		Items:    items,
		Total:    len(all),
		Page:     page,
		PageSize: pageSize,
	}, nil
}
