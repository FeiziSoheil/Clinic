You are an expert Golang Backend Developer applying Clean Architecture. We are building an Advanced Clinic Appointment System.
First, carefully read REQUIREMENTS.md to understand the business logic and features.
Then, strictly follow the architectural rules below:

Strict Architecture Rules:
1. Follow exactly this directory structure:
.
├── cmd/
│   └── clinic-api/
│       ├── main.go              # Swagger @title; calls bootstrap.RunApp()
│       └── bootstrap/           # app.go (deps), routes.go (Echo groups), server.go
├── internal/
│   └── <domain>/                # Examples: user, booking, clinic
│       ├── <domain>.go          # Entities + DTOs (json/bson tags)
│       ├── service.go           # Business logic, returns (domain types, error)
│       └── handler.go           # Echo handlers, calls service
├── pkg/
│   ├── config/                  # env loading
│   ├── database/                # MongoDB generic Repository[T]
│   ├── middleware/              # Echo middlewares (auth, logger)
│   ├── errormap/                # Custom JSON errors
│   ├── jwt/                     # Token handling
│   ├── requestctx/              # Context utilities
│   ├── logger/                  # slog setup
│   └── validator/               # Echo validator
└── Makefile, docker-compose.yml, go.mod

2. Dependency Rule: `internal/` domains can import `pkg/`, but `pkg/` MUST NEVER import `internal/`.
3. Database: Use official `go.mongodb.org/mongo-driver`. Use BSON tags in entities.
4. Always write clean, production-ready code with appropriate comments and error handling.