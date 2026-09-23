package sample

import "fmt"

// Add returns the sum of a and b.
// It exists so the fixture has a two-line doc comment.
func Add(a, b int) int {
	return a + b
}

func unexported(x int) int {
	return x
}

// Shape is the interface every renderable implements.
type Shape interface {
	Area() float64
}

// Rect is a rectangle.
type Rect struct {
	W float64
	H float64
}

// Area implements Shape.
func (r Rect) Area() float64 {
	return r.W * r.H
}

const Pi = 3.14159

var Registry = map[string]Shape{}

type Alias = string

// Kind classifies a declaration.
type Kind string

const (
	KindFunc Kind = "func"
	KindType Kind = "type"
)
