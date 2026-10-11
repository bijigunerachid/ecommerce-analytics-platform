import { AuthProvider } from './auth/AuthProvider.jsx';
import { ThemeProvider } from './theme/ThemeProvider.jsx';

export function Providers({ children }) {
  return (
    <ThemeProvider>
      <AuthProvider>{children}</AuthProvider>
    </ThemeProvider>
  );
}
