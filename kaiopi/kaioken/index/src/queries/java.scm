; Java declarations. Capture convention is documented in go.scm.

(class_declaration
  name: (identifier) @name) @decl.class

(interface_declaration
  name: (identifier) @name) @decl.interface

(enum_declaration
  name: (identifier) @name) @decl.enum

(record_declaration
  name: (identifier) @name) @decl.class

(annotation_type_declaration
  name: (identifier) @name) @decl.interface

(method_declaration
  name: (identifier) @name) @decl.method

(constructor_declaration
  name: (identifier) @name) @decl.method

(field_declaration
  (variable_declarator
    name: (identifier) @name)) @decl.var
