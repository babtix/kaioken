; TypeScript and TSX declarations. Capture convention is documented in go.scm.
;
; `export` is not captured: extract.ts walks ancestors for an export_statement,
; which also catches `export default` and re-export forms a query would miss.

(function_declaration name: (identifier) @name) @decl.function

(generator_function_declaration name: (identifier) @name) @decl.function

(class_declaration name: (type_identifier) @name) @decl.class

(interface_declaration name: (type_identifier) @name) @decl.interface

(type_alias_declaration name: (type_identifier) @name) @decl.type

(enum_declaration name: (identifier) @name) @decl.enum

(method_signature name: (property_identifier) @name) @decl.method

(method_definition name: (property_identifier) @name) @decl.method

(public_field_definition name: (property_identifier) @name) @decl.var

; Top-level bindings only. `const x = () => {}` is the dominant function form in
; modern TypeScript, so omitting it would leave holes in the skeleton exactly
; where the logic lives.
;
; The `(program ...)` wrapper restricts these to top level; the capture sits on
; the declaration itself so the recorded line range is the declaration's, not
; the whole file's.
(program
  (lexical_declaration
    (variable_declarator name: (identifier) @name)) @decl.const)

(program
  (variable_declaration
    (variable_declarator name: (identifier) @name)) @decl.var)

(program
  (export_statement
    (lexical_declaration
      (variable_declarator name: (identifier) @name)) @decl.const))

(program
  (export_statement
    (variable_declaration
      (variable_declarator name: (identifier) @name)) @decl.var))
