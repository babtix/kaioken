# Running Tests

This chapter describes how to execute the test suite and interpret test results for the kaioken project. The project uses a Makefile to define common development tasks including testing, static analysis, linting, building, and cleaning.

## Table of Contents
- [Running Unit Tests](#running-unit-tests)
- [Running Static Analysis (vet)](#running-static-analysis-vet)
- [Running Linting (golangci-lint)](#running-linting-golangci-lint)
- [Building the Project](#building-the-project)
- [Cleaning Build Artifacts](#cleaning-build-artifacts)
- [Running All Checks (test + vet)](#running-all-checks-test--vet)
- [Interpreting Test Results](#interpreting-test-results)
- [Common Issues and Troubleshooting](#common-issues-and-troubleshooting)
- [Referenced Files](#referenced-files)

## Running Unit Tests

Execute all unit tests in the project using the `test` target:

`Makefile:3-5`

```makefile
## test: run all unit tests
test:
	go test ./... -count=1
```

This runs `go test ./... -count=1` which discovers and executes all test files in the current directory and subdirectories. The `-count=1` flag disables test caching to ensure tests run fresh each time. Test output includes:
- Package names being tested
- Individual test results (PASS/FAIL)
- Coverage statistics if `-cover` is used (not enabled by default in this target)
- Benchmark results if any benchmarks exist

## Running Static Analysis (vet)

Execute Go's static analysis tool using the `vet` target:

`Makefile:7-9`

```makefile
## vet: run go vet static analysis
vet:
	go vet ./...
```

This runs `go vet ./...` which examines Go source code and reports suspicious constructs, such as:
- Printf calls with mismatched arguments
- Unreachable code
- Empty loop bodies
- Incorrect mutex locking
- JSON struct tag issues

## Running Linting (golangci-lint)

Execute project linting using the `lint` target. This target first checks if `golangci-lint` is installed:

`Makefile:11-14`

```makefile
## lint: run golangci-lint (if installed)
lint:
	@command -v golangci-lint >/dev/null 2>&1 || { echo "golangci-lint not installed; skipping"; exit 0; }
	golangci-lint run ./...
```

If `golangci-lint` is not found in the PATH, the target prints a message and exits successfully (exit code 0). If installed, it runs `golangci-lint run ./...` which executes a suite of linters configured by default (or via `.golangci.yml` if present). Common issues detected include:
- Code style violations
- Potential bugs
- Performance issues
- Security concerns
- Unused imports/variables

## Building the Project

Compile the binary using the `build` target:

`Makefile:19-22`

```makefile
## build: compile the binary
build:
	go build ./...
	go build -o kaioken.exe ./cmd/kaioken
```

This runs two commands:
1. `go build ./...` builds all packages in the current directory and subdirectories
2. `go build -o kaioken.exe ./cmd/kaioken` builds the main application and outputs it as `kaioken.exe` (Windows executable naming convention)

## Cleaning Build Artifacts

Remove build artifacts using the `clean` target:

`Makefile:24-26`

```makefile
## clean: remove build artifacts
clean:
	@rm -f kaioken.exe 2>/dev/null || del kaioken.exe 2>nul || true
```

This attempts to remove the `kaioken.exe` file using platform-appropriate commands:
- `rm -f` for Unix-like systems (silently ignores if file doesn't exist)
- `del` for Windows (silently ignores if file doesn't exist)
The `|| true` ensures the target always exits successfully.

## Running All Checks (test + vet)

Execute both unit tests and static analysis using the `check` target:

`Makefile:16-17`

```makefile
## check: run all verification gates (test + vet)
check: test vet
```

This target runs `make test` followed by `make vet` sequentially. If either command fails (non-zero exit code), the `check` target fails immediately.

## Interpreting Test Results

### Successful Test Run
A successful test run shows output similar to:
```
?   	module1	[no test files]
ok  	module2	0.123s
ok  	module3	0.045s
```
- `ok` indicates all tests in the package passed
- `[no test files]` indicates the package has no `_test.go` files
- The time shows test execution duration
- Overall exit code is 0

### Failed Unit Tests
When tests fail, output includes:
```
--- FAIL: TestExample (0.00s)
    example_test.go:10: 
		Error trace: 
		    example_test.go:10: 
		Error:  
		    Not equal: 
		    expected: 2
		    actual:   1
		Test:         TestExample
FAIL
exit status 1
FAIL	module/submodule	0.023s
```
- `--- FAIL:` marks the beginning of a failed test
- The error description shows what went wrong
- `FAIL` at the end indicates the package had failing tests
- Overall exit code is non-zero (typically 1)

### Vet Failures
Vet output shows suspicious code constructs:
```
# module/submodule
file.go:15:6: Printf call with format %s but arg 2 has type int (string expected)
```
- Each violation shows file, line, and column
- Descriptive message explains the issue
- Overall exit code is non-zero if any issues found

### Linting Failings
Golangci-lint output varies by linter but typically shows:
```
file.go:10:5: exported function Abc should have comment or be unexported (golint)
file.go:22:1: error return value not checked (errcheck)
```
- Each line shows file, line, column, linter name, and description
- Overall exit code is non-zero if any linter reports issues

## Common Issues and Troubleshooting

### "golangci-lint not installed; skipping"
This message from the `lint` target indicates the linter isn't available in your PATH. To install:
```bash
# Using Go
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest

# Or via package manager (example for Ubuntu)
sudo apt-get install golangci-lint
```

### Test Timeout
If tests hang, increase the timeout:
```bash
go test ./... -timeout 30m
```
Add `-timeout` flag to the test command in the Makefile if persistent issues occur.

### Race Conditions
Enable race detector for tests:
```bash
go test ./... -race
```
Modify the Makefile test target to include `-race` if concurrency issues are suspected.

### Specific Package Testing
To test only a specific package:
```bash
go test ./path/to/package
```
Or modify the Makefile test target temporarily:
```makefile
test:
	go test ./path/to/package/...
```

### Verbose Test Output
For detailed test logging:
```bash
go test ./... -v
```
Add `-v` flag to see individual test names and logs.

## Referenced Files
- Makefile

--- 
*Documentation based on Makefile definitions. All commands assume standard Go toolchain availability.*

<!-- kaioken:files Makefile -->
