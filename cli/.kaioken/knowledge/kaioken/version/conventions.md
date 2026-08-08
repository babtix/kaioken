Exported variables that must be overridable via build flags are declared as vars (not const).
Exported constants are used for immutable values such as the API contract version.
Exported identifiers use camelCase (Version, ContractVersion).
Package name matches its directory (version).
File includes a package comment describing its purpose and usage.
No external libraries are imported; the file relies only on the Go standard library.
