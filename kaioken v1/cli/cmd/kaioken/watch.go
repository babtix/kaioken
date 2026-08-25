package main

import (
	"context"
	"fmt"
	"time"

	"kaioken/internal/watch"
)

// cmdWatch polls the working tree and prints a line whenever new changed
// paths appear — a lightweight drift alarm for long editing sessions.
func cmdWatch(ctx context.Context, f flags) error {
	interval := time.Duration(f.interval) * time.Second
	if interval <= 0 {
		interval = 5 * time.Second
	}
	fmt.Printf("· watching %s every %s — Ctrl+C to stop\n", f.repo, interval)
	err := watch.Run(ctx, f.repo, interval, func(msg string) {
		fmt.Println(msg)
	})
	if err == context.Canceled || err == context.DeadlineExceeded {
		return nil
	}
	return err
}
