import React, { useState, useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Moon, Sun, Menu, X } from 'lucide-react';

export const Header: React.FC = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const root = document.documentElement;
    const initial = (root.dataset.theme as 'dark' | 'light') || 'dark';
    setTheme(initial);

    const handleScroll = () => {
      setScrolled(window.scrollY > 8);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('kaioken-theme', next);
    } catch {
      // storage unavailable
    }
  };

  const navLinks = [
    { to: '/', label: 'Home', end: true },
    { to: '/desktop', label: 'Desktop' },
    { to: '/docs', label: 'Docs' },
    { to: '/preview', label: 'Output' },
    { to: '/showcase', label: 'Showcase' },
    { to: '/next', label: 'Next' },
  ];

  return (
    <header className={`hdr ${scrolled || mobileOpen ? 'is-scrolled' : ''}`}>
      <div className="hdr-in wrap">
        <Link to="/" className="brand" aria-label="Kaioken home">
          <img
            src="/kaioken-logo.png"
            alt="KAIOKEN"
            className="k-pixel-logo brand-logo-img"
          />
          <span className="brand-ver mono">v2.0.0</span>
        </Link>

        <nav className="nav" aria-label="Navigation">
          {navLinks.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-a ${isActive ? 'is-active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="hdr-right">
          <a
            href="https://github.com/babtix/kaioken"
            className="nav-a nav-a--ext mono"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <button
            type="button"
            className="tgl"
            onClick={toggleTheme}
            aria-label="Toggle colour theme"
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <Link to="/docs/install" className="btn btn--primary btn--sm">
            Get started
          </Link>
          <button
            type="button"
            className="tgl md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle mobile navigation"
            style={{ display: 'none' }}
          >
            {mobileOpen ? <X size={14} /> : <Menu size={14} />}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <nav
          className="wrap md:hidden"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            paddingBlock: '12px 16px',
            borderTop: 'var(--hair) solid var(--rule)',
            background: 'var(--bg-raise)',
          }}
        >
          {navLinks.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-a ${isActive ? 'is-active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
          <a
            href="https://github.com/babtix/kaioken"
            className="nav-a nav-a--ext mono"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub ↗
          </a>
        </nav>
      ) : null}
    </header>
  );
};

export default Header;
