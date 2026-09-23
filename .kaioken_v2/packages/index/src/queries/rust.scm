; Rust declarations. Capture convention is documented in go.scm.

(function_item name: (identifier) @name) @decl.function

(struct_item name: (type_identifier) @name) @decl.struct

(enum_item name: (type_identifier) @name) @decl.enum

(trait_item name: (type_identifier) @name) @decl.trait

(type_item name: (type_identifier) @name) @decl.type

(const_item name: (identifier) @name) @decl.const

(static_item name: (identifier) @name) @decl.var

; A trait method signature is a declaration in its own right — it is the
; contract the impl blocks satisfy.
(function_signature_item name: (identifier) @name) @decl.method

; `impl Trait for Type` — named by its type, so the skeleton shows where a
; type's behaviour is defined.
(impl_item type: (type_identifier) @name) @decl.impl
