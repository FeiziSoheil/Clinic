// Package main is the entry point of the Clinic API application.
//
// Swagger metadata declarations used by swaggo/swag to generate API docs.
//
// @title        Clinic API
// @version      1.0
// @description  Advanced Clinic Appointment System API
// @host         localhost:8080
// @BasePath     /api/v1
// @securityDefinitions.apikey ApiKeyAuth
// @in           header
// @name         Authorization
package main

import "clinic-api/cmd/clinic-api/bootstrap"

// main delegates to bootstrap.RunApp which wires the full dependency graph,
// registers routes and serves the API with graceful shutdown.
func main() {
	bootstrap.RunApp()
}
