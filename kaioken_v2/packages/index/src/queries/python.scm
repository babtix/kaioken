; Python declarations. Capture convention is documented in go.scm.
;
; Methods are not distinguished here — extract.ts marks a function whose nearest
; enclosing declaration is a class as a method, which is one rule rather than a
; second query per language.

(function_definition name: (identifier) @name) @decl.function

(class_definition name: (identifier) @name) @decl.class

; Module-level assignment only. An assignment inside a function body is a local,
; not a declaration, and indexing locals would drown the skeleton. The capture
; sits on the statement so the line range is the statement's, not the module's.
(module
  (expression_statement
    (assignment
      left: (identifier) @name)) @decl.var)
