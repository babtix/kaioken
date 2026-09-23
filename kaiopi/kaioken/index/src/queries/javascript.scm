; JavaScript and JSX declarations. Capture convention is documented in go.scm.

(function_declaration name: (identifier) @name) @decl.function

(generator_function_declaration name: (identifier) @name) @decl.function

(class_declaration name: (identifier) @name) @decl.class

(method_definition name: (property_identifier) @name) @decl.method

(field_definition property: (property_identifier) @name) @decl.var

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
