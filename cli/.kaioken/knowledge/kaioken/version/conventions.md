Use a package-level var (not const) for Version to permit override via -ldflags.
Keep ContractVersion as a const because it is compile‑time only and never overridden.
Export both identifiers with PascalCase (Version, ContractVersion).
Document the purpose and override mechanism in package‑level comments.
Do not add init() functions or side‑effects; the package is purely data.
Consumers should import "kaioken/internal/version" and access the fields directly.
