package codemap

import (
	"go/ast"
	"go/parser"
	"go/token"
	"strconv"
	"strings"
)

// parseGo uses the real Go parser, which gives exact line ranges. A file that
// does not compile (mid-edit, or a template) falls back to the line-based
// parser rather than yielding nothing.
func parseGo(fm *FileMap, content string) {
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, fm.Path, content, parser.ParseComments|parser.SkipObjectResolution)
	if err != nil {
		parseCLike(fm, content)
		return
	}
	if file.Name != nil {
		fm.Package = file.Name.Name
	}
	for _, imp := range file.Imports {
		if imp.Path == nil {
			continue
		}
		if p, uerr := strconv.Unquote(imp.Path.Value); uerr == nil {
			fm.Imports = append(fm.Imports, p)
		}
	}

	line := func(p token.Pos) int { return fset.Position(p).Line }

	for _, decl := range file.Decls {
		switch d := decl.(type) {
		case *ast.FuncDecl:
			sym := Symbol{
				Name:      d.Name.Name,
				Kind:      KindFunc,
				Line:      line(d.Pos()),
				EndLine:   line(d.End()),
				Exported:  d.Name.IsExported(),
				Signature: goFuncSignature(d, content, fset),
			}
			if d.Recv != nil && len(d.Recv.List) > 0 {
				sym.Kind = KindMethod
				sym.Receiver = goTypeString(d.Recv.List[0].Type)
			}
			if d.Doc != nil && len(d.Doc.List) > 0 {
				sym.Doc = strings.TrimSpace(strings.TrimPrefix(d.Doc.List[0].Text, "//"))
			}
			fm.Symbols = append(fm.Symbols, sym)

		case *ast.GenDecl:
			for _, spec := range d.Specs {
				switch s := spec.(type) {
				case *ast.TypeSpec:
					kind := KindType
					if _, ok := s.Type.(*ast.InterfaceType); ok {
						kind = KindInterface
					}
					sym := Symbol{
						Name:      s.Name.Name,
						Kind:      kind,
						Line:      line(s.Pos()),
						EndLine:   line(s.End()),
						Exported:  s.Name.IsExported(),
						Signature: "type " + s.Name.Name + " " + goTypeKeyword(s.Type),
					}
					if d.Doc != nil && len(d.Doc.List) > 0 {
						sym.Doc = strings.TrimSpace(strings.TrimPrefix(d.Doc.List[0].Text, "//"))
					}
					fm.Symbols = append(fm.Symbols, sym)

				case *ast.ValueSpec:
					kind := KindVar
					if d.Tok == token.CONST {
						kind = KindConst
					}
					for _, name := range s.Names {
						if name.Name == "_" {
							continue
						}
						fm.Symbols = append(fm.Symbols, Symbol{
							Name:      name.Name,
							Kind:      kind,
							Line:      line(name.Pos()),
							EndLine:   line(s.End()),
							Exported:  name.IsExported(),
							Signature: string(kind) + " " + name.Name,
						})
					}
				}
			}
		}
	}
}

// goFuncSignature recovers the declaration text up to the opening brace, which
// is more informative than reconstructing it from the AST.
func goFuncSignature(d *ast.FuncDecl, content string, fset *token.FileSet) string {
	start := fset.Position(d.Pos()).Offset
	end := len(content)
	if d.Body != nil {
		end = fset.Position(d.Body.Lbrace).Offset
	} else if d.Type != nil {
		end = fset.Position(d.Type.End()).Offset
	}
	if start < 0 || end > len(content) || start >= end {
		return "func " + d.Name.Name
	}
	sig := strings.Join(strings.Fields(content[start:end]), " ")
	return trimSig(sig)
}

func goTypeKeyword(expr ast.Expr) string {
	switch expr.(type) {
	case *ast.StructType:
		return "struct"
	case *ast.InterfaceType:
		return "interface"
	case *ast.FuncType:
		return "func"
	case *ast.MapType:
		return "map"
	case *ast.ArrayType:
		return "slice/array"
	default:
		return goTypeString(expr)
	}
}

func goTypeString(expr ast.Expr) string {
	switch t := expr.(type) {
	case *ast.Ident:
		return t.Name
	case *ast.StarExpr:
		return "*" + goTypeString(t.X)
	case *ast.SelectorExpr:
		return goTypeString(t.X) + "." + t.Sel.Name
	case *ast.IndexExpr: // generic instantiation
		return goTypeString(t.X)
	default:
		return "?"
	}
}
