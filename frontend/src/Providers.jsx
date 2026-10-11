import { AuthProvider } from './auth/AuthProvider.jsx';
import { ToastProvider } from './components/ui/ToastProvider.jsx';
import { ThemeProvider } from './theme/ThemeProvider.jsx';

export function Providers({ children }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
