Exported version variables must be declared as var (not const) to allow -ldflags override.
Exported contract version must be declared as const because it is compile‑time only.
Variable name must be Version (capital V) and constant name must be ContractVersion.
When releasing a new build, manually update the Version string in version.go.
When making a breaking change to any /v1 API endpoint, increment ContractVersion.
Do not add initialization logic or dependencies to this package; keep it side‑effect free.
