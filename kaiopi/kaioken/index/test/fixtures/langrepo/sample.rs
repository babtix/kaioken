//! Crate docs.

/// Adds two numbers.
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

fn private_helper(x: i32) -> i32 {
    x
}

/// A rectangle.
pub struct Rect {
    pub w: f64,
    pub h: f64,
}

pub trait Shape {
    fn area(&self) -> f64;
}

impl Shape for Rect {
    fn area(&self) -> f64 {
        self.w * self.h
    }
}

pub enum Kind {
    Round,
    Square,
}

pub const MAX: i32 = 9;

type Alias = i32;
