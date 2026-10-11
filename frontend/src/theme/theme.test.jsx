import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockPrefersDark } from '../test/setup.js';
import { useTheme } from './ThemeContext.js';
import { ThemeProvider } from './ThemeProvider.jsx';

function Probe() {
  const { theme, resolved, setTheme } = useTheme();
  return (
    <div>
      <p>
        {theme}/{resolved}
      </p>
      <button onClick={() => setTheme('dark')}>dark</button>
      <button onClick={() => setTheme('light')}>light</button>
      <button onClick={() => setTheme('system')}>system</button>
    </div>
  );
}

const renderProbe = () =>
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );

describe('ThemeProvider', () => {
  it('follows the operating system by default', () => {
    mockPrefersDark(true);
    renderProbe();
    expect(screen.getByText('system/dark')).toBeInTheDocument();
    expect(document.documentElement).toHaveClass('dark');
  });

  it('applies and remembers an explicit choice', async () => {
    const user = userEvent.setup();
    renderProbe();
    await user.click(screen.getByText('dark'));
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem('theme')).toBe('dark');

    await user.click(screen.getByText('light'));
    expect(document.documentElement).not.toHaveClass('dark');
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('restores the saved choice on the next visit', () => {
    localStorage.setItem('theme', 'dark');
    renderProbe();
    expect(screen.getByText('dark/dark')).toBeInTheDocument();
  });

  it('ignores invalid saved values', () => {
    localStorage.setItem('theme', 'purple');
    renderProbe();
    expect(screen.getByText('system/light')).toBeInTheDocument();
  });
});
