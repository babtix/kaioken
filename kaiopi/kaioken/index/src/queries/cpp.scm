; C++ declarations. Capture convention is documented in go.scm.

(function_definition
  declarator: [
    (function_declarator declarator: (identifier) @name)
    (function_declarator declarator: (field_identifier) @name)
    (function_declarator declarator: (qualified_identifier) @name)
    (pointer_declarator declarator: (function_declarator declarator: (identifier) @name))
    (pointer_declarator declarator: (function_declarator declarator: (field_identifier) @name))
  ]) @decl.function

(class_specifier
  name: (type_identifier) @name) @decl.class

(struct_specifier
  name: (type_identifier) @name
  body: (field_declaration_list)) @decl.struct

(union_specifier
  name: (type_identifier) @name
  body: (field_declaration_list)) @decl.struct

(enum_specifier
  name: (type_identifier) @name) @decl.enum

(alias_declaration
  name: (type_identifier) @name) @decl.type

(type_definition
  declarator: (type_identifier) @name) @decl.type

(namespace_definition
  name: (namespace_identifier) @name) @decl.module

(field_declaration
  declarator: [
    (function_declarator declarator: (field_identifier) @name)
    (field_identifier) @name
  ]) @decl.var
