; Ruby declarations. Capture convention is documented in go.scm.

(method
  name: (identifier) @name) @decl.method

(singleton_method
  name: (identifier) @name) @decl.method

(class
  name: [
    (constant) @name
    (scope_resolution) @name
  ]) @decl.class

(module
  name: [
    (constant) @name
    (scope_resolution) @name
  ]) @decl.module

(assignment
  left: (constant) @name) @decl.const
