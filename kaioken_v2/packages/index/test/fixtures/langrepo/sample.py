"""Module docstring, not attached to any declaration."""


def add(a, b):
    """Return the sum of a and b."""
    return a + b


def _private(x):
    return x


class Rect:
    """A rectangle."""

    def area(self):
        """Compute the area."""
        return self.w * self.h

    def _hidden(self):
        return None


MAX_SIZE = 4096
