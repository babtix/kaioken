.PHONY: test vet lint check build clean

## test: run all unit tests
test:
	go test ./... -count=1

## vet: run go vet static analysis
vet:
	go vet ./...

## lint: run golangci-lint (if installed)
lint:
	@command -v golangci-lint >/dev/null 2>&1 || { echo "golangci-lint not installed; skipping"; exit 0; }
	golangci-lint run ./...

## check: run all verification gates (test + vet)
check: test vet

## build: compile the binary
build:
	go build ./...
	go build -o kaioken.exe ./cmd/kaioken

## clean: remove build artifacts
clean:
	@rm -f kaioken.exe 2>/dev/null || del kaioken.exe 2>nul || true
