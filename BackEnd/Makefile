# =============================================================================
# Clinic API - Makefile
# Common development tasks for the Advanced Clinic Appointment System.
# =============================================================================

# Binary output path.
BINARY=bin/clinic-api

.PHONY: run build swagger docker-up seed-medicines

# Run the API server locally via `go run`.
run:
	go run cmd/clinic-api/main.go

# Compile a production binary into ./bin.
build:
	go build -o $(BINARY) ./cmd/clinic-api/

# (Re)generate Swagger documentation from source annotations.
swagger:
	swag init -g cmd/clinic-api/main.go -o docs

# Start the local infrastructure (MongoDB + Redis) in detached mode.
docker-up:
	docker compose up -d

# Seed/refresh the local medicine index from RxNorm (idempotent; safe to re-run).
seed-medicines:
	go run cmd/medicine-seed/main.go
