import { AuthProvider } from './auth/AuthProvider.jsx';
import { ToastProvider } from './components/ui/ToastProvider.jsx';
import { RealtimeProvider } from './realtime/RealtimeProvider.jsx';
import { ThemeProvider } from './theme/ThemeProvider.jsx';

export function Providers({ children }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <RealtimeProvider>{children}</RealtimeProvider>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
