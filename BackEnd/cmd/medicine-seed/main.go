// Package main is the standalone medicine-index seeder.
//
// It builds the minimal subset of the Medicine domain dependency graph needed to
// refresh the local index (config → logger → mongo → repository → rxnorm client
// → search engine → service), runs medicineservice.Service.Seed and prints the
// number of concepts upserted. It reuses the same collaborators and constructor
// signatures as cmd/clinic-api/bootstrap/app.go so the seed path is identical to
// the gated boot-time seed, just driven from a one-shot CLI.
//
// Usage:
//
//	make seed-medicines
//	# or
//	go run cmd/medicine-seed/main.go
//
// Re-running is idempotent: the unique rxcui index makes a re-seed a no-op for
// already-present concepts (see plans/medicine-search-refactor.md §6).
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"clinic-api/internal/medicine/cache"
	medicinerepository "clinic-api/internal/medicine/repository"
	medicinerxnorm "clinic-api/internal/medicine/rxnorm"
	medicinesearch "clinic-api/internal/medicine/search"
	medicineservice "clinic-api/internal/medicine/service"
	"clinic-api/pkg/config"
	"clinic-api/pkg/database"
	"clinic-api/pkg/logger"
)

// seedTimeout bounds the full seed run (fetch + bulk upsert). RxNorm's
// prescribable concept set is ≈10–15k rows, so a generous ceiling keeps a slow
// network from aborting a healthy seed while still guaranteeing termination.
const seedTimeout = 10 * time.Minute

// connectTimeout bounds the initial MongoDB handshake, mirroring the bootstrap
// connect budget.
const connectTimeout = 15 * time.Second

// indexTimeout bounds the best-effort index-creation step that precedes the
// seed so the unique rxcui upsert path is backed by the right index.
const indexTimeout = 30 * time.Second

// main wires the medicine service and runs a single seed, exiting non-zero on
// any failure so it composes correctly in CI/make pipelines.
func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "medicine-seed: load config failed: %v\n", err)
		os.Exit(1)
	}
	logger.Init(cfg.LogLevel, cfg.AppEnv)

	// MongoDB connectivity.
	connectCtx, cancelConnect := context.WithTimeout(context.Background(), connectTimeout)
	defer cancelConnect()
	client, err := database.Connect(connectCtx, cfg.MongoURI)
	if err != nil {
		logger.Get().Error("medicine-seed: mongo connect failed", "error", err)
		os.Exit(1)
	}
	defer func() {
		shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancelShutdown()
		_ = client.Disconnect(shutdownCtx)
	}()

	db := client.Database(cfg.MongoDBName)
	repo := medicinerepository.New(
		db.Collection("medicines"),
		db.Collection("medicine_favorites"),
	)

	// Ensure indexes best-effort so the unique-rxcui upsert idempotency holds.
	// A failure is logged but non-fatal: the seed can still run against an
	// already-indexed collection.
	indexCtx, cancelIndex := context.WithTimeout(context.Background(), indexTimeout)
	defer cancelIndex()
	if err := repo.EnsureIndexes(indexCtx); err != nil {
		logger.Get().Warn("medicine-seed: ensure indexes failed (continuing)", "error", err)
	}

	// Build the medicine service with the same collaborators/flags as the API
	// server. The cache and fallback settings are irrelevant for a one-shot
	// seed but are passed through for constructor consistency.
	engine := medicinesearch.New(repo)
	cch := cache.NewMemoryCache(cfg.MedicineCacheMax)
	rxClient := medicinerxnorm.New(cfg.RxNormBaseURL)
	svc := medicineservice.New(
		repo,
		engine,
		cch,
		rxClient,
		time.Duration(cfg.MedicineCacheTTL)*time.Second,
		cfg.MedicineFallbackToRxNorm,
		logger.Get(),
	)

	seedCtx, cancelSeed := context.WithTimeout(context.Background(), seedTimeout)
	defer cancelSeed()
	count, err := svc.Seed(seedCtx)
	if err != nil {
		logger.Get().Error("medicine-seed: failed", "error", err)
		os.Exit(1)
	}

	logger.Get().Info("medicine-seed: complete", "count", count)
	fmt.Printf("medicine-seed: upserted %d concepts into the local index\n", count)
}
