package main

import (
	"context"
	"log"
	"os"

	"github.com/benebsworth/acacia/backend/pro/internal/smoke"
)

func main() {
	if err := smoke.Run(context.Background(), smoke.Config{
		BaseURL:          os.Getenv("ACACIA_PRO_BASE_URL"),
		FirebaseIDToken:  os.Getenv("ACACIA_FIREBASE_ID_TOKEN"),
		AdminToken:       os.Getenv("ACACIA_ADMIN_TOKEN"),
		AdminFirebaseUID: os.Getenv("ACACIA_SMOKE_FIREBASE_UID"),
		AdminEmail:       os.Getenv("ACACIA_SMOKE_EMAIL"),
	}); err != nil {
		log.Fatal(err)
	}

	log.Print("acacia pro backend smoke checks passed")
}

