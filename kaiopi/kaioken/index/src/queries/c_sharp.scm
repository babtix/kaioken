; C# declarations. Capture convention is documented in go.scm.

(class_declaration
  name: (identifier) @name) @decl.class

(interface_declaration
  name: (identifier) @name) @decl.interface

(struct_declaration
  name: (identifier) @name) @decl.struct

(enum_declaration
  name: (identifier) @name) @decl.enum

(method_declaration
  name: (identifier) @name) @decl.method

(constructor_declaration
  name: (identifier) @name) @decl.method

(property_declaration
  name: (identifier) @name) @decl.var

(field_declaration
  (variable_declarator (identifier) @name)) @decl.var

(delegate_declaration
  name: (identifier) @name) @decl.type

(namespace_declaration
  name: [
    (identifier) @name
    (qualified_name) @name
  ]) @decl.module
