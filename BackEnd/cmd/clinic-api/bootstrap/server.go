package bootstrap

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"clinic-api/pkg/logger"
)

// RunApp is the application entry point invoked by main. It assembles the
// dependency graph, starts the HTTP server in a goroutine and blocks until the
// process receives an interrupt/SIGTERM, at which point it drains the server
// and closes the mongo connection within a bounded grace period.
func RunApp() {
	app, err := NewApp()
	if err != nil {
		log.Fatalf("bootstrap: failed to initialize application: %v", err)
	}

	// Listen for interrupt (Ctrl-C) and SIGTERM (container orchestrators).
	shutdownCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Start serving in the background so the main goroutine can wait on the
	// shutdown signal. echo.Start blocks until the server stops; any error it
	// returns (other than on Shutdown) is logged.
	go func() {
		logger.Get().Info("server starting", "port", app.cfg.Port)
		if err := app.echo.Start(":" + app.cfg.Port); err != nil {
			logger.Get().Error("server stopped", "error", err)
		}
	}()

	// Block until a shutdown signal arrives.
	<-shutdownCtx.Done()
	logger.Get().Info("shutdown signal received, draining server")

	// Allow up to 10s for in-flight requests to complete before forcing exit.
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := app.echo.Shutdown(ctx); err != nil {
		logger.Get().Error("graceful shutdown of http server failed", "error", err)
	}

	// Release the mongo connection pool.
	if app.mongoClient != nil {
		if err := app.mongoClient.Disconnect(ctx); err != nil {
			logger.Get().Error("mongo disconnect failed", "error", err)
		}
	}

	// Close the Redis connection pool used by the OTP store.
	if app.redisClient != nil {
		if err := app.redisClient.Close(); err != nil {
			logger.Get().Error("redis disconnect failed", "error", err)
		}
	}

	logger.Get().Info("server exited cleanly")
}
