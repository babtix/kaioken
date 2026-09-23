; C declarations. Capture convention is documented in go.scm.

(function_definition
  declarator: [
    (function_declarator declarator: (identifier) @name)
    (pointer_declarator declarator: (function_declarator declarator: (identifier) @name))
  ]) @decl.function

(struct_specifier
  name: (type_identifier) @name
  body: (field_declaration_list)) @decl.struct

(union_specifier
  name: (type_identifier) @name
  body: (field_declaration_list)) @decl.struct

(enum_specifier
  name: (type_identifier) @name) @decl.enum

(type_definition
  declarator: (type_identifier) @name) @decl.type

(declaration
  declarator: (identifier) @name) @decl.var
