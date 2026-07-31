Package name must be "version".
Export the build version as a var (Version) to allow ldflags override; do not make it a const.
Export the API contract version as a const integer (ContractVersion).
Document Version with a comment explaining manual bumping and ldflags override usage.
Document ContractVersion with a comment describing when it should be bumped and the associated API changes.
Use PascalCase for exported identifiers.
Do not add init() functions or unnecessary dependencies; rely on zero‑initialization.
No error handling is required for this package.
