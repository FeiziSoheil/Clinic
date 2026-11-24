// This file implements the default-admin database seeder. It is intentionally
// kept separate from the entity/service definitions so the seeding concern is
// easy to locate and disable. The seeder is invoked once during bootstrap
// (see cmd/clinic-api/bootstrap/app.go) to guarantee a known administrative
// account exists the first time the application boots against an empty
// database.
package user

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"golang.org/x/crypto/bcrypt"

	"clinic-api/pkg/database"
	"clinic-api/pkg/logger"
)

// SeedDefaultAdmin ensures that at least one ADMIN user exists in the database.
//
// It first queries the users collection for any document whose role is ADMIN;
// if one already exists the function returns nil without making changes. If no
// admin exists it hashes the supplied password with bcrypt and inserts a new
// RoleAdmin user with the given phone number, the supplied login username and a
// freshly generated ObjectID.
//
// The bootstrap caller wraps any returned error in best-effort logging so a
// seeding failure never aborts application startup.
func SeedDefaultAdmin(ctx context.Context, repo *database.Repository[User], phone, username, password string) error {
	// Look for an existing admin. A nil error returned alongside a non-nil
	// document means one already exists and we have nothing to do.
	existing, err := repo.FindOne(ctx, bson.M{"role": string(RoleAdmin)})
	if err != nil && err != database.ErrNotFound {
		// An infrastructure error here is non-fatal for seeding; surface it so
		// the caller can log a warning, but do not invent an admin blindly.
		return err
	}
	if existing != nil {
		logger.Get().Info("seeder: admin already exists; skipping default admin creation", "id", existing.ID.Hex())
		return nil
	}

	// Hash the bootstrap password with bcrypt's default cost.
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	now := time.Now()
	admin := User{
		ID:    primitive.NewObjectID(),
		Phone: phone,
		// Staff authenticate by username + password, so the seeded admin needs a
		// username to be able to log in. Normalize it (lower-case/trim) to match
		// the storage form used by the staff-creation paths.
		Username:     normalizeUsername(username),
		PasswordHash: string(hash),
		Role:         RoleAdmin,
		FirstName:    "Default",
		LastName:     "Admin",
		NationalCode: "0000000000",
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	id, err := repo.Insert(ctx, admin)
	if err != nil {
		return err
	}
	admin.ID = id

	logger.Get().Info("seeder: default admin created", "id", admin.ID.Hex(), "phone", phone, "username", admin.Username)
	return nil
}
