import { BrowserRouter } from 'react-router-dom';
import { MockIdentityProvider } from './context/MockIdentityContext';
import AppRoutes from './routes/AppRoutes';

export default function App() {
  return (
    <MockIdentityProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </MockIdentityProvider>
  );
}
