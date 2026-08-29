; Go declarations.
;
; Capture convention, shared by every language in this package:
;   @decl.<kind>  the whole declaration node — supplies the line range
;   @name         the identifier — supplies the symbol name
;
; Nothing else is captured. Signature, doc and export status are derived in
; extract.ts from the declaration node, so a new language never has to restate
; that logic in its query.

(function_declaration name: (identifier) @name) @decl.function

(method_declaration name: (field_identifier) @name) @decl.method

(type_spec
  name: (type_identifier) @name
  type: (struct_type)) @decl.struct

(type_spec
  name: (type_identifier) @name
  type: (interface_type)) @decl.interface

; Captures sit on the individual spec rather than the enclosing declaration, so
; that each member of a grouped `const ( ... )` block gets its own line range.
; signatureOf widens a lone spec back to its declaration to keep the keyword.
;
; Any remaining type_spec is an alias or a named type over some other type.
(type_spec
  name: (type_identifier) @name
  type: [
    (type_identifier)
    (qualified_type)
    (pointer_type)
    (map_type)
    (slice_type)
    (array_type)
    (function_type)
    (channel_type)
  ]) @decl.type

(const_spec name: (identifier) @name) @decl.const

(var_spec name: (identifier) @name) @decl.var

; `type Alias = string` is a distinct node from a named type declaration.
(type_alias name: (type_identifier) @name) @decl.type
